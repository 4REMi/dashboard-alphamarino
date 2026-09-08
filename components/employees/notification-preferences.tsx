"use client"

import { useState, useTransition } from "react"
import { updateNotificationPreferences } from "@/lib/actions/employees"
import { NOTIFICATION_EVENTS, type NotificationEventKey } from "@/lib/notifications/events"

interface Props {
  profileId: string
  initialPreferences: Record<string, boolean> | null
}

// Reused in two places: the employee's own profile (self-service) and the
// admin's Telegram status table in Settings — see lib/notifications/README.md.
export function NotificationPreferences({ profileId, initialPreferences }: Props) {
  const [preferences, setPreferences] = useState<Record<string, boolean>>(initialPreferences ?? {})
  const [isPending, startTransition] = useTransition()

  function handleToggle(key: NotificationEventKey) {
    const current = preferences[key] !== false // opt-out — absent/true = enabled
    const updated = { ...preferences, [key]: !current }
    setPreferences(updated)
    startTransition(async () => {
      await updateNotificationPreferences(profileId, updated)
    })
  }

  return (
    <div className="space-y-1">
      {(Object.entries(NOTIFICATION_EVENTS) as [NotificationEventKey, { label: string }][]).map(([key, { label }]) => {
        const value = preferences[key] !== false
        return (
          <div key={key} className="flex items-center justify-between py-2 px-1">
            <p className="text-xs text-foreground">{label}</p>
            <button
              onClick={() => handleToggle(key)}
              disabled={isPending}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-60 ${
                value ? "bg-primary" : "bg-muted-foreground/30"
              }`}
              role="switch"
              aria-checked={value}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition duration-200 ${
                  value ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        )
      })}
    </div>
  )
}
