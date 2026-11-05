import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"

// Servidor OAuth 2.1 mínimo para el MCP (/api/mcp) — existe para clientes
// que solo saben conectarse con OAuth (ChatGPT: "Agregar servidor MCP
// personalizado" no deja poner headers). Piezas:
//   /.well-known/oauth-protected-resource      (RFC 9728)
//   /.well-known/oauth-authorization-server    (RFC 8414)
//   POST /api/oauth/register                   (DCR, RFC 7591)
//   /oauth/authorize                           (consentimiento, exige sesión)
//   POST /api/oauth/token                      (authorization_code + PKCE S256, refresh_token)
//
// Por qué no Supabase OAuth 2.1 Server: emite JWTs de sesión de Supabase,
// que sirven directo contra PostgREST con la RLS del usuario (no solo
// contra el MCP) y no se pueden revocar al instante. Aquí los tokens son
// opacos, solo valen en /api/mcp y revocarlos corta el acceso en la
// siguiente llamada. Todo se guarda hasheado (SHA-256), igual que
// mcp_api_keys.

export const ACCESS_TOKEN_PREFIX = "amoa_"
const REFRESH_TOKEN_PREFIX = "amor_"
export const ACCESS_TOKEN_TTL_S = 60 * 60 // 1 h
export const REFRESH_TOKEN_TTL_S = 60 * 60 * 24 * 60 // 60 días, se renueva al rotar
export const CODE_TTL_S = 5 * 60 // 5 min
export const SUPPORTED_SCOPE = "mcp"

export function sha256(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex")
}

export function randomToken(prefix = ""): string {
  return `${prefix}${crypto.randomBytes(32).toString("base64url")}`
}

// Origen público del deployment (respeta X-Forwarded-* de Vercel). Es el
// "issuer" del servidor de autorización y la base del recurso /api/mcp.
export function originFromHeaders(h: Headers): string {
  const host = h.get("x-forwarded-host")?.split(",")[0].trim() || h.get("host") || "localhost:3000"
  const fwdProto = h.get("x-forwarded-proto")?.split(",")[0].trim()
  const proto = fwdProto || (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? "http" : "https")
  return `${proto}://${host}`
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: [SUPPORTED_SCOPE],
    authorization_response_iss_parameter_supported: true,
  }
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
}

export function oauthJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "no-store", Pragma: "no-cache" },
  })
}

export function oauthError(error: string, description: string, status = 400): Response {
  return oauthJson({ error, error_description: description }, status)
}

// https obligatorio salvo loopback (clientes de escritorio); sin fragmento.
export function isAcceptableRedirectUri(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 2000) return false
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (u.hash) return false
  if (u.protocol === "https:") return true
  return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
}

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false
  const computed = crypto.createHash("sha256").update(verifier).digest("base64url")
  const a = Buffer.from(computed)
  const b = Buffer.from(challenge)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export interface OAuthClientRow {
  client_id: string
  client_name: string
  redirect_uris: string[]
  client_secret_hash: string | null
}

export async function getOAuthClient(clientId: string | null | undefined): Promise<OAuthClientRow | null> {
  if (!clientId || clientId.length > 200) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from("mcp_oauth_clients")
    .select("client_id, client_name, redirect_uris, client_secret_hash")
    .eq("client_id", clientId)
    .maybeSingle()
  return data
}

// Crea un grant nuevo (una "conexión" visible y revocable en el perfil)
// o rota los tokens de uno existente. Devuelve la respuesta de /token.
// Al rotar se pasa `expectRefreshHash`: el update solo aplica si el refresh
// token sigue siendo el vigente, así dos refresh simultáneos con el mismo
// token no pueden ganar los dos. Devuelve null si perdió esa carrera.
export async function issueTokens(opts: {
  grantId?: string
  expectRefreshHash?: string
  clientId: string
  profileId: string
  scope: string
}) {
  const admin = createAdminClient()
  const accessToken = randomToken(ACCESS_TOKEN_PREFIX)
  const refreshToken = randomToken(REFRESH_TOKEN_PREFIX)
  const now = Date.now()
  const fields = {
    access_token_hash: sha256(accessToken),
    access_expires_at: new Date(now + ACCESS_TOKEN_TTL_S * 1000).toISOString(),
    refresh_token_hash: sha256(refreshToken),
    refresh_expires_at: new Date(now + REFRESH_TOKEN_TTL_S * 1000).toISOString(),
  }
  let grantId = opts.grantId
  if (grantId) {
    let q = admin.from("mcp_oauth_grants").update(fields).eq("id", grantId).is("revoked_at", null)
    if (opts.expectRefreshHash) q = q.eq("refresh_token_hash", opts.expectRefreshHash)
    const { data, error } = await q.select("id")
    if (error) throw error
    if (!data?.length) return null
  } else {
    const { data, error } = await admin
      .from("mcp_oauth_grants")
      .insert({ ...fields, client_id: opts.clientId, profile_id: opts.profileId, scope: opts.scope })
      .select("id")
      .single()
    if (error) throw error
    grantId = data.id as string
  }
  return {
    grantId,
    body: {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_S,
      refresh_token: refreshToken,
      scope: opts.scope,
    },
  }
}
