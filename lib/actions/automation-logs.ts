"use server"

import { requireSessionOrTrusted } from "@/lib/auth/guards"
import { createClient } from "@/lib/supabase/server"
import type { AutomationLog } from "@/lib/types"

export async function getAutomationLogs(limit = 30): Promise<AutomationLog[]> {
  await requireSessionOrTrusted()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("automation_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as AutomationLog[]
}
