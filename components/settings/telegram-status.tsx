"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { unlinkTelegram } from "@/lib/actions/employees"
import { NotificationPreferences } from "@/components/employees/notification-preferences"
import { ChevronDown, ChevronUp, Unlink, Loader2 } from "lucide-react"
import type { Profile } from "@/lib/types"
import { cn } from "@/lib/utils"

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })
}

interface Props {
  employees: Profile[]
}

export function TelegramStatusSection({ employees }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [unlinking, setUnlinking] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleUnlink(profileId: string, name: string) {
    if (!confirm(`¿Desvincular el Telegram de ${name}? Va a tener que generar un código nuevo para volver a vincularlo.`)) return
    setUnlinking(profileId)
    startTransition(async () => {
      try {
        await unlinkTelegram(profileId)
      } finally {
        setUnlinking(null)
      }
    })
  }

  if (employees.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center border rounded-lg">Sin empleados todavía.</p>
  }

  return (
    <div className="border rounded-lg divide-y">
      {employees.map((emp) => {
        const isLinked = !!emp.telegram_chat_id
        const isExpanded = expandedId === emp.id
        return (
          <div key={emp.id}>
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{emp.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {isLinked ? (
                    <>🟢 Vinculado{emp.telegram_linked_at ? ` · desde ${formatDate(emp.telegram_linked_at)}` : ""}</>
                  ) : (
                    <>⚪ Sin vincular{emp.telegram_unlinked_at ? ` · desvinculado el ${formatDate(emp.telegram_unlinked_at)}` : ""}</>
                  )}
                </p>
              </div>
              {isLinked && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpandedId(isExpanded ? null : emp.id)}
                    className="text-muted-foreground"
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleUnlink(emp.id, emp.full_name)}
                    disabled={isPending && unlinking === emp.id}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    {isPending && unlinking === emp.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
                  </Button>
                </>
              )}
            </div>
            {isLinked && (
              <div className={cn("px-4 pb-3", !isExpanded && "hidden")}>
                <p className="text-xs font-medium text-muted-foreground mb-1">Qué le avisa</p>
                <NotificationPreferences profileId={emp.id} initialPreferences={emp.notification_preferences} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
