import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { resolveProject } from "@/lib/mcp/resolve-project"
import { requireEditor, text, type ToolCtx } from "@/lib/mcp/meta-tools"
import { totalsForRange, derivedMetrics, isoToday, isoAddDays, STALE_DAYS, type ManualSnapshot, type ManualTotals } from "@/lib/utils/manual-campaign-calc"

// Campañas manuales (canales sin integración: Google, TikTok, Pinterest…)
// leídas desde el MCP. Son capturas a mano acumuladas: lo de un periodo es
// la última captura dentro del rango menos la última anterior a él (misma
// cuenta que el dashboard, manual-campaign-calc.ts). Solo lectura.

const db = () => createAdminClient()

export interface ManualRow {
  channel: string; name: string; status: string; result_type: string | null
  start_date: string; end_date: string | null
  totals: ManualTotals | null; asOf: string | null; lastSnapshot: string | null; stale: boolean
}

export async function manualSummary(projectId: string, since: string, until: string): Promise<ManualRow[]> {
  const { data, error } = await db().from("manual_campaigns")
    .select("channel, name, status, result_type, start_date, end_date, snapshots:manual_campaign_snapshots(id, as_of, spend, impressions, clicks, results)")
    .eq("project_id", projectId)
    .lte("start_date", until).or(`end_date.is.null,end_date.gte.${since}`)
    .order("created_at")
  if (error) return [] // sin la migración 101
  const staleBefore = isoAddDays(isoToday(), -STALE_DAYS)
  return (data ?? []).map((c) => {
    const snaps = ((c.snapshots ?? []) as ManualSnapshot[]).map((s) => ({
      ...s, spend: Number(s.spend), results: s.results === null ? null : Number(s.results),
      impressions: s.impressions === null ? null : Number(s.impressions), clicks: s.clicks === null ? null : Number(s.clicks),
    }))
    const { totals, asOf } = totalsForRange(snaps, since, until)
    const last = [...snaps].sort((a, b) => (a.as_of < b.as_of ? 1 : -1))[0]?.as_of ?? null
    return {
      channel: c.channel as string, name: c.name as string, status: c.status as string, result_type: c.result_type as string | null,
      start_date: c.start_date as string, end_date: c.end_date as string | null,
      totals, asOf, lastSnapshot: last, stale: c.status === "active" && (!last || last < staleBefore),
    }
  })
}

const STATUS: Record<string, string> = { active: "activa", paused: "pausada", ended: "terminada" }
export const fmtMoney = (n: number, currency?: string) => currency
  ? new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(n)
  : `$${n.toLocaleString("es-MX", { maximumFractionDigits: 2 })}`
const num = (n: number | null) => (n === null ? "—" : n.toLocaleString("es-MX", { maximumFractionDigits: 0 }))

// Bloque compacto "otros canales" para sumarlo al estado de Meta.
export function manualBlock(rows: ManualRow[], currency?: string): { lines: string[]; spend: number } {
  const withData = rows.filter((r) => r.totals)
  const byChannel = new Map<string, number>()
  for (const r of withData) byChannel.set(r.channel, (byChannel.get(r.channel) ?? 0) + r.totals!.spend)
  const spend = [...byChannel.values()].reduce((a, b) => a + b, 0)
  const lines: string[] = []
  if (rows.length) {
    lines.push(`\nOtros canales (campañas manuales, capturas a mano — no en vivo): ${[...byChannel].map(([ch, v]) => `${ch} ${fmtMoney(v, currency)}`).join(" · ") || "sin capturas en el periodo"}`)
    const stale = rows.filter((r) => r.stale)
    if (stale.length) lines.push(`⚠️ Sin captura en ${STALE_DAYS}+ días: ${stale.map((r) => `${r.channel} · ${r.name}`).join(", ")}`)
  }
  return { lines, spend }
}

export function registerManualTools(server: McpServer) {
  server.registerTool(
    "campanas_manuales",
    {
      title: "Campañas manuales (otros canales)",
      description: "Campañas que no son de Meta y se registran a mano en el proyecto (Google, TikTok, Pinterest…): canal, estado, fechas, último corte capturado y lo del periodo (gasto, impresiones, clics, resultados, CTR, CPC, costo por resultado). Son capturas acumuladas a mano, no datos en vivo. Periodo: ciclo activo (por defecto), ciclo_anterior o desde/hasta. Solo admin/subadmin.",
      inputSchema: z.object({
        proyecto: z.string(),
        periodo: z.enum(["ciclo_activo", "ciclo_anterior"]).optional(),
        desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
    },
    async ({ proyecto, periodo, desde, hasta }, ctx: ToolCtx) => {
      await requireEditor(ctx)
      const p = await resolveProject(proyecto)
      const today = isoToday()
      const [{ data: cycle }, { data: integ }] = await Promise.all([
        db().from("paid_media_cycles").select("start_date, end_date").eq("project_id", p.id).eq("is_active", true).maybeSingle(),
        db().from("project_integrations").select("currency").eq("project_id", p.id).eq("platform", "meta").maybeSingle(),
      ])
      let since = cycle?.start_date ?? isoAddDays(today, -29)
      let until = cycle?.end_date && cycle.end_date < today ? cycle.end_date : today
      let label = cycle ? "ciclo activo" : "últimos 30 días"
      if (desde || hasta) { since = desde ?? since; until = hasta ?? until; label = "rango pedido" }
      else if (periodo === "ciclo_anterior") {
        const { data: prev } = await db().from("paid_media_cycles").select("start_date, end_date").eq("project_id", p.id).eq("is_active", false)
          .lt("start_date", cycle?.start_date ?? today).order("start_date", { ascending: false }).limit(1).maybeSingle()
        if (!prev) throw new Error(`${p.name} no tiene un ciclo anterior registrado; usa desde/hasta.`)
        since = prev.start_date; until = prev.end_date; label = "ciclo anterior"
      }
      const currency = (integ?.currency as string | undefined) || undefined
      const rows = await manualSummary(p.id, since, until)
      if (!rows.length) return text(`${p.name} no tiene campañas manuales en ${label} (${since} → ${until}).`)
      const lines = [`${p.name} · campañas manuales · ${label}: ${since} → ${until}`]
      for (const r of rows) {
        const t = r.totals, d = derivedMetrics(t)
        lines.push(`\n■ ${r.channel} · ${r.name} · ${STATUS[r.status] ?? r.status} · ${r.start_date} → ${r.end_date ?? "sin fin"}`)
        lines.push(t
          ? `  gasto ${fmtMoney(t.spend, currency)} · ${num(t.impressions)} impr. · ${num(t.clicks)} clics · ${num(t.results)} ${r.result_type ?? "resultados"}${d.ctr !== null ? ` · CTR ${d.ctr.toFixed(2)}%` : ""}${d.cpc !== null ? ` · CPC ${fmtMoney(d.cpc, currency)}` : ""}${d.cpa !== null ? ` · ${fmtMoney(d.cpa, currency)} c/u` : ""} (corte al ${r.asOf})`
          : "  sin capturas dentro del periodo")
        if (r.stale) lines.push(`  ⚠️ Activa y sin captura desde ${r.lastSnapshot ?? "nunca"} — el número puede estar atrasado`)
      }
      const total = rows.reduce((s, r) => s + (r.totals?.spend ?? 0), 0)
      lines.push(`\nTotal manual del periodo: ${fmtMoney(total, currency)}`)
      return text(lines.join("\n"))
    },
  )
}
