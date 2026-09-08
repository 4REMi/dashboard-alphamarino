"use client"

import { useState, useTransition } from "react"
import { RefreshCw, Loader2 } from "lucide-react"
import { getNotificationLogs, type NotificationLogEntry } from "@/lib/actions/notification-logs"
import { NOTIFICATION_EVENTS } from "@/lib/notifications/events"
import { cn } from "@/lib/utils"

const STATUS_STYLES: Record<NotificationLogEntry["status"], string> = {
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  skipped_no_channel: "bg-muted text-muted-foreground",
}

const STATUS_LABELS: Record<NotificationLogEntry["status"], string> = {
  sent: "Enviado",
  failed: "Falló",
  skipped_no_channel: "Sin Telegram vinculado",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })
}

interface Props {
  initialLogs: NotificationLogEntry[]
}

export function NotificationLogSection({ initialLogs }: Props) {
  const [logs, setLogs] = useState(initialLogs)
  const [isPending, startTransition] = useTransition()

  function handleRefresh() {
    startTransition(async () => {
      try {
        setLogs(await getNotificationLogs())
      } catch { /* keep showing the last known list */ }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Últimas {logs.length} notificaciones individuales mandadas al equipo.
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
            <div key={log.id} className="px-4 py-3 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{log.profile?.full_name ?? "—"}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {NOTIFICATION_EVENTS[log.event_key as keyof typeof NOTIFICATION_EVENTS]?.label ?? log.event_key}
                </span>
                <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", STATUS_STYLES[log.status])}>
                  {STATUS_LABELS[log.status]}
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto">{formatDate(log.created_at)}</span>
              </div>
              <p className="text-sm text-foreground/80 line-clamp-2">{log.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
