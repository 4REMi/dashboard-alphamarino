import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { can } from "@/lib/permissions"
import type { Profile } from "@/lib/types"

export default async function AdLabPage() {
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

  const [brandsRes, boardsRes, savedAdsRes, clonesCountRes] = await Promise.all([
    supabase.from("tracked_brands").select("id", { count: "exact", head: true }),
    supabase.from("ad_boards").select("id", { count: "exact", head: true }),
    supabase.from("saved_ads").select("id", { count: "exact", head: true }),
    supabase.from("image_clones").select("id", { count: "exact", head: true }).eq("status", "done"),
  ])

  const brandCount     = brandsRes.count      ?? 0
  const boardCount     = boardsRes.count      ?? 0
  const savedAdCount   = savedAdsRes.count    ?? 0
  const creativesCount = clonesCountRes.count ?? 0

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl">
          📺
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ad Lab</h1>
          <p className="text-sm text-muted-foreground">
            Descubre y guarda anuncios de competidores. Clona los mejores para tus clientes.
          </p>
        </div>
      </div>

      {/* Hub cards — emoji, count, name and description together, no more
          duplicating the same 4 sections as separate stat + nav cards. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
        <HubCard href="/ad-lab/discovery"  icon="🔍" title="Discovery"    value={savedAdCount}   valueLabel="anuncios guardados" description="Busca anuncios en Meta Ads Library por marca o competidor." />
        <HubCard href="/ad-lab/boards"     icon="🗂️" title="Boards"       value={boardCount}     valueLabel="boards"             description="Colecciones de anuncios guardados organizados por tema o cliente." />
        <HubCard href="/ad-lab/brands"     icon="📡" title="Marcas"       value={brandCount}     valueLabel="marcas trackeadas"  description="Gestiona las marcas competidoras trackeadas por cliente." />
        <HubCard href="/ad-lab/creatives"  icon="🎨" title="Creatives"    value={creativesCount} valueLabel="creativos generados" description="Todos los estáticos clonados y adaptados para tus marcas." />
        <HubCard href="/ad-lab/resize"     icon="📐" title="Image Resize" description="Expande creativos a múltiples aspect ratios usando IA." />
      </div>
    </div>
  )
}

function HubCard({ href, icon, title, value, valueLabel, description }: {
  href: string
  icon: string
  title: string
  value?: number
  valueLabel?: string
  description: string
}) {
  return (
    <a href={href} className="group rounded-xl border border-border bg-card p-5 flex flex-col gap-4 hover:border-primary/40 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 text-xl">
          {icon}
        </div>
        {value !== undefined && (
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums leading-none">{value}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{valueLabel}</p>
          </div>
        )}
      </div>
      <div>
        <p className="font-semibold text-sm group-hover:text-primary transition-colors">{title}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
      </div>
    </a>
  )
}
