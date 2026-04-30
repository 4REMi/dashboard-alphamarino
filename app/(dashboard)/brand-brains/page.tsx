import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { can } from "@/lib/permissions"
import type { Profile } from "@/lib/types"
import { getBrandBrains } from "@/lib/actions/brand-brains"
import { BrandBrainsGrid } from "@/components/brand-brains/brand-brains-grid"

export default async function BrandBrainsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, permissions")
    .eq("id", user.id)
    .single()

  const profile = profileData as Pick<Profile, "id" | "full_name" | "email" | "role" | "permissions"> | null
  if (!can(profile, "access_brand_brains")) redirect("/")

  const brains = await getBrandBrains()

  return <BrandBrainsGrid brains={brains} />
}
