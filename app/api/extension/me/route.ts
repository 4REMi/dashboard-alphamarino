import { getExtensionProfile, withExtensionAuth } from "@/lib/ad-lab/extension"
import { errorResponse, json, preflight } from "@/lib/ad-lab/extension-http"

// Prueba de conexión de la extensión de Chrome: valida la API key y que
// el perfil tenga acceso a Ad Lab. Ver docs/agent-guides/extension-chrome.md.
export async function GET(req: Request) {
  try {
    return json(await withExtensionAuth(req, (profileId) => getExtensionProfile(profileId)))
  } catch (e) {
    return errorResponse(e)
  }
}

export const OPTIONS = preflight
