"use server"

import crypto from "crypto"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export interface McpApiKeySummary {
  id: string
  name: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

function hashKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex")
}

// Only ever returns the plaintext key at creation time — it's never
// stored, only its hash, same as any other API key system. The caller
// (the settings UI) is responsible for showing it exactly once.
export async function createMcpApiKey(name: string): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")

  const raw = `admk_${crypto.randomBytes(24).toString("base64url")}`
  const admin = createAdminClient()
  const { error } = await admin.from("mcp_api_keys").insert({
    profile_id: user.id,
    name: name.trim() || "Sin nombre",
    key_hash: hashKey(raw),
  })
  if (error) throw error
  return raw
}

export async function listMcpApiKeys(): Promise<McpApiKeySummary[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")

  const { data, error } = await supabase
    .from("mcp_api_keys")
    .select("id, name, created_at, last_used_at, revoked_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
  if (error) throw error
  return data
}

export async function revokeMcpApiKey(id: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")

  const { error } = await supabase
    .from("mcp_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("profile_id", user.id)
  if (error) throw error
}

// Conexiones OAuth (ChatGPT, etc.) — ver lib/mcp/oauth.ts. Cada una es una
// fila de mcp_oauth_grants; la RLS solo deja ver/revocar las propias.
export interface McpOAuthConnectionSummary {
  id: string
  client_name: string
  created_at: string
  last_used_at: string | null
}

export async function listMcpOAuthConnections(): Promise<McpOAuthConnectionSummary[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")

  const { data, error } = await supabase
    .from("mcp_oauth_grants")
    .select("id, created_at, last_used_at, client:mcp_oauth_clients(client_name)")
    .eq("profile_id", user.id)
    .is("revoked_at", null)
    .gt("refresh_expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []).map((g) => {
    const client = (Array.isArray(g.client) ? g.client[0] : g.client) as { client_name: string } | null
    return { id: g.id, created_at: g.created_at, last_used_at: g.last_used_at, client_name: client?.client_name ?? "Cliente MCP" }
  })
}

// Corta el acceso de inmediato: el access token deja de validar en la
// siguiente llamada y el refresh token ya no se puede canjear.
export async function revokeMcpOAuthConnection(id: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")

  const { error } = await supabase
    .from("mcp_oauth_grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("profile_id", user.id)
  if (error) throw error
}
