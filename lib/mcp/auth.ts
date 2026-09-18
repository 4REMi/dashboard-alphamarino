import crypto from "crypto"
import type { AuthInfo } from "@modelcontextprotocol/server"
import { createAdminClient } from "@/lib/supabase/admin"

function hashKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex")
}

// Verifier passed to withMcpAuth (app/api/mcp/route.ts). Deliberately NOT
// real OAuth — a personal API key (generated from the employee's own
// profile page, components/employees/mcp-api-keys.tsx) hashed and looked
// up here. The resolved profile id rides in `extra.profileId`, read back
// out inside each tool handler via `ctx.http?.authInfo?.extra?.profileId`
// and passed as `actingProfileId` to the same server actions the
// dashboard itself uses (createTask, updateTaskStatus, addLogEntry) — so
// an MCP call is permission-checked exactly like a real session, never a
// service-role bypass like the Telegram bot's own (separate, untouched)
// path.
export async function verifyMcpToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined

  const admin = createAdminClient()
  const { data: key } = await admin
    .from("mcp_api_keys")
    .select("id, profile_id, revoked_at")
    .eq("key_hash", hashKey(bearerToken))
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
