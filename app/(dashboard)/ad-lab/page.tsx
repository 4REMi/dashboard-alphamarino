import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { can } from "@/lib/permissions"
import { getAllImageClones } from "@/lib/actions/image-clone"
import { CreativesGrid } from "@/components/ad-lab/creatives-grid"
import type { Profile } from "@/lib/types"
import { Tv2, LayoutGrid, FolderOpen, Radio, ImagePlay } from "lucide-react"

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

  // Fetch counts + recent creatives in parallel
  const [brandsRes, boardsRes, savedAdsRes, clonesCountRes, recentClones] = await Promise.all([
    supabase.from("tracked_brands").select("id", { count: "exact", head: true }),
    supabase.from("ad_boards").select("id", { count: "exact", head: true }),
    supabase.from("saved_ads").select("id", { count: "exact", head: true }),
    supabase.from("image_clones").select("id", { count: "exact", head: true }).eq("status", "done"),
    getAllImageClones(12),
  ])

  const brandCount    = brandsRes.count      ?? 0
  const boardCount    = boardsRes.count      ?? 0
  const savedAdCount  = savedAdsRes.count    ?? 0
  const creativesCount = clonesCountRes.count ?? 0

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Tv2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ad Lab</h1>
          <p className="text-sm text-muted-foreground">
            Descubre y guarda anuncios de competidores. Clona los mejores para tus clientes.
          </p>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={Radio}      label="Marcas trackeadas"   value={brandCount}     href="/ad-lab/brands"     />
        <StatCard icon={LayoutGrid} label="Anuncios guardados"  value={savedAdCount}   href="/ad-lab/discovery"  />
        <StatCard icon={FolderOpen} label="Boards"              value={boardCount}     href="/ad-lab/boards"     />
        <StatCard icon={ImagePlay}  label="Creativos generados" value={creativesCount} href="#creatives"         />
      </div>

      {/* Nav cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <NavCard
          href="/ad-lab/discovery"
          icon={LayoutGrid}
          title="Discovery"
          description="Busca anuncios en Meta Ads Library por marca o competidor."
        />
        <NavCard
          href="/ad-lab/boards"
          icon={FolderOpen}
          title="Boards"
          description="Colecciones de anuncios guardados organizados por tema o cliente."
        />
        <NavCard
          href="/ad-lab/brands"
          icon={Radio}
          title="Marcas"
          description="Gestiona las marcas competidoras trackeadas por cliente."
        />
      </div>

      {/* Creatives gallery */}
      <div id="creatives">
        <CreativesGrid clones={recentClones as Parameters<typeof CreativesGrid>[0]["clones"]} />
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ElementType
  label: string
  value: number
  href: string
}) {
  return (
    <a
      href={href}
      className="group rounded-xl border border-border bg-card px-5 py-4 flex items-center gap-4 hover:border-primary/40 hover:bg-primary/5 transition-colors"
    >
      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
        <Icon className="w-4.5 h-4.5 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </a>
  )
}

function NavCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <a
      href={href}
      className="group rounded-xl border border-border bg-card p-5 flex flex-col gap-3 hover:border-primary/40 hover:shadow-sm transition-all"
    >
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="w-4.5 h-4.5 text-primary" />
      </div>
      <div>
        <p className="font-semibold text-sm group-hover:text-primary transition-colors">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
    </a>
  )
}
