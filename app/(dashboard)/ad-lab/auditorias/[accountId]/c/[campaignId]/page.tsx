import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getAuditAccessUser } from "@/lib/ad-audit/access"
import { getCampaignAudit, getCampaignHypotheses } from "@/lib/ad-audit/queries"
import { CampaignAudit } from "@/components/ad-audit/campaign-audit"
import { HypothesesPanel } from "@/components/ad-audit/hypotheses-panel"

export const dynamic = "force-dynamic"
// Los análisis por partes y las hipótesis se lanzan desde aquí (server actions).
export const maxDuration = 300

export default async function AuditCampaignPage({ params }: { params: Promise<{ accountId: string; campaignId: string }> }) {
  if (!(await getAuditAccessUser())) redirect("/")
  const { accountId, campaignId } = await params
  const view = await getCampaignAudit(campaignId)
  if (!view || view.account.id !== accountId) notFound()
  const hyp = await getCampaignHypotheses(campaignId)
  const basePath = `/ad-lab/auditorias/${accountId}/c/${campaignId}`
  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          <Link href="/ad-lab/auditorias" className="hover:underline">Auditorías</Link><span aria-hidden="true">›</span>
          <Link href={`/ad-lab/auditorias/${accountId}`} className="hover:underline">{view.account.name}</Link>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{view.campaign.name}</h1>
          <Link href={`/ad-lab/auditorias/${accountId}/funciona`} className="text-sm font-semibold text-primary hover:underline">Qué funciona en la cuenta →</Link>
        </div>
        <p className="text-sm text-muted-foreground">
          {view.campaign.period_since} → {view.campaign.period_until} · {view.campaign.objective ?? "—"} · atribución 7 días después del clic
        </p>
      </div>
      <CampaignAudit view={view} basePath={basePath} />
      <HypothesesPanel view={view} hypotheses={hyp.rows} error={hyp.error} basePath={basePath} />
    </div>
  )
}
