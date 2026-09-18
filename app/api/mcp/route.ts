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

export { authHandler as GET, authHandler as POST, authHandler as DELETE }
