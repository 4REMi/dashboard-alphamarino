import { createMcpHandler, withMcpAuth } from "mcp-handler"
import { registerMcpTools } from "@/lib/mcp/tools"
import { verifyMcpToken } from "@/lib/mcp/auth"
import { runTrusted } from "@/lib/trusted-context"

// Remote MCP server — any MCP-compatible client (Claude with a remote
// connector, Claude Desktop configured with this URL, etc.) points here
// with a personal API key (Bearer token, generated from the employee's
// own profile page) and gets the tools registered in lib/mcp/tools.ts.
// Deliberately a route inside this same Next.js app, not a separate
// service — no new infra/deploy, reuses the existing Vercel deployment
// and env vars.
const handler = createMcpHandler(
  (server) => { registerMcpTools(server) },
  { serverInfo: { name: "alphamarino-dashboard", version: "1.0.0" } },
)

// verifyMcpToken (lib/mcp/auth.ts) acepta la API key personal
// (mcp_api_keys) o un access token OAuth (mcp_oauth_grants, emitido por
// /api/oauth/token — así se conecta ChatGPT) y resuelve el profile en
// ambos casos. `required: true` rechaza cualquier llamada sin token
// válido con 401 + WWW-Authenticate apuntando a
// /.well-known/oauth-protected-resource, que es lo que dispara el flujo
// OAuth en el cliente.
const authHandler = withMcpAuth(handler, verifyMcpToken, { required: true })

// GET abriría un stream SSE de notificaciones del servidor que no usamos:
// quedaba abierto hasta que Vercel lo cortaba a los 300 s ("Task timed
// out"). El spec de Streamable HTTP permite responder 405 a GET; los
// clientes entonces solo usan POST.
function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST, DELETE" } })
}

// Toda la petición corre dentro del contexto de confianza (lib/trusted-context.ts):
// verifyMcpToken fija ahí el perfil autenticado, y las server actions que
// reciben actingProfileId solo lo aceptan si coincide con él.
function trusted(req: Request) {
  return runTrusted("mcp", () => authHandler(req))
}

export { GET, trusted as POST, trusted as DELETE }
