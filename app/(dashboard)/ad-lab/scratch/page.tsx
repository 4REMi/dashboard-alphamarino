import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { can } from "@/lib/permissions"
import type { Profile } from "@/lib/types"
import { ScratchStudio } from "@/components/ad-lab/scratch-studio"

export default async function AdLabScratchPage() {
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

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl">
          ✨
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Crear desde cero</h1>
          <p className="text-sm text-muted-foreground">
            Genera creativos estáticos sin partir de ningún anuncio de referencia — la IA propone ideas primero, tú eliges cuáles generar.
          </p>
        </div>
      </div>

      <ScratchStudio />
    </div>
  )
}
