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
