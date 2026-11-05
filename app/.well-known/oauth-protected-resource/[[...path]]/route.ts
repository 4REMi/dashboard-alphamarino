import { generateProtectedResourceMetadata, getPublicOrigin, metadataCorsOptionsRequestHandler } from "mcp-handler"
import { CORS_HEADERS, SUPPORTED_SCOPE } from "@/lib/mcp/oauth"

// RFC 9728 — dice a los clientes MCP (ChatGPT) qué servidor de
// autorización emite tokens para /api/mcp. Responde igual en
// /.well-known/oauth-protected-resource y en la variante con sufijo
// (/.well-known/oauth-protected-resource/api/mcp) que algunos clientes piden.
export function GET(req: Request) {
  const origin = getPublicOrigin(req)
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [origin],
    resourceUrl: `${origin}/api/mcp`,
    additionalMetadata: { scopes_supported: [SUPPORTED_SCOPE], bearer_methods_supported: ["header"] },
  })
  return new Response(JSON.stringify(metadata), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "max-age=3600" },
  })
}

export const OPTIONS = metadataCorsOptionsRequestHandler()
