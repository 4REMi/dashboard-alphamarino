"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import type { ClientReviewStatus } from "@/lib/types"

export async function submitClientReview(
  assetId: string,
  status: "approved" | "changes_requested",
  feedback: string | null
): Promise<void> {
  const supabase = createAdminClient()

  // Only update assets that are actually visible to the client
  const { error } = await supabase
    .from("creative_assets")
    .update({
      client_status:   status satisfies ClientReviewStatus,
      client_feedback: feedback || null,
    })
    .eq("id", assetId)
    .eq("client_visible", true)

  if (error) throw error
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
    .select("script_reviews")
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
}
