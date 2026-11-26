"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ScanSearch } from "lucide-react"
import { analyzeAuditCreative } from "@/lib/actions/ad-audits"

// Analiza por partes (gancho/cuerpo/cierre) los creativos que aún no lo
// están. Uno por video: los anuncios que comparten video cuentan una vez.
// Corre desde el navegador de 2 en 2 (cada análisis es una llamada de hasta
// ~2 min); si se cierra la pestaña, lo ya analizado queda guardado.
export function AnalyzePartsButton({ pending }: { pending: { adId: string; key: string }[] }) {
  const router = useRouter()
  const unique = [...new Map(pending.map((p) => [p.key, p])).values()]
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [errors, setErrors] = useState<string[]>([])

  if (unique.length === 0 && !running) return null

  const run = async () => {
    setRunning(true); setDone(0); setErrors([])
    const queue = [...unique]
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        try {
          const r = await analyzeAuditCreative(item.adId)
          if (!r.ok) setErrors((e) => [...e, r.error ?? "Falló"])
        } catch (e) {
          setErrors((x) => [...x, e instanceof Error ? e.message : "Falló"])
        }
        setDone((d) => d + 1)
      }
    }
    await Promise.all([worker(), worker()])
    setRunning(false)
    router.refresh()
  }

  const minutes = Math.max(1, Math.round((unique.length * 1.2) / 2))
  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={run} disabled={running}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
        <ScanSearch className="h-4 w-4" />
        {running ? `Analizando ${done}/${unique.length}…` : `Analizar partes de ${unique.length} creativo${unique.length === 1 ? "" : "s"} · ~${minutes} min`}
      </button>
      {running && <span className="text-xs text-muted-foreground">No cierres esta pestaña. Lo ya analizado se guarda.</span>}
      {!running && errors.length > 0 && <span className="text-xs text-destructive">{errors.length} no se pudieron analizar: {errors[0]}</span>}
    </div>
  )
}
