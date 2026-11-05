import { getOAuthClient, SUPPORTED_SCOPE, type OAuthClientRow } from "@/lib/mcp/oauth"

// Validación compartida entre la página /oauth/authorize (al mostrarla) y
// sus server actions (al aprobar/cancelar) — se revalida todo en el
// servidor en ambos momentos, nunca se confía en los campos ocultos.

export const AUTHORIZE_PARAMS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "state",
  "scope",
  "resource",
] as const

export type AuthorizeParams = Partial<Record<(typeof AUTHORIZE_PARAMS)[number], string>>

export type AuthorizeValidation =
  // Cliente o redirect_uri inválidos: NO se redirige (podría ser un open
  // redirect); se muestra el error en la página.
  | { kind: "fatal"; message: string }
  // Error del resto de la petición: se le avisa al cliente en su redirect_uri.
  | { kind: "redirect_error"; url: string }
  | { kind: "ok"; client: OAuthClientRow; redirectUri: string; codeChallenge: string; state?: string; scope: string; resource?: string }

export function pickAuthorizeParams(src: Record<string, string | string[] | undefined> | FormData): AuthorizeParams {
  const out: AuthorizeParams = {}
  for (const k of AUTHORIZE_PARAMS) {
    const v = src instanceof FormData ? src.get(k) : src[k]
    const s = Array.isArray(v) ? v[0] : v
    if (typeof s === "string" && s !== "") out[k] = s
  }
  return out
}

export function buildRedirect(redirectUri: string, params: Record<string, string | undefined>): string {
  const u = new URL(redirectUri)
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v)
  return u.toString()
}

export async function validateAuthorizeRequest(p: AuthorizeParams, origin: string): Promise<AuthorizeValidation> {
  const client = await getOAuthClient(p.client_id)
  if (!client) return { kind: "fatal", message: "El cliente no está registrado (client_id desconocido)." }
  // Coincidencia exacta con uno de los redirect_uri registrados.
  if (!p.redirect_uri || !client.redirect_uris.includes(p.redirect_uri)) {
    return { kind: "fatal", message: "El redirect_uri no coincide con ninguno de los registrados por este cliente." }
  }

  const fail = (error: string, description: string): AuthorizeValidation => ({
    kind: "redirect_error",
    url: buildRedirect(p.redirect_uri!, { error, error_description: description, state: p.state, iss: origin }),
  })

  if (p.response_type !== "code") return fail("unsupported_response_type", "Solo se soporta response_type=code")
  if (!p.code_challenge || p.code_challenge_method !== "S256") {
    return fail("invalid_request", "PKCE es obligatorio (code_challenge con code_challenge_method=S256)")
  }
  if (!/^[A-Za-z0-9\-_]{43}$/.test(p.code_challenge)) return fail("invalid_request", "code_challenge inválido")
  if (p.resource) {
    const allowed = [`${origin}/api/mcp`, `${origin}/api/mcp/`, origin, `${origin}/`]
    if (!allowed.includes(p.resource)) return fail("invalid_target", "resource debe ser este servidor MCP")
  }

  return {
    kind: "ok",
    client,
    redirectUri: p.redirect_uri,
    codeChallenge: p.code_challenge,
    state: p.state,
    // Un solo scope ("mcp"): da acceso a las tools con los permisos del
    // empleado. Scopes desconocidos se ignoran.
    scope: SUPPORTED_SCOPE,
    resource: p.resource,
  }
}
