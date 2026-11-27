import { notFound, redirect } from "next/navigation"
import { getAuditAccessUser } from "@/lib/ad-audit/access"
import { getCampaignAudit } from "@/lib/ad-audit/queries"
import { AdAuditDetail } from "@/components/ad-audit/ad-audit-detail"

export const dynamic = "force-dynamic"
// «Analizar este creativo» se encola desde aquí.
export const maxDuration = 60

export default async function AuditAdPage({ params }: { params: Promise<{ accountId: string; campaignId: string; adId: string }> }) {
  if (!(await getAuditAccessUser())) redirect("/")
  const { accountId, campaignId, adId } = await params
  const view = await getCampaignAudit(campaignId)
  if (!view || view.account.id !== accountId) notFound()
  const adset = view.adsets.find((s) => s.ads.some((a) => a.id === adId))
  const ad = adset?.ads.find((a) => a.id === adId)
  if (!adset || !ad) notFound()
  return (
    <div className="mx-auto max-w-[1500px] p-4 sm:p-6">
      <AdAuditDetail ad={ad} adset={adset} view={view} currency={view.account.currency ?? "MXN"} backHref={`/ad-lab/auditorias/${accountId}/c/${campaignId}`} basePath={`/ad-lab/auditorias/${accountId}/c/${campaignId}`} metrics={view.metrics} />
    </div>
  )
}
