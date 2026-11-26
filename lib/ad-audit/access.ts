// Verificación de acceso a Auditorías (Ad Lab). SIN "use server".
// Las tablas audit_* no tienen políticas RLS (datos sensibles de
// prospectos): todo se lee con el cliente admin DESPUÉS de esta verificación.

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { can } from "@/lib/permissions"
import type { Profile } from "@/lib/types"

export async function getAuditAccessUser(): Promise<{ id: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await createAdminClient().from("profiles").select("role, permissions").eq("id", user.id).maybeSingle()
  return can(profile as Pick<Profile, "role" | "permissions"> | null, "access_ad_lab") ? { id: user.id } : null
}

export async function requireAuditAccess(): Promise<{ id: string }> {
  const user = await getAuditAccessUser()
  if (!user) throw new Error("Permission denied")
  return user
}
