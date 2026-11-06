"use server"

import { createClient } from "@/lib/supabase/server"
import type { BrandBrain } from "@/lib/types"
import { draftFromInstagram, draftFromWebsite } from "@/lib/brand-brains/import-core"

async function assertAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
}

export async function importBrainFromInstagram(username: string): Promise<Partial<BrandBrain>> {
  await assertAuth()
  return draftFromInstagram(username)
}

export async function importBrainFromWebsite(url: string): Promise<Partial<BrandBrain>> {
  await assertAuth()
  return draftFromWebsite(url)
}
