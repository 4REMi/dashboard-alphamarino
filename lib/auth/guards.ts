import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isTrustedContext } from "@/lib/trusted-context"

// Verificaciones para server actions. Toda función exportada de un archivo
// "use server" es un endpoint público (se puede llamar con un POST directo,
// sin pasar por la UI ni por el proxy de login), así que cada una verifica
// en el servidor quién la llama. Ver la regla en AGENTS.md y el chequeo
// automático en scripts/check-server-actions.mjs.
//
// SIN "use server" a propósito: estos helpers no deben quedar expuestos.

// Una sola consulta a Supabase Auth por petición aunque una página llame
// muchas actions (cache de React, como recomienda la guía de autenticación
// de Next.js).
const currentUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

const currentRole = cache(async (userId: string) => {
  const { data } = await createAdminClient().from("profiles").select("role").eq("id", userId).single()
  return (data?.role as string | undefined) ?? null
})

// Exige sesión iniciada, o que la petición venga de un contexto de servidor
// de confianza ya autenticado (MCP, webhook de Telegram, cron): esos flujos
// no tienen cookies y hacen su propio chequeo de permisos.
export async function requireSessionOrTrusted(): Promise<void> {
  if (isTrustedContext()) return
  if (!(await currentUser())) throw new Error("Not authenticated")
}

// Exige sesión con uno de los roles indicados. Devuelve el id del usuario.
export async function requireRole(allowed: ("admin" | "subadmin" | "employee")[]): Promise<string> {
  const user = await currentUser()
  if (!user) throw new Error("Not authenticated")
  const role = await currentRole(user.id)
  if (!role || !allowed.includes(role as "admin")) throw new Error("Permission denied")
  return user.id
}
