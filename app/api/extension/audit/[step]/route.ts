import { ExtensionError, withExtensionAuth } from "@/lib/ad-lab/extension"
import { errorResponse, json, preflight } from "@/lib/ad-lab/extension-http"
import { finishAudit, mirrorAuditMedia, saveCampaignStructure, saveDailyRows, startAudit } from "@/lib/ad-audit/ingest"

// Copiar videos puede tardar.
export const maxDuration = 300

// Captura de una auditoría desde la extensión, en pasos:
//   start     { account, campaigns, since, until }
//   structure { campaignId, adsets, ads, videos, retention, missing_events, since, until }
//   daily     { campaignId, rows }               (en tandas)
//   media     { videos: [{id, source}], images: [{ad_id, url}] }   (pocos por llamada)
//   finish    { accountId }
// Ver docs/agent-guides/auditorias.md.
export async function POST(req: Request, ctx: { params: Promise<{ step: string }> }) {
  try {
    const { step } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const result = await withExtensionAuth(req, async (profileId) => {
      switch (step) {
        case "start": return startAudit(profileId, body)
        case "structure": return saveCampaignStructure(body)
        case "daily": return saveDailyRows(body)
        case "media": return mirrorAuditMedia(body)
        case "finish": return finishAudit(profileId, body)
        default: throw new ExtensionError("Paso desconocido", 404)
      }
    })
    return json(result)
  } catch (e) {
    return errorResponse(e)
  }
}

export const OPTIONS = preflight
