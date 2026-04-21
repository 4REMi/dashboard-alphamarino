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
