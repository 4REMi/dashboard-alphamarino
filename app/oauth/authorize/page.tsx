export const dynamic = "force-dynamic"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { originFromHeaders } from "@/lib/mcp/oauth"
import { AUTHORIZE_PARAMS, pickAuthorizeParams, validateAuthorizeRequest } from "@/lib/mcp/oauth-authorize"
import { Button } from "@/components/ui/button"
import { approveAuthorization, denyAuthorization } from "./actions"
import { ShieldCheck, TriangleAlert } from "lucide-react"

// Pantalla de consentimiento OAuth para el MCP (ver lib/mcp/oauth.ts).
// Exige la sesión normal del dashboard; sin sesión manda a /login y regresa
// aquí al entrar.
export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = await searchParams
  const params = pickAuthorizeParams(raw)
  const origin = originFromHeaders(await headers())

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const qs = new URLSearchParams(params as Record<string, string>).toString()
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${qs}`)}`)
  }

  const v = await validateAuthorizeRequest(params, origin)
  if (v.kind === "redirect_error") redirect(v.url)

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
  const who = (profile?.full_name as string | undefined) || user.email

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 space-y-5 shadow-sm">
        {v.kind === "fatal" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-destructive">
              <TriangleAlert className="w-5 h-5" />
              <h1 className="text-lg font-semibold">No se puede autorizar</h1>
            </div>
            <p className="text-sm text-muted-foreground">{v.message}</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-semibold">
                {v.client.client_name} quiere acceder a tu cuenta
              </h1>
            </div>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                Podrá usar las herramientas del dashboard de Alpha Marino (tareas, proyectos, notas, Meta Ads…)
                <strong className="text-foreground"> como {who}</strong>, con exactamente los mismos permisos que ya tienes.
              </p>
              <p>
                Puedes revocar este acceso cuando quieras desde tu perfil, en &quot;API keys de IA (MCP)&quot;.
              </p>
              <p className="text-xs break-all">Regresará a: {new URL(v.redirectUri).host}</p>
            </div>
            <div className="flex gap-2 justify-end">
              <form action={denyAuthorization}>
                {AUTHORIZE_PARAMS.map((k) => params[k] !== undefined && <input key={k} type="hidden" name={k} value={params[k]} />)}
                <Button type="submit" variant="outline">Cancelar</Button>
              </form>
              <form action={approveAuthorization}>
                {AUTHORIZE_PARAMS.map((k) => params[k] !== undefined && <input key={k} type="hidden" name={k} value={params[k]} />)}
                <Button type="submit">Autorizar</Button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
