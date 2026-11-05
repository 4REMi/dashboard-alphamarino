import type { AuthInfo } from "@modelcontextprotocol/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ACCESS_TOKEN_PREFIX, sha256 } from "@/lib/mcp/oauth"

// Access token OAuth (ChatGPT y cualquier cliente que se conecte por
// /oauth/authorize — ver lib/mcp/oauth.ts). Opaco, guardado como hash en
// mcp_oauth_grants; vale mientras no expire ni se revoque la conexión.
async function verifyOAuthAccessToken(bearerToken: string): Promise<AuthInfo | undefined> {
  const admin = createAdminClient()
  const { data: grant } = await admin
    .from("mcp_oauth_grants")
    .select("id, client_id, profile_id, scope, access_expires_at")
    .eq("access_token_hash", sha256(bearerToken))
    .is("revoked_at", null)
    .maybeSingle()
  if (!grant) return undefined
  const expiresAt = Math.floor(new Date(grant.access_expires_at).getTime() / 1000)
  if (expiresAt < Date.now() / 1000) return undefined

  admin.from("mcp_oauth_grants").update({ last_used_at: new Date().toISOString() }).eq("id", grant.id).then(
    () => {},
    () => {},
  )

  return {
    token: bearerToken,
    clientId: grant.client_id,
    scopes: grant.scope ? grant.scope.split(" ") : [],
    expiresAt,
    extra: { profileId: grant.profile_id, oauthGrantId: grant.id },
  }
}

// Verifier passed to withMcpAuth (app/api/mcp/route.ts). Acepta dos tipos
// de token y en ambos resuelve `profileId`:
//   - access token OAuth (prefijo amoa_) → verifyOAuthAccessToken
//   - API key personal (admk_…, generated from the employee's own profile
//     page, components/employees/mcp-api-keys.tsx), hashed and looked up
//     here. The resolved profile id rides in `extra.profileId`, read back
// out inside each tool handler via `ctx.http?.authInfo?.extra?.profileId`
// and passed as `actingProfileId` to the same server actions the
// dashboard itself uses (createTask, updateTaskStatus, addLogEntry) — so
// an MCP call is permission-checked exactly like a real session, never a
// service-role bypass like the Telegram bot's own (separate, untouched)
// path.
export async function verifyMcpToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined
  if (bearerToken.startsWith(ACCESS_TOKEN_PREFIX)) return verifyOAuthAccessToken(bearerToken)

  const admin = createAdminClient()
  const { data: key } = await admin
    .from("mcp_api_keys")
    .select("id, profile_id, revoked_at")
    .eq("key_hash", sha256(bearerToken))
    .is("revoked_at", null)
    .maybeSingle()
  if (!key) return undefined

  // Fire-and-forget — a failed "last used" stamp shouldn't fail the
  // actual tool call.
  admin.from("mcp_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id).then(
    () => {},
    () => {},
  )

  return {
    token: bearerToken,
    clientId: key.profile_id,
    scopes: [],
    extra: { profileId: key.profile_id },
  }
}
