import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { redirect } from "next/navigation"
import { AiActivityFeed, type AiActivityRow } from "@/components/ai-activity/ai-activity-feed"

// Actividad de IA (provisional, solo admin): lo que hacen Claude vía MCP y,
// a futuro, el agente — separado de la bitácora humana.
export default async function AiActivityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (profile?.role !== "admin") redirect("/")

  const { data } = await createAdminClient()
    .from("ai_activity")
    .select("id, created_at, actor, platform, summary, reason, project:projects(id, name), requester:profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(500)

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Actividad de IA</h1>
        <p className="text-sm text-muted-foreground mt-1">Cambios que hizo la IA (Claude vía MCP, y a futuro el agente). Solo la ve admin.</p>
      </div>
      <AiActivityFeed rows={(data ?? []) as unknown as AiActivityRow[]} />
    </div>
  )
}
