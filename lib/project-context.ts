import { createAdminClient } from "@/lib/supabase/admin"

// Contexto de la bitácora para la IA (reportes, briefs, MCP): las notas
// FIJADAS (cómo funciona el proyecto hoy) y las notas recientes. Solo
// servidor. Texto plano, recortado para no inflar los prompts.

export interface ProjectContext {
  pinned: string[]
  recent: string[]
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s)
const day = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })

export async function getProjectContext(projectId: string, opts: { recentDays?: number; maxRecent?: number; since?: string; until?: string } = {}): Promise<ProjectContext> {
  const admin = createAdminClient()
  const { data } = await admin.from("project_log_entries")
    .select("body, created_at, event_date, category, pinned, author:profiles!project_log_entries_author_id_fkey(full_name)")
    .eq("project_id", projectId).order("created_at", { ascending: false }).limit(200)
  const rows = (data ?? []) as unknown as { body: string; created_at: string; event_date: string | null; category: string | null; pinned: boolean | null; author: { full_name: string } | null }[]
  const fmt = (r: (typeof rows)[number], n: number) =>
    `[${r.event_date ? day(r.event_date + "T12:00:00") : day(r.created_at)}${r.category ? ` · ${r.category}` : ""}] ${r.author?.full_name ?? "Equipo"}: ${clip(r.body.trim(), n)}`
  const pinned = rows.filter((r) => r.pinned).map((r) => fmt(r, 2500))
  const from = opts.since ?? new Date(Date.now() - (opts.recentDays ?? 30) * 86_400_000).toISOString().slice(0, 10)
  const to = opts.until ?? "9999-12-31"
  const recent = rows
    .filter((r) => !r.pinned)
    .filter((r) => { const d = (r.event_date ?? r.created_at).slice(0, 10); return d >= from && d <= to })
    .slice(0, opts.maxRecent ?? 12)
    .map((r) => fmt(r, 700))
  return { pinned, recent }
}

// Bloque listo para pegar en un prompt ("" si no hay nada).
export function contextBlock(c: ProjectContext): string {
  if (!c.pinned.length && !c.recent.length) return ""
  return [
    "CONTEXTO DEL PROYECTO (bitácora interna del equipo; úsalo para entender acuerdos y situación, no lo cites literal al cliente):",
    c.pinned.length ? `Contexto fijo:\n${c.pinned.map((p) => `- ${p}`).join("\n")}` : "",
    c.recent.length ? `Notas recientes:\n${c.recent.map((p) => `- ${p}`).join("\n")}` : "",
  ].filter(Boolean).join("\n")
}
