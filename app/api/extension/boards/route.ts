import { createBoardForExtension, listBoardsForExtension, withExtensionAuth } from "@/lib/ad-lab/extension"
import { errorResponse, json, preflight } from "@/lib/ad-lab/extension-http"

// Boards de Ad Lab para el selector de la extensión de Chrome.
export async function GET(req: Request) {
  try {
    return json({ boards: await withExtensionAuth(req, () => listBoardsForExtension()) })
  } catch (e) {
    return errorResponse(e)
  }
}

// Crear un board nuevo desde la extensión. Body: { name }
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { name?: unknown }
    const board = await withExtensionAuth(req, (profileId) => createBoardForExtension(profileId, String(body.name ?? "")))
    return json({ board })
  } catch (e) {
    return errorResponse(e)
  }
}

export const OPTIONS = preflight
