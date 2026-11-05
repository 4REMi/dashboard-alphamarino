"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { CODE_TTL_S, originFromHeaders, randomToken, sha256 } from "@/lib/mcp/oauth"
import { buildRedirect, pickAuthorizeParams, validateAuthorizeRequest } from "@/lib/mcp/oauth-authorize"

async function revalidate(formData: FormData) {
  const origin = originFromHeaders(await headers())
  const v = await validateAuthorizeRequest(pickAuthorizeParams(formData), origin)
  if (v.kind === "fatal") throw new Error(v.message)
  if (v.kind === "redirect_error") redirect(v.url)
  return { v, origin }
}

export async function approveAuthorization(formData: FormData) {
  const { v, origin } = await revalidate(formData)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión e intenta de nuevo.")

  const code = randomToken()
  const admin = createAdminClient()
  const { error } = await admin.from("mcp_oauth_codes").insert({
    code_hash: sha256(code),
    client_id: v.client.client_id,
    profile_id: user.id,
    redirect_uri: v.redirectUri,
    code_challenge: v.codeChallenge,
    scope: v.scope,
    resource: v.resource ?? null,
    expires_at: new Date(Date.now() + CODE_TTL_S * 1000).toISOString(),
  })
  if (error) throw new Error("No se pudo completar la autorización")

  redirect(buildRedirect(v.redirectUri, { code, state: v.state, iss: origin }))
}

export async function denyAuthorization(formData: FormData) {
  const { v, origin } = await revalidate(formData)
  redirect(buildRedirect(v.redirectUri, {
    error: "access_denied",
    error_description: "El usuario canceló la autorización",
    state: v.state,
    iss: origin,
  }))
}
