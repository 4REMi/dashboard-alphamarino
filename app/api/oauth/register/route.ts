import { createAdminClient } from "@/lib/supabase/admin"
import { CORS_HEADERS, isAcceptableRedirectUri, oauthError, oauthJson, randomToken, sha256 } from "@/lib/mcp/oauth"

// Registro dinámico de clientes (RFC 7591). Abierto, como lo exige DCR:
// registrar un cliente no da acceso a nada — cada conexión necesita que
// un empleado con sesión la autorice en /oauth/authorize.
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return oauthError("invalid_client_metadata", "El cuerpo debe ser JSON")
  }

  const redirectUris = body.redirect_uris
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > 10) {
    return oauthError("invalid_redirect_uri", "redirect_uris es obligatorio (1 a 10 URIs)")
  }
  if (!redirectUris.every(isAcceptableRedirectUri)) {
    return oauthError("invalid_redirect_uri", "Cada redirect_uri debe ser https (o http en localhost) y sin fragmento")
  }

  const grantTypes = (body.grant_types as unknown) ?? ["authorization_code", "refresh_token"]
  if (!Array.isArray(grantTypes) || !grantTypes.every((g) => g === "authorization_code" || g === "refresh_token")) {
    return oauthError("invalid_client_metadata", "grant_types soportados: authorization_code, refresh_token")
  }
  const responseTypes = (body.response_types as unknown) ?? ["code"]
  if (!Array.isArray(responseTypes) || !responseTypes.every((r) => r === "code")) {
    return oauthError("invalid_client_metadata", "response_types soportado: code")
  }

  const authMethod = (body.token_endpoint_auth_method as string | undefined) ?? "none"
  if (!["none", "client_secret_post", "client_secret_basic"].includes(authMethod)) {
    return oauthError("invalid_client_metadata", "token_endpoint_auth_method no soportado")
  }

  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)
  const clientName = str(body.client_name, 100) ?? "Cliente MCP"
  const clientUri = str(body.client_uri, 500)
  const logoUri = str(body.logo_uri, 500)

  const clientId = randomToken("amoc_")
  const clientSecret = authMethod === "none" ? null : randomToken("amos_")

  const admin = createAdminClient()
  const { error } = await admin.from("mcp_oauth_clients").insert({
    client_id: clientId,
    client_name: clientName,
    redirect_uris: redirectUris,
    client_secret_hash: clientSecret ? sha256(clientSecret) : null,
    client_uri: clientUri,
    logo_uri: logoUri,
  })
  if (error) {
    console.error("[oauth/register]", error)
    return oauthError("server_error", "No se pudo registrar el cliente", 500)
  }

  return oauthJson(
    {
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: grantTypes,
      response_types: responseTypes,
      token_endpoint_auth_method: authMethod,
      ...(clientUri ? { client_uri: clientUri } : {}),
      ...(logoUri ? { logo_uri: logoUri } : {}),
    },
    201,
  )
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
