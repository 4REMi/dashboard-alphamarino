import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { can } from "@/lib/permissions"
import { getTrackedBrands } from "@/lib/actions/ad-lab"
import { TrackedBrandsManager } from "@/components/ad-lab/tracked-brands-manager"
import { Radio, ArrowLeft } from "lucide-react"
import Link from "next/link"
import type { Profile, Customer } from "@/lib/types"

export default async function AdLabBrandsPage() {
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

  const [brands, customersRes] = await Promise.all([
    getTrackedBrands(),
    supabase.from("customers").select("id, name, company").order("name"),
  ])

  const customers = (customersRes.data ?? []) as Pick<Customer, "id" | "name" | "company">[]

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/ad-lab"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Radio className="w-4.5 h-4.5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Marcas trackeadas</h1>
          <p className="text-sm text-muted-foreground">
            Competidores organizados por cliente para búsquedas rápidas en Meta Ads Library.
          </p>
        </div>
      </div>

      <TrackedBrandsManager initialBrands={brands} customers={customers} />
    </div>
  )
}
