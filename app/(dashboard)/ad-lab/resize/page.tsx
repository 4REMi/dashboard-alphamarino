export const dynamic = "force-dynamic"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { can } from "@/lib/permissions"
import type { Profile, AdBoard } from "@/lib/types"
import { ResizeStudio } from "@/components/ad-lab/resize-studio"

export default async function ResizePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, role, permissions")
    .eq("id", user.id)
    .single()

  const profile = profileData as Pick<Profile, "id" | "role" | "permissions"> | null
  if (!can(profile, "access_ad_lab")) redirect("/")

  const { data: boards } = await supabase
    .from("ad_boards")
    .select("id, name")
    .order("created_at", { ascending: false })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <ResizeStudio boards={(boards ?? []) as AdBoard[]} />
    </div>
  )
}
