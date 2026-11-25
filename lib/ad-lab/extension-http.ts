// Helpers HTTP de las rutas app/api/extension/*. SIN "use server".
import { ExtensionError } from "@/lib/ad-lab/extension"

// La extensión llama desde su service worker con host_permissions, que no
// necesita CORS; se deja abierto igual (el acceso lo da la API key, no el
// origen) para poder probar desde la consola.
export const EXTENSION_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
}

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: EXTENSION_CORS })
}

export function errorResponse(e: unknown) {
  if (e instanceof ExtensionError) return json({ error: e.message }, e.status)
  console.error("[api/extension]", e)
  return json({ error: e instanceof Error ? e.message : "Error inesperado" }, 500)
}

export function preflight() {
  return new Response(null, { status: 204, headers: EXTENSION_CORS })
}
