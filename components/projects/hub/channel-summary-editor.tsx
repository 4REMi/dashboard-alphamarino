"use client"

import { Plus, X, Lock } from "lucide-react"
import { PAID_MEDIA_PLATFORMS, type CycleChannelRow } from "@/lib/types"
import { cn } from "@/lib/utils"

// Resumen manual del ciclo desglosado por canal. Los totales (inversión,
// resultados, CPA, ROAS ponderado por inversión) se calculan de las filas —
// Meta viene sincronizado, el resto de canales se captura a mano.

export interface ChannelDraft { channel: string; spend: string; results: string; roas: string }

export const toDraft = (r: CycleChannelRow): ChannelDraft => ({
  channel: r.channel, spend: r.spend?.toString() ?? "", results: r.results?.toString() ?? "", roas: r.roas?.toString() ?? "",
})

const num = (v: string) => (v.trim() ? Number(v) : null)

export function draftsToRows(drafts: ChannelDraft[]): CycleChannelRow[] {
  return drafts
    .filter((d) => d.channel.trim() && (d.spend.trim() || d.results.trim() || d.roas.trim()))
    .map((d) => ({ channel: d.channel.trim(), spend: num(d.spend), results: num(d.results), roas: num(d.roas) }))
}

export function channelTotals(rows: CycleChannelRow[]) {
  if (!rows.length) return { real_spend: null, real_results: null, cpa_real: null, roas_real: null }
  const spend = rows.reduce((s, r) => s + (r.spend ?? 0), 0)
  const results = rows.reduce((s, r) => s + (r.results ?? 0), 0)
  const withRoas = rows.filter((r) => r.roas !== null && (r.spend ?? 0) > 0)
  const roasSpend = withRoas.reduce((s, r) => s + (r.spend ?? 0), 0)
  const round = (v: number) => Math.round(v * 100) / 100
  return {
    real_spend: round(spend),
    real_results: round(results),
    cpa_real: results > 0 ? round(spend / results) : null,
    roas_real: roasSpend > 0 ? round(withRoas.reduce((s, r) => s + (r.spend ?? 0) * (r.roas ?? 0), 0) / roasSpend) : null,
  }
}

// Filas iniciales: el desglose guardado; si no hay, Meta con lo
// sincronizado (y el total viejo sin desglosar, si existía, aparte).
// Las campañas manuales suman su canal (ej. TikTok Ads) igual que Meta con el sync.
export function initialDrafts(
  saved: CycleChannelRow[] | null | undefined,
  legacy: { real_spend: number | null; real_results: number | null; roas_real: number | null },
  metaSpend: number | null,
  manual: { channel: string; spend: number; results: number | null }[] = [],
): ChannelDraft[] {
  if (saved?.length) return saved.map(toDraft)
  if (legacy.real_spend !== null || legacy.real_results !== null) {
    return [toDraft({ channel: "Sin desglosar", spend: legacy.real_spend, results: legacy.real_results, roas: legacy.roas_real })]
  }
  const r2 = (v: number) => String(Math.round(v * 100) / 100)
  const byChannel = new Map<string, { spend: number; results: number | null }>()
  for (const m of manual) {
    const cur = byChannel.get(m.channel) ?? { spend: 0, results: null }
    cur.spend += m.spend
    if (m.results !== null) cur.results = (cur.results ?? 0) + m.results
    byChannel.set(m.channel, cur)
  }
  return [
    { channel: "Meta Ads", spend: metaSpend ? r2(metaSpend) : "", results: "", roas: "" },
    ...[...byChannel].map(([channel, v]) => ({ channel, spend: r2(v.spend), results: v.results === null ? "" : r2(v.results), roas: "" })),
  ]
}

// Canales cuyo número NO se escribe a mano: Meta (sync) y los que tienen
// campañas manuales registradas (suma de sus capturas). Así un total no se
// puede "forzar" en la fila: si no cuadra, se corrige en la campaña.
export interface LockedChannel { spend: number; results: number | null; source: string; lockResults: boolean }

// Reemplaza (o agrega) las filas bloqueadas con su número de origen.
export function applyLocked(drafts: ChannelDraft[], locked: Record<string, LockedChannel>): ChannelDraft[] {
  const r2 = (v: number) => String(Math.round(v * 100) / 100)
  const pending = new Map(Object.entries(locked))
  const next = drafts.map((d) => {
    const l = locked[d.channel.trim()]
    if (!l) return d
    pending.delete(d.channel.trim())
    return { ...d, spend: r2(l.spend), results: l.lockResults ? (l.results === null ? "" : r2(l.results)) : d.results }
  })
  return [...next, ...[...pending].map(([channel, l]) => ({ channel, spend: r2(l.spend), results: l.lockResults && l.results !== null ? r2(l.results) : "", roas: "" }))]
}

const fmt$ = (v: number | null) => (v === null ? "—" : `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`)

export function ChannelSummaryEditor({ drafts, onChange, locked = {}, onFixLocked }: {
  drafts: ChannelDraft[]
  onChange: (d: ChannelDraft[]) => void
  locked?: Record<string, LockedChannel>
  // Lleva a donde se corrige el origen (p. ej. la lista de campañas manuales).
  onFixLocked?: () => void
}) {
  const totals = channelTotals(draftsToRows(drafts))
  const used = new Set(drafts.map((d) => d.channel))
  const set = (i: number, patch: Partial<ChannelDraft>) => onChange(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  const input = "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
  const nextChannel = PAID_MEDIA_PLATFORMS.find((p) => !used.has(p) && !locked[p]) ?? "Otro"

  return (
    <div className="max-w-3xl">
      <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_24px] gap-2 text-[11px] text-muted-foreground mb-1">
        <span>Canal</span><span>Inversión</span><span>Resultados</span><span>ROAS</span><span />
      </div>
      <div className="space-y-2">
        {drafts.map((d, i) => {
          const l = locked[d.channel.trim()]
          const ro = "bg-muted/50 text-foreground cursor-not-allowed border-transparent"
          // Una fila a mano con el mismo nombre que un canal bloqueado duplicaría su gasto.
          const dup = !l && drafts.some((o, j) => j !== i && o.channel.trim() === d.channel.trim())
          return (
            <div key={i}>
              <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_24px] gap-2 items-center">
                <input list="cycle-channels" value={d.channel} readOnly={!!l} onChange={(e) => set(i, { channel: e.target.value })} className={cn(input, l && ro)} placeholder="Canal" />
                <input type="number" step="any" min="0" value={d.spend} readOnly={!!l} onChange={(e) => set(i, { spend: e.target.value })} className={cn(input, l && ro)} />
                <input type="number" step="any" min="0" value={d.results} readOnly={!!l?.lockResults} onChange={(e) => set(i, { results: e.target.value })} className={cn(input, l?.lockResults && ro)} placeholder={l?.lockResults ? "—" : undefined} />
                <input type="number" step="any" min="0" value={d.roas} onChange={(e) => set(i, { roas: e.target.value })} className={input} placeholder="opcional" />
                {l ? (
                  <span title="Viene de su origen; no se edita aquí"><Lock className="w-3.5 h-3.5 text-muted-foreground" /></span>
                ) : (
                  <button type="button" onClick={() => onChange(drafts.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-600" title="Quitar canal">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {l ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  🔒 {l.source}
                  {onFixLocked && l.source.includes("campaña") && <> · <button type="button" onClick={onFixLocked} className="text-primary hover:underline">¿No cuadra? Revisa las campañas</button></>}
                </p>
              ) : d.channel.trim() && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">✎ a mano{dup ? " · ⚠ este canal está repetido" : ""}</p>
              )}
            </div>
          )
        })}
      </div>
      <datalist id="cycle-channels">
        {PAID_MEDIA_PLATFORMS.filter((p) => !locked[p]).map((p) => <option key={p} value={p} />)}
      </datalist>
      <button type="button" onClick={() => onChange([...drafts, { channel: nextChannel, spend: "", results: "", roas: "" }])} className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
        <Plus className="w-3.5 h-3.5" /> {Object.keys(locked).length ? "Agregar canal sin campañas registradas" : "Agregar canal"}
      </button>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {[
          ["Inversión total", fmt$(totals.real_spend)],
          ["Resultados", totals.real_results?.toLocaleString("en-US") ?? "—"],
          ["CPA", fmt$(totals.cpa_real)],
          ["ROAS", totals.roas_real === null ? "—" : `${totals.roas_real}x`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">CPA = inversión ÷ resultados. ROAS total ponderado por la inversión de los canales que lo tienen.</p>
    </div>
  )
}
