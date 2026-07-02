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

export async function submitBriefClientReview(
  briefId: string,
  status: "approved" | "changes_requested",
  feedback: string | null
): Promise<void> {
  const supabase = createAdminClient()

  // Only update briefs that actually have a script to review
  const { error } = await supabase
    .from("creative_briefs")
    .update({
      client_status:   status satisfies ClientReviewStatus,
      client_feedback: feedback || null,
    })
    .eq("id", briefId)
    .not("adapted_script", "is", null)

  if (error) throw error
}
