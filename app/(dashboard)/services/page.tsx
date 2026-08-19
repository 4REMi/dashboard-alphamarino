import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getServiceOffers, getServiceAddons } from "@/lib/actions/services"
import { getProjectTypeBadges } from "@/lib/actions/config"
import { ServiceCatalogManager } from "@/components/services/service-catalog-manager"

export default async function ServicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (profile?.role !== "admin") redirect("/")

  const [offers, addons, projectTypes] = await Promise.all([
    getServiceOffers().catch(() => []),
    getServiceAddons().catch(() => []),
    getProjectTypeBadges().catch(() => []),
  ])

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Servicios</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Catálogo interno de ofertas y addons de la agencia — referencia para cotizar y pitchear.
        </p>
      </div>

      <ServiceCatalogManager
        initialOffers={offers}
        initialAddons={addons}
        projectTypes={projectTypes}
      />
    </div>
  )
}
