"use server"

import { createClient } from "@/lib/supabase/server"

export interface NotificationLogEntry {
  id: string
  profile_id: string
  event_key: string
  channel: string
  message: string
  status: "sent" | "failed" | "skipped_no_channel"
  created_at: string
  profile?: { full_name: string } | null
}

export async function getNotificationLogs(limit = 30): Promise<NotificationLogEntry[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("notification_log")
    .select("*, profile:profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as unknown as NotificationLogEntry[]
}
