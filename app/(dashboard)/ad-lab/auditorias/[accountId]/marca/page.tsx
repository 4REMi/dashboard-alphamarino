import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { can } from "@/lib/permissions"
import type { Profile } from "@/lib/types"
import { getAuditAccessUser } from "@/lib/ad-audit/access"
import { getAuditAccount } from "@/lib/ad-audit/queries"
import { getAuditBrand } from "@/lib/ad-audit/brand"
import { AuditBrand } from "@/components/ad-audit/audit-brand"

export const dynamic = "force-dynamic"
// Inferir la marca (sitio + Claude) se lanza desde aquí.
export const maxDuration = 300

export default async function AuditBrandPage({ params }: { params: Promise<{ accountId: string }> }) {
  const user = await getAuditAccessUser()
  if (!user) redirect("/")
  const { accountId } = await params
  const data = await getAuditAccount(accountId)
  if (!data) notFound()
  const { brain, lines, error } = await getAuditBrand(accountId)
  const { data: profile } = await createAdminClient().from("profiles").select("role, permissions").eq("id", user.id).single()
  const canPromote = can(profile as Pick<Profile, "role" | "permissions"> | null, "access_brand_brains")
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          <Link href="/ad-lab/auditorias" className="hover:underline">Auditorías</Link><span aria-hidden="true">›</span>
          <Link href={`/ad-lab/auditorias/${accountId}`} className="hover:underline">{data.account.name}</Link>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Marca inferida</h1>
      </div>
      <AuditBrand accountId={accountId} brain={brain} lines={lines} error={error} currency={data.account.currency ?? "MXN"} canPromote={canPromote} />
    </div>
  )
}
