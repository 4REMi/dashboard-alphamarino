"use client"

import { useState, useTransition } from "react"
import { RefreshCw, Loader2 } from "lucide-react"
import { getAutomationLogs } from "@/lib/actions/automation-logs"
import type { AutomationLog } from "@/lib/types"
import { cn } from "@/lib/utils"

const SOURCE_LABELS: Record<AutomationLog["source"], string> = {
  telegram: "Telegram",
  vowen: "Vowen",
}

const STATUS_STYLES: Record<AutomationLog["status"], string> = {
  ok: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
}

const STATUS_LABELS: Record<AutomationLog["status"], string> = {
  ok: "Ok",
  partial: "Parcial",
  error: "Error",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })
}

interface Props {
  initialLogs: AutomationLog[]
}

export function AutomationLogSection({ initialLogs }: Props) {
  const [logs, setLogs] = useState(initialLogs)
  const [isPending, startTransition] = useTransition()

  function handleRefresh() {
    startTransition(async () => {
      try {
        setLogs(await getAutomationLogs())
      } catch { /* keep showing the last known list */ }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Últimos {logs.length} mensajes/notas procesados por el bot (Telegram y Vowen).
        </p>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isPending}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Actualizar
        </button>
      </div>

      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center border rounded-lg">
          Sin actividad todavía.
        </p>
      ) : (
        <div className="border rounded-lg divide-y">
          {logs.map((log) => (
            <div key={log.id} className="px-4 py-3 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {SOURCE_LABELS[log.source]}
                </span>
                <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", STATUS_STYLES[log.status])}>
                  {STATUS_LABELS[log.status]}
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto">{formatDate(log.created_at)}</span>
              </div>
              <p className="text-sm text-foreground/90 line-clamp-2">{log.raw_text}</p>
              {log.movements.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {log.movements.map((m, i) => (
                    <span key={i} className={cn(i > 0 && "before:content-['·'] before:mx-1.5", m.error && "text-destructive")}>
                      {m.tipo}{m.error ? ` (${m.error})` : ""}
                    </span>
                  ))}
                </p>
              )}
              {log.error_message && (
                <p className="text-xs text-destructive">{log.error_message}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
