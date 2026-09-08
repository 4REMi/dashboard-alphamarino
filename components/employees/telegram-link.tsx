"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { generateTelegramLinkCode } from "@/lib/actions/employees"
import { Send, Loader2, CheckCircle2, Copy, Check, ExternalLink } from "lucide-react"

// Username del bot de Telegram de la agencia — se usa aquí y en el mensaje
// de instrucciones para que quien esté vinculando su cuenta sepa a quién
// mandarle el código, sin tener que preguntar.
const BOT_USERNAME = "iceberg_alpha"

interface Props {
  profileId: string
  isLinked: boolean
}

export function TelegramLink({ profileId, isLinked: initialLinked }: Props) {
  const [isLinked, setIsLinked] = useState(initialLinked)
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleGenerate() {
    setError(null)
    startTransition(async () => {
      try {
        setCode(await generateTelegramLinkCode(profileId))
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo generar el código")
      }
    })
  }

  function handleCopy() {
    if (!code) return
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (isLinked) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600">
        <CheckCircle2 className="w-4 h-4" />
        Telegram vinculado — aquí llegan tus notificaciones.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Vincula tu Telegram para recibir avisos cuando te asignen una tarea o te agreguen a un proyecto.
      </p>

      {!code ? (
        <Button size="sm" variant="outline" onClick={handleGenerate} disabled={isPending}>
          {isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
          Generar código
        </Button>
      ) : (
        <div className="space-y-2">
          <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
            <li>
              Abre el bot{" "}
              <a
                href={`https://t.me/${BOT_USERNAME}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-medium inline-flex items-center gap-0.5 hover:underline"
              >
                @{BOT_USERNAME}
                <ExternalLink className="w-3 h-3" />
              </a>{" "}
              en Telegram.
            </li>
            <li>Mándale este código tal cual, como mensaje de texto:</li>
          </ol>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border">
            <code className="text-sm font-mono font-semibold tracking-wider flex-1">{code}</code>
            <Button size="sm" variant="ghost" onClick={handleCopy} className="h-7 px-2">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            El bot te contesta confirmando. El código vence en 15 minutos.
          </p>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
