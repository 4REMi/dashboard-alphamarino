import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getAuditAccessUser } from "@/lib/ad-audit/access"
import { getCampaignAudit } from "@/lib/ad-audit/queries"
import { CampaignAudit } from "@/components/ad-audit/campaign-audit"

export const dynamic = "force-dynamic"

export default async function AuditCampaignPage({ params }: { params: Promise<{ accountId: string; campaignId: string }> }) {
  if (!(await getAuditAccessUser())) redirect("/")
  const { accountId, campaignId } = await params
  const view = await getCampaignAudit(campaignId)
  if (!view || view.account.id !== accountId) notFound()
  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          <Link href="/ad-lab/auditorias" className="hover:underline">Auditorías</Link><span aria-hidden="true">›</span>
          <Link href={`/ad-lab/auditorias/${accountId}`} className="hover:underline">{view.account.name}</Link>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{view.campaign.name}</h1>
        <p className="text-sm text-muted-foreground">
          {view.campaign.period_since} → {view.campaign.period_until} · {view.campaign.objective ?? "—"} · atribución 7 días después del clic
        </p>
      </div>
      <CampaignAudit view={view} basePath={`/ad-lab/auditorias/${accountId}/c/${campaignId}`} />
    </div>
  )
}
