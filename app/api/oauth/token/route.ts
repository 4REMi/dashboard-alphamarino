import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  CORS_HEADERS,
  getOAuthClient,
  issueTokens,
  oauthError,
  oauthJson,
  sha256,
  verifyPkceS256,
  type OAuthClientRow,
} from "@/lib/mcp/oauth"

async function readParams(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get("content-type") ?? ""
  if (type.includes("application/json")) {
    const json = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(json)) if (typeof v === "string") p.set(k, v)
    return p
  }
  return new URLSearchParams(await req.text())
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

// Autentica al cliente: client_secret_basic, client_secret_post o público
// (solo client_id; en ese caso PKCE es lo que protege el código).
async function authenticateClient(req: Request, params: URLSearchParams): Promise<OAuthClientRow | null> {
  let clientId = params.get("client_id")
  let secret = params.get("client_secret")
  const auth = req.headers.get("authorization")
  if (auth?.toLowerCase().startsWith("basic ")) {
    const decoded = Buffer.from(auth.slice(6).trim(), "base64").toString("utf8")
    const i = decoded.indexOf(":")
    if (i > 0) {
      clientId = decodeURIComponent(decoded.slice(0, i))
      secret = decodeURIComponent(decoded.slice(i + 1))
    }
  }
  const client = await getOAuthClient(clientId)
  if (!client) return null
  if (client.client_secret_hash) {
    if (!secret || !safeEqual(sha256(secret), client.client_secret_hash)) return null
  }
  return client
}

export async function POST(req: Request) {
  const params = await readParams(req)
  const grantType = params.get("grant_type")

  const client = await authenticateClient(req, params)
  if (!client) return oauthError("invalid_client", "Cliente desconocido o credenciales inválidas", 401)

  const admin = createAdminClient()

  if (grantType === "authorization_code") {
    const code = params.get("code")
    const verifier = params.get("code_verifier")
    const redirectUri = params.get("redirect_uri")
    if (!code || !verifier) return oauthError("invalid_request", "Faltan code o code_verifier (PKCE es obligatorio)")

    const codeHash = sha256(code)
    // Marca el código como usado de forma atómica: solo una petición puede
    // "ganarlo", aunque lleguen dos al mismo tiempo.
    const { data: row } = await admin
      .from("mcp_oauth_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("code_hash", codeHash)
      .is("used_at", null)
      .select("client_id, profile_id, redirect_uri, code_challenge, scope, expires_at")
      .maybeSingle()

    if (!row) {
      // ¿Reuso de un código ya canjeado? Se revocan los tokens que emitió
      // (OAuth 2.1 §4.1.3).
      const { data: used } = await admin.from("mcp_oauth_codes").select("grant_id").eq("code_hash", codeHash).maybeSingle()
      if (used?.grant_id) {
        await admin.from("mcp_oauth_grants").update({ revoked_at: new Date().toISOString() }).eq("id", used.grant_id)
      }
      return oauthError("invalid_grant", "Código inválido o ya usado")
    }
    if (new Date(row.expires_at).getTime() < Date.now()) return oauthError("invalid_grant", "El código expiró")
    if (row.client_id !== client.client_id) return oauthError("invalid_grant", "El código no es de este cliente")
    if (redirectUri !== row.redirect_uri) {
      return oauthError("invalid_grant", "redirect_uri no coincide con el de la autorización")
    }
    if (!verifyPkceS256(verifier, row.code_challenge)) return oauthError("invalid_grant", "code_verifier inválido")

    const issued = await issueTokens({ clientId: client.client_id, profileId: row.profile_id, scope: row.scope })
    if (!issued) return oauthError("server_error", "No se pudieron emitir tokens", 500)
    await admin.from("mcp_oauth_codes").update({ grant_id: issued.grantId }).eq("code_hash", codeHash)
    return oauthJson(issued.body)
  }

  if (grantType === "refresh_token") {
    const refreshToken = params.get("refresh_token")
    if (!refreshToken) return oauthError("invalid_request", "Falta refresh_token")
    const refreshHash = sha256(refreshToken)

    const { data: grant } = await admin
      .from("mcp_oauth_grants")
      .select("id, client_id, profile_id, scope, refresh_expires_at, revoked_at")
      .eq("refresh_token_hash", refreshHash)
      .maybeSingle()
    if (!grant || grant.revoked_at || new Date(grant.refresh_expires_at).getTime() < Date.now()) {
      return oauthError("invalid_grant", "refresh_token inválido, expirado o revocado")
    }
    if (grant.client_id !== client.client_id) return oauthError("invalid_grant", "El refresh_token no es de este cliente")

    // Rotación: el refresh token anterior deja de servir.
    const issued = await issueTokens({
      grantId: grant.id,
      expectRefreshHash: refreshHash,
      clientId: grant.client_id,
      profileId: grant.profile_id,
      scope: grant.scope,
    })
    if (!issued) return oauthError("invalid_grant", "refresh_token ya usado")
    return oauthJson(issued.body)
  }

  return oauthError("unsupported_grant_type", "grant_type soportados: authorization_code, refresh_token")
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
