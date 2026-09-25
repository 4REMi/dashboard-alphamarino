"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { X, Film, Trash2, Check } from "lucide-react"
import {
  createManualCampaign, updateManualCampaign, deleteManualCampaign, saveManualSnapshot, deleteManualSnapshot,
  type ManualCampaign, type ManualCampaignStatus,
} from "@/lib/actions/manual-campaigns"
import { getLinkableAssets, type LinkableAsset } from "@/lib/actions/paid-media-performance"
import { assetReviewTone } from "@/lib/utils/asset-review-tone"
import { isoToday } from "@/lib/utils/manual-campaign-calc"
import { PAID_MEDIA_PLATFORMS } from "@/lib/types"
import { cn } from "@/lib/utils"

// Crear/editar una campaña manual: datos, assets vinculados y capturas de
// métricas (acumulado a una fecha, como lo muestra el Ads Manager del canal).

const input = "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
const money = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
const STATUS_LABEL: Record<ManualCampaignStatus, string> = { active: "Activa", paused: "Pausada", ended: "Terminada" }

export function ManualCampaignModal({ projectId, cycleId, campaign, onClose }: {
  projectId: string
  cycleId: string | null
  campaign: ManualCampaign | null
  onClose: () => void
}) {
  const router = useRouter()
  const [id, setId] = useState<string | null>(campaign?.id ?? null)
  const [form, setForm] = useState({
    channel: campaign?.channel ?? "TikTok Ads",
    name: campaign?.name ?? "",
    status: (campaign?.status ?? "active") as ManualCampaignStatus,
    result_type: campaign?.result_type ?? "",
    start_date: campaign?.start_date ?? isoToday(),
    end_date: campaign?.end_date ?? "",
  })
  const [assetIds, setAssetIds] = useState<Set<string>>(new Set(campaign?.assetIds ?? []))
  const [assets, setAssets] = useState<LinkableAsset[] | null>(null)
  const [snapshots, setSnapshots] = useState(campaign?.snapshots ?? [])
  const [snap, setSnap] = useState({ as_of: isoToday(), spend: "", impressions: "", clicks: "", results: "" })
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => { getLinkableAssets(projectId, cycleId).then(setAssets) }, [projectId, cycleId])

  const run = (fn: () => Promise<void>) => {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try { await fn(); router.refresh() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    })
  }

  function save() {
    run(async () => {
      const payload = { ...form, result_type: form.result_type || null, end_date: form.end_date || null }
      if (id) await updateManualCampaign(projectId, id, payload, [...assetIds])
      else setId(await createManualCampaign(projectId, payload, [...assetIds]))
      setSaved(true)
    })
  }

  function addSnapshot() {
    if (!id) return
    const n = (v: string) => (v.trim() ? Number(v) : null)
    run(async () => {
      const s = { as_of: snap.as_of, spend: Number(snap.spend || 0), impressions: n(snap.impressions), clicks: n(snap.clicks), results: n(snap.results) }
      await saveManualSnapshot(projectId, id, s)
      setSnapshots((list) => [{ id: `local-${s.as_of}`, ...s }, ...list.filter((x) => x.as_of !== s.as_of)].sort((a, b) => (a.as_of < b.as_of ? 1 : -1)))
      setSnap({ as_of: isoToday(), spend: "", impressions: "", clicks: "", results: "" })
    })
  }

  function removeSnapshot(snapId: string) {
    if (snapId.startsWith("local-")) return
    run(async () => {
      await deleteManualSnapshot(projectId, snapId)
      setSnapshots((list) => list.filter((s) => s.id !== snapId))
    })
  }

  function remove() {
    if (!id || !confirm("¿Borrar esta campaña manual y todas sus capturas?")) return
    run(async () => { await deleteManualCampaign(projectId, id); onClose() })
  }

  const toggle = (assetId: string) => setAssetIds((s) => {
    const n = new Set(s)
    if (n.has(assetId)) n.delete(assetId)
    else n.add(assetId)
    return n
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border w-full max-w-4xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">{id ? "Campaña manual" : "Nueva campaña manual"}</h3>
            <p className="text-xs text-muted-foreground">Para canales sin integración (TikTok, Pinterest…). Interna: el cliente no la ve.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <label className="text-xs">
              <span className="text-muted-foreground">Canal</span>
              <input list="manual-channels" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} className={cn(input, "mt-0.5")} />
              <datalist id="manual-channels">
                {PAID_MEDIA_PLATFORMS.filter((p) => p !== "Meta Ads").map((p) => <option key={p} value={p} />)}
              </datalist>
            </label>
            <label className="text-xs sm:col-span-2">
              <span className="text-muted-foreground">Nombre de la campaña</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={cn(input, "mt-0.5")} placeholder="Como se llama en el Ads Manager del canal" />
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground">Estado</span>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ManualCampaignStatus })} className={cn(input, "mt-0.5")}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground">Inicio</span>
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={cn(input, "mt-0.5")} />
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground">Fin (opcional)</span>
              <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={cn(input, "mt-0.5")} />
            </label>
            <label className="text-xs sm:col-span-3">
              <span className="text-muted-foreground">Tipo de resultado</span>
              <input value={form.result_type} onChange={(e) => setForm({ ...form, result_type: e.target.value })} className={cn(input, "mt-0.5")} placeholder="ej. leads, compras, mensajes" />
            </label>
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Assets en esta campaña ({assetIds.size})</h4>
            {!assets && <p className="text-xs text-muted-foreground">Cargando…</p>}
            {assets?.length === 0 && <p className="text-xs text-muted-foreground">Sin assets en este ciclo.</p>}
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
              {assets?.map((a) => {
                const tone = assetReviewTone(a)
                const on = assetIds.has(a.id)
                return (
                  <button key={a.id} type="button" onClick={() => toggle(a.id)} className={cn("relative rounded-lg border-2 overflow-hidden text-left", tone.card, on && "ring-2 ring-primary ring-offset-1")}>
                    <div className="relative aspect-square bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {a.thumbUrl && <img src={a.thumbUrl} alt="" className="w-full h-full object-cover" />}
                      {a.fileType === "video" && <Film className="absolute bottom-1 left-1 w-3.5 h-3.5 text-white drop-shadow" />}
                      {on && <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center"><Check className="w-3 h-3" /></span>}
                    </div>
                    <div className="p-1.5">
                      <span className={cn("inline-block text-[9px] font-semibold px-1 py-px rounded-full", tone.pill)}>{tone.label}</span>
                      <p className="text-[11px] font-medium truncate">{a.conceptName ?? "Sin concepto"}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Capturas de métricas</h4>
            <p className="text-[11px] text-muted-foreground mb-2">Copia el acumulado de la campaña a una fecha, tal como lo muestra el Ads Manager del canal. Lo de cada ciclo se calcula solo.</p>
            {!id ? (
              <p className="text-xs text-muted-foreground">Guarda la campaña para empezar a capturar métricas.</p>
            ) : (
              <>
                <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr_auto] gap-2 items-end">
                  {([
                    ["as_of", "Al día", "date"], ["spend", "Inversión", "number"], ["impressions", "Impresiones", "number"],
                    ["clicks", "Clics", "number"], ["results", form.result_type ? `Resultados (${form.result_type})` : "Resultados", "number"],
                  ] as const).map(([k, label, type]) => (
                    <label key={k} className="text-xs">
                      <span className="text-muted-foreground truncate block">{label}</span>
                      <input type={type} step="any" min="0" value={snap[k]} onChange={(e) => setSnap({ ...snap, [k]: e.target.value })} className={cn(input, "mt-0.5")} />
                    </label>
                  ))}
                  <button onClick={addSnapshot} disabled={isPending || !snap.spend.trim()} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
                    Capturar
                  </button>
                </div>
                {snapshots.length > 0 && (
                  <table className="mt-3 w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr><th className="text-left font-medium py-1">Al día</th><th className="text-right font-medium">Inversión</th><th className="text-right font-medium">Impresiones</th><th className="text-right font-medium">Clics</th><th className="text-right font-medium">Resultados</th><th /></tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {snapshots.map((s) => (
                        <tr key={s.id}>
                          <td className="py-1">{s.as_of}</td>
                          <td className="text-right">{money(s.spend)}</td>
                          <td className="text-right">{s.impressions?.toLocaleString("en-US") ?? "—"}</td>
                          <td className="text-right">{s.clicks?.toLocaleString("en-US") ?? "—"}</td>
                          <td className="text-right">{s.results?.toLocaleString("en-US") ?? "—"}</td>
                          <td className="text-right pl-2">
                            <button onClick={() => removeSnapshot(s.id)} className="text-muted-foreground hover:text-red-600" title="Borrar captura"><Trash2 className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </section>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center gap-2">
          {id && <button onClick={remove} disabled={isPending} className="text-xs text-muted-foreground hover:text-red-600">Borrar campaña</button>}
          {error && <p className="text-xs text-red-600 ml-2">{error}</p>}
          {saved && !error && <p className="text-xs text-emerald-600 ml-2">Guardado</p>}
          <button onClick={onClose} className="ml-auto text-sm text-muted-foreground hover:text-foreground px-3">Cerrar</button>
          <button onClick={save} disabled={isPending || !form.name.trim() || !form.channel.trim()} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {isPending ? "Guardando…" : id ? "Guardar cambios" : "Crear campaña"}
          </button>
        </div>
      </div>
    </div>
  )
}
