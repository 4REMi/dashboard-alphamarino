"use server"

// Acciones de Ad Lab → Auditorías. Ver docs/agent-guides/auditorias.md.

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireSessionOrTrusted } from "@/lib/auth/guards"
import { requireAuditAccess } from "@/lib/ad-audit/access"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Borra la auditoría de una cuenta completa: métricas, anuncios y los
// videos/imágenes copiados a Storage. Son datos de prospectos: borrar debe
// borrar de verdad.
export async function deleteAuditAccount(accountId: string): Promise<void> {
  await requireSessionOrTrusted()
  await requireAuditAccess()
  if (!UUID_RE.test(accountId)) throw new Error("Cuenta inválida")

  const admin = createAdminClient()
  const { data: videos } = await admin.from("audit_videos").select("storage_path").eq("account_id", accountId).not("storage_path", "is", null)
  const { data: camps } = await admin.from("audit_campaigns").select("id").eq("account_id", accountId)
  const campIds = (camps ?? []).map((c) => c.id)
  const { data: ads } = campIds.length
    ? await admin.from("audit_ads").select("meta_ad_id, cached_image_url").in("campaign_id", campIds).not("cached_image_url", "is", null)
    : { data: [] }

  const paths = [
    ...(videos ?? []).map((v) => v.storage_path as string),
    ...(ads ?? []).map((a) => `audits/images/${a.meta_ad_id}.jpg`),
  ]
  for (let i = 0; i < paths.length; i += 100) {
    await admin.storage.from("ad-lab").remove(paths.slice(i, i + 100))
  }

  const { error } = await admin.from("audit_accounts").delete().eq("id", accountId)
  if (error) throw new Error(error.message)
  revalidatePath("/ad-lab/auditorias")
}

export async function setAuditAccountKind(accountId: string, kind: "prospect" | "client"): Promise<void> {
  await requireSessionOrTrusted()
  await requireAuditAccess()
  if (!UUID_RE.test(accountId) || (kind !== "prospect" && kind !== "client")) throw new Error("Datos inválidos")
  const { error } = await createAdminClient().from("audit_accounts").update({ kind }).eq("id", accountId)
  if (error) throw new Error(error.message)
  revalidatePath("/ad-lab/auditorias")
}
