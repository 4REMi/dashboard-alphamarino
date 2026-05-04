import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { can } from "@/lib/permissions"
import { getAllImageClones } from "@/lib/actions/image-clone"
import { CreativesGrid } from "@/components/ad-lab/creatives-grid"
import type { Profile, ImageClone, BrandBrainColor } from "@/lib/types"
import { ImagePlay } from "lucide-react"

type BrainMeta = { id: string; name: string; logo_url?: string | null; brand_colors?: BrandBrainColor[] }
type AdMeta    = { id: string; page_name: string; cached_image_url?: string | null; image_url?: string | null }
type CloneRich = Omit<ImageClone, "brand_brain" | "saved_ad"> & { brand_brain?: BrainMeta | null; saved_ad?: AdMeta | null }

export default async function CreativesPage() {
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

  const clones = await getAllImageClones(200) as CloneRich[]

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <ImagePlay className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Creatives</h1>
              <p className="text-sm text-muted-foreground">Estáticos clonados y adaptados para tus marcas</p>
            </div>
          </div>
          {clones.length > 0 && (
            <span className="text-sm text-muted-foreground tabular-nums">
              {clones.length} {clones.length === 1 ? "creativo" : "creativos"}
            </span>
          )}
        </div>
      </div>

      {/* Gallery */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <CreativesGrid clones={clones} />
      </div>
    </div>
  )
}
