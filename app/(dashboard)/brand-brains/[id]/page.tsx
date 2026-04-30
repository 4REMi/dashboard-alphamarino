import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { can } from "@/lib/permissions"
import type { Profile } from "@/lib/types"
import { getBrandBrain } from "@/lib/actions/brand-brains"
import { BrandBrainDetail } from "@/components/brand-brains/brand-brain-detail"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function BrandBrainPage({ params }: PageProps) {
  const { id } = await params

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

  const brain = await getBrandBrain(id)
  if (!brain) notFound()

  return <BrandBrainDetail brain={brain} canEdit={can(profile, "access_brand_brains")} />
}
