import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { can } from "@/lib/permissions"
import type { Profile } from "@/lib/types"
import { listSavedAnalyses } from "@/lib/actions/ad-analysis"
import { SavedAnalyses } from "@/components/ad-lab/saved-analyses"

export const dynamic = "force-dynamic"

export default async function AnalisisPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile } = await supabase.from("profiles").select("id, role, permissions").eq("id", user.id).single()
  if (!can(profile as Pick<Profile, "role" | "permissions"> | null, "access_ad_lab")) redirect("/")
  let rows: Awaited<ReturnType<typeof listSavedAnalyses>> = []
  let error: string | null = null
  try { rows = await listSavedAnalyses() } catch (e) { error = e instanceof Error ? e.message : String(e) }
  return <div className="p-4 sm:p-6 max-w-[1400px] mx-auto"><SavedAnalyses initial={rows} error={error} /></div>
}
