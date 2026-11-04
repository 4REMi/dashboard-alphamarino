import { createMcpHandler, withMcpAuth } from "mcp-handler"
import { registerMcpTools } from "@/lib/mcp/tools"
import { verifyMcpToken } from "@/lib/mcp/auth"

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

// withMcpAuth is NOT real OAuth here — verifyMcpToken (lib/mcp/auth.ts)
// just checks the bearer token against mcp_api_keys and resolves which
// profile it belongs to. `required: true` rejects any call with no
// valid key before it ever reaches a tool.
const authHandler = withMcpAuth(handler, verifyMcpToken, { required: true })

// GET abriría un stream SSE de notificaciones del servidor que no usamos:
// quedaba abierto hasta que Vercel lo cortaba a los 300 s ("Task timed
// out"). El spec de Streamable HTTP permite responder 405 a GET; los
// clientes entonces solo usan POST.
function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST, DELETE" } })
}

export { GET, authHandler as POST, authHandler as DELETE }
