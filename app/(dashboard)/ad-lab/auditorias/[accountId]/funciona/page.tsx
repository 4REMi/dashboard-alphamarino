import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getAuditAccessUser } from "@/lib/ad-audit/access"
import { getAccountCampaignViews, getAuditAccount } from "@/lib/ad-audit/queries"
import { buildFindings } from "@/lib/ad-audit/findings"
import { WhatWorks } from "@/components/ad-audit/what-works"

export const dynamic = "force-dynamic"

// «Qué funciona»: ganchos, cuerpos y cierres de toda la cuenta. Ver
// docs/agent-guides/auditorias.md y lib/ad-audit/findings.ts.
export default async function WhatWorksPage({ params }: { params: Promise<{ accountId: string }> }) {
  if (!(await getAuditAccessUser())) redirect("/")
  const { accountId } = await params
  const data = await getAuditAccount(accountId)
  if (!data) notFound()
  const views = await getAccountCampaignViews(accountId)
  const findings = buildFindings(views, (v) => `/ad-lab/auditorias/${accountId}/c/${v.campaign.id}`)
  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          <Link href="/ad-lab/auditorias" className="hover:underline">Auditorías</Link><span aria-hidden="true">›</span>
          <Link href={`/ad-lab/auditorias/${accountId}`} className="hover:underline">{data.account.name}</Link>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Qué funciona</h1>
        <p className="text-sm text-muted-foreground">{views.length} campaña{views.length === 1 ? "" : "s"} · atribución 7 días después del clic</p>
      </div>
      <WhatWorks findings={findings} />
    </div>
  )
}
