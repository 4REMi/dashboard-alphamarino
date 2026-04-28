import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { can } from "@/lib/permissions"
import { getTrackedBrands, getBoards } from "@/lib/actions/ad-lab"
import { DiscoveryShell } from "@/components/ad-lab/discovery-shell"
import type { Profile, Customer } from "@/lib/types"

export default async function AdLabDiscoveryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, permissions")
    .eq("id", user.id)
    .single()
  const profile = profileData as Pick<Profile, "id" | "full_name" | "email" | "role" | "permissions"> | null
  if (!can(profile, "access_ad_lab")) redirect("/")

  const [trackedBrands, boards, customersRes] = await Promise.all([
    getTrackedBrands(),
    getBoards(),
    supabase.from("customers").select("id, name, company").order("name"),
  ])

  const customers = (customersRes.data ?? []) as Pick<Customer, "id" | "name" | "company">[]

  return (
    <DiscoveryShell
      trackedBrands={trackedBrands}
      boards={boards}
      customers={customers}
    />
  )
}
