import { getPublicOrigin, metadataCorsOptionsRequestHandler } from "mcp-handler"
import { CORS_HEADERS, authorizationServerMetadata } from "@/lib/mcp/oauth"

// RFC 8414 — metadata del servidor de autorización (issuer = este mismo
// dashboard). Incluye registration_endpoint para que ChatGPT registre su
// cliente solo (DCR) sin capturar ID/secreto a mano.
export function GET(req: Request) {
  return new Response(JSON.stringify(authorizationServerMetadata(getPublicOrigin(req))), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "max-age=3600" },
  })
}

export const OPTIONS = metadataCorsOptionsRequestHandler()
