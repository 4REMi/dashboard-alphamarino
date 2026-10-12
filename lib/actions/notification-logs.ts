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

// ── Bandeja personal (inicio del dashboard) ─────────────────────────────
// Cada quien ve SOLO sus propias notificaciones (las mismas que notify()
// manda por Telegram, se hayan enviado o no). Cliente admin + filtro por el
// usuario de la sesión: la RLS de notification_log es solo para admins.

export interface InboxItem { id: string; event_key: string; message: string; created_at: string; read: boolean }

async function sessionUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  return user.id
}

export async function getMyInbox(limit = 30): Promise<{ items: InboxItem[]; unread: number }> {
  const uid = await sessionUserId()
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const admin = createAdminClient()
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const [{ data, error }, { count }] = await Promise.all([
    admin.from("notification_log").select("id, event_key, message, created_at, read_at").eq("profile_id", uid).gte("created_at", since).order("created_at", { ascending: false }).limit(limit),
    admin.from("notification_log").select("id", { count: "exact", head: true }).eq("profile_id", uid).gte("created_at", since).is("read_at", null),
  ])
  if (error) {
    // Sin la migración 111 (read_at) la bandeja no truena: todo cuenta como leído.
    const { data: d2 } = await admin.from("notification_log").select("id, event_key, message, created_at").eq("profile_id", uid).gte("created_at", since).order("created_at", { ascending: false }).limit(limit)
    return { items: (d2 ?? []).map((r) => ({ ...r, read: true })) as InboxItem[], unread: 0 }
  }
  return { items: (data ?? []).map((r) => ({ id: r.id, event_key: r.event_key, message: r.message, created_at: r.created_at, read: !!r.read_at })), unread: count ?? 0 }
}

export async function markInboxRead(ids?: string[]): Promise<void> {
  const uid = await sessionUserId()
  const { createAdminClient } = await import("@/lib/supabase/admin")
  let q = createAdminClient().from("notification_log").update({ read_at: new Date().toISOString() }).eq("profile_id", uid).is("read_at", null)
  if (ids?.length) q = q.in("id", ids)
  await q
}
