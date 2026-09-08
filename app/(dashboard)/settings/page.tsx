export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getWorkspaceSettings } from "@/lib/actions/workspace"
import { getPositions } from "@/lib/actions/config"
import { getAutomationLogs } from "@/lib/actions/automation-logs"
import { getNotificationLogs } from "@/lib/actions/notification-logs"
import { BrandingManager } from "@/components/settings/branding-manager"
import { PositionsManager } from "@/components/settings/positions-manager"
import { AutomationLogSection } from "@/components/settings/automation-log"
import { NotificationLogSection } from "@/components/settings/notification-log"
import { getTranslations } from "next-intl/server"

export default async function SettingsPage() {
  const t = await getTranslations("settings")
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single()

  if (profile?.role !== "admin") redirect("/")

  const [workspaceSettings, positions, automationLogs, notificationLogs] = await Promise.all([
    getWorkspaceSettings().catch(() => ({ logo_url: null })),
    getPositions(),
    getAutomationLogs().catch(() => []),
    getNotificationLogs().catch(() => []),
  ])

  return (
    <div className="p-6 max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">{t("branding")}</h2>
        <BrandingManager initialLogoUrl={workspaceSettings.logo_url} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Puestos</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Lista controlada de puestos de la agencia. Se usa para asignar tareas automáticamente al crear proyectos.
          </p>
        </div>
        <PositionsManager initialPositions={positions} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Automatizaciones</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Revisa qué está registrando el bot automáticamente desde Telegram y Vowen (notas de voz).
          </p>
        </div>
        <AutomationLogSection initialLogs={automationLogs} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Notificaciones al equipo</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Avisos individuales por Telegram (tareas asignadas, altas a proyectos) — quién los recibió y si de verdad se enviaron.
          </p>
        </div>
        <NotificationLogSection initialLogs={notificationLogs} />
      </section>
    </div>
  )
}
