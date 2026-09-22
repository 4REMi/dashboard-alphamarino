"use client"

import { useEffect, useRef, useState } from "react"
import { startExtractScript, pollExtractScript } from "@/lib/actions/ad-clone"
import { X, Loader2, Copy, Check, AlertCircle, FileText } from "lucide-react"

interface Props {
  videoUrl: string
  titulo?: string | null
  onClose: () => void
}

// Solo transcribe el video y muestra el guión original tal cual — sin
// elegir marca ni ángulo, sin adaptación de Claude. Para cuando lo único
// que se necesita es "¿qué dice este video?", no una versión reescrita.
export function ExtractScriptModal({ videoUrl, titulo, onClose }: Props) {
  const [status, setStatus] = useState<"starting" | "processing" | "completed" | "error">("starting")
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const transcriptIdRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    startExtractScript(videoUrl)
      .then(({ transcriptId }) => {
        if (cancelled) return
        transcriptIdRef.current = transcriptId
        setStatus("processing")
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : "No se pudo iniciar la transcripción")
        setStatus("error")
      })
    return () => { cancelled = true }
  }, [videoUrl])

  useEffect(() => {
    if (status !== "processing") return
    const interval = setInterval(async () => {
      const id = transcriptIdRef.current
      if (!id) return
      try {
        const result = await pollExtractScript(id)
        if (result.status === "completed") {
          setText(result.text ?? "")
          setStatus("completed")
          clearInterval(interval)
        } else if (result.status === "error") {
          setError(result.error ?? "Error de transcripción")
          setStatus("error")
          clearInterval(interval)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al consultar la transcripción")
        setStatus("error")
        clearInterval(interval)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [status])

  function handleCopy() {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-background rounded-2xl border border-border shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Extraer script</h3>
              {titulo && <p className="text-xs text-muted-foreground truncate">{titulo}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {(status === "starting" || status === "processing") && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Transcribiendo video…</p>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <AlertCircle className="w-5 h-5 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {status === "completed" && (
            text.trim() ? (
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{text}</p>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No se detectó audio hablado en este video.</p>
            )
          )}
        </div>

        {status === "completed" && text.trim() && (
          <div className="flex items-center justify-end px-5 py-3 border-t border-border flex-shrink-0">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-border hover:bg-muted transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copiado" : "Copiar guión"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
