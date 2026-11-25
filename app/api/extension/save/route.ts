import { ExtensionError, saveFromAdLibrary, saveFromAdsManager, withExtensionAuth } from "@/lib/ad-lab/extension"
import { errorResponse, json, preflight } from "@/lib/ad-lab/extension-http"

// Descargar varios videos completos de Meta puede tardar.
export const maxDuration = 300

// Guarda anuncios en un board desde la extensión de Chrome.
// Body:
//   { source: "ads_manager", boardId, adIds: ["120…", …] }
//   { source: "ad_library",  boardId, ad: { ad_archive_id, page_name, body, video_url, image_url, … } }
// Respuesta: { results: SaveResult[] } — un resultado por anuncio.
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const boardId = String(body.boardId ?? "")
    const results = await withExtensionAuth(req, async (profileId) => {
      if (body.source === "ads_manager") return saveFromAdsManager(profileId, boardId, body.adIds)
      if (body.source === "ad_library") return [await saveFromAdLibrary(profileId, boardId, body.ad)]
      throw new ExtensionError("source debe ser ads_manager o ad_library")
    })
    return json({ results })
  } catch (e) {
    return errorResponse(e)
  }
}

export const OPTIONS = preflight
