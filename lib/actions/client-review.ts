"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { notify } from "@/lib/notifications/notify"
import type { ClientReviewStatus } from "@/lib/types"

// No hay un "asignado" por asset/script — ese campo no existe en
// creative_assets ni creative_briefs — así que un review de cliente
// siempre avisa a TODO el equipo del proyecto (mismo criterio que "se
// agregó un miembro nuevo"), nunca dirigido como Ping en tareas.
async function notifyClientReview(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
  label: string,
  status: "approved" | "changes_requested",
  feedback: string | null,
) {
  const [{ data: project }, { data: members }] = await Promise.all([
    admin.from("projects").select("name").eq("id", projectId).single(),
    admin.from("project_members").select("profile_id").eq("project_id", projectId),
  ])
  if (!project || !members || members.length === 0) return

  const eventKey = status === "approved" ? "creative_client_approved" : "creative_client_changes_requested"
  await Promise.all(
    members.map((m) => notify(m.profile_id, eventKey, { projectName: project.name, label, feedback: feedback ?? undefined }))
  )
}

export async function submitClientReview(
  assetId: string,
  status: "approved" | "changes_requested",
  feedback: string | null
): Promise<void> {
  const supabase = createAdminClient()

  // Only update assets that are actually visible to the client
  const { data, error } = await supabase
    .from("creative_assets")
    .update({
      client_status:   status satisfies ClientReviewStatus,
      client_feedback: feedback || null,
    })
    .eq("id", assetId)
    .eq("client_visible", true)
    .select("project_id, format, platform, iteration")
    .single()

  if (error) throw error

  const label = [data.format, data.platform, data.iteration].filter(Boolean).join(" ") || "un asset"
  await notifyClientReview(supabase, data.project_id, label, status, feedback)
}

// scriptKey identifies which script inside the brief this review targets —
// a brief can hold multiple scripts (one per attached reference ad), so the
// review state must be keyed per script, never on the brief row as a whole.
export async function submitBriefClientReview(
  briefId: string,
  scriptKey: string,
  status: "approved" | "changes_requested",
  feedback: string | null
): Promise<void> {
  const supabase = createAdminClient()

  const { data: brief, error: fetchError } = await supabase
    .from("creative_briefs")
    .select("project_id, title, script_reviews")
    .eq("id", briefId)
    .not("adapted_script", "is", null)
    .single()
  if (fetchError) throw fetchError

  const current = (brief?.script_reviews as Record<string, unknown>) ?? {}
  const updated = {
    ...current,
    [scriptKey]: { client_status: status satisfies ClientReviewStatus, client_feedback: feedback || null },
  }

  const { error } = await supabase
    .from("creative_briefs")
    .update({ script_reviews: updated })
    .eq("id", briefId)

  if (error) throw error

  await notifyClientReview(supabase, brief.project_id, brief.title || "un script", status, feedback)
}
