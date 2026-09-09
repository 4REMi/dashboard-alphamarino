"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { MetaImportWizard } from "./meta-import-wizard"
import { getMetaImportedCreatives } from "@/lib/actions/meta"
import { generateConceptsFromMetaCreatives, confirmAIDrafts, getProjectConceptOptions, createAsset, type AIDraftConcept } from "@/lib/actions/creatives"
import type { MetaCampaignCreative } from "@/lib/types"
import { Upload, Sparkles, Film, ImageIcon, Loader2, Check, X, Save } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  projectId: string
  accountId: string
  initialCreatives: MetaCampaignCreative[]
  canManage: boolean
  // The Creative Tracker only ever shows concepts scoped to the active cycle
  // (or Evergreen ones when there's no cycle) — a concept created with no
  // cycle_id at all is invisible there even though it exists in the DB. New
  // concepts from Historial de Meta get attached to whichever cycle is
  // active right now, so they actually show up where you'd look for them.
  activeCycleId: string | null
}

function formatMoney(n: number | null) {
  return n == null ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
}

export function MetaHistory({ projectId, accountId, initialCreatives, canManage, activeCycleId }: Props) {
  const [creatives, setCreatives] = useState(initialCreatives)
  const [showWizard, setShowWizard] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Draft review, batch — same shape/interaction as the normal AI concept
  // generator, reused for whatever comes back from analyzing real creatives.
  const [drafts, setDrafts] = useState<AIDraftConcept[] | null>(null)
  const [keepDraft, setKeepDraft] = useState<boolean[]>([])
  const [confirming, setConfirming] = useState(false)

  // "Guardar como asset" — pick an existing concept for one creative at a time.
  const [assetPickerFor, setAssetPickerFor] = useState<MetaCampaignCreative | null>(null)
  const [conceptOptions, setConceptOptions] = useState<{ id: string; name: string | null; angle_type: string | null }[]>([])
  const [savingAsset, setSavingAsset] = useState(false)

  function refresh() {
    startTransition(async () => {
      setCreatives(await getMetaImportedCreatives(projectId))
    })
  }

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleGenerateConcepts() {
    setError(null)
    startTransition(async () => {
      try {
        const generated = await generateConceptsFromMetaCreatives(Array.from(selectedIds))
        setDrafts(generated)
        setKeepDraft(generated.map(() => true))
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudieron generar los conceptos")
      }
    })
  }

  function handleConfirmDrafts() {
    if (!drafts) return
    const kept = drafts.filter((_, i) => keepDraft[i])
    if (kept.length === 0) { setDrafts(null); return }
    if (!activeCycleId) {
      setError("No hay un ciclo de paid media activo en este proyecto — abre uno primero para que estos conceptos aparezcan en el Creative Tracker.")
      return
    }
    setConfirming(true)
    confirmAIDrafts(projectId, activeCycleId, kept)
      .then(() => {
        setDrafts(null)
        setSelectedIds(new Set())
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudieron crear los conceptos"))
      .finally(() => setConfirming(false))
  }

  function openAssetPicker(creative: MetaCampaignCreative) {
    setAssetPickerFor(creative)
    getProjectConceptOptions(projectId).then(setConceptOptions)
  }

  function handleSaveAsAsset(conceptId: string) {
    if (!assetPickerFor) return
    setSavingAsset(true)
    const fd = new FormData()
    fd.set("concept_id", conceptId)
    const isVideo = !!assetPickerFor.video_url
    fd.set("asset_url", (isVideo ? assetPickerFor.video_url : assetPickerFor.image_url) ?? "")
    fd.set("file_type", isVideo ? "video" : "image")
    fd.set("format", isVideo ? "Video" : "Imagen")
    createAsset(projectId, fd)
      .then(() => setAssetPickerFor(null))
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo guardar el asset"))
      .finally(() => setSavingAsset(false))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Historial de Meta</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Creativos importados de campañas pasadas de la cuenta del cliente — con o sin la agencia.
          </p>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setShowWizard(true)}>
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Importar de Meta
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {creatives.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center border rounded-lg">
          Sin creativos importados todavía.
        </p>
      ) : (
        <>
          {canManage && selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleGenerateConcepts} disabled={isPending}>
                {isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                Generar conceptos ({selectedIds.size})
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Limpiar selección</Button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {creatives.map((c) => {
              const checked = selectedIds.has(c.id)
              const thumb = c.thumbnail_url || c.image_url
              return (
                <div
                  key={c.id}
                  className={cn(
                    "rounded-xl border-2 overflow-hidden transition-all",
                    checked ? "border-primary ring-1 ring-primary" : "border-transparent"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => canManage && toggle(c.id)}
                    className="relative aspect-square w-full bg-muted block"
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-6 h-6 text-muted-foreground/40" /></div>
                    )}
                    {c.video_url && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <Film className="w-5 h-5 text-white drop-shadow" />
                      </div>
                    )}
                    {checked && (
                      <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-3 h-3 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                  <div className="p-2 space-y-1">
                    <p className="text-[11px] font-medium truncate">{c.ad_name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{c.campaign_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatMoney(c.spend)}{c.results ? ` · ${c.results} ${c.results_type ?? ""}` : ""}
                    </p>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => openAssetPicker(c)}
                        className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                      >
                        <Save className="w-2.5 h-2.5" /> Guardar como asset
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {showWizard && (
        <MetaImportWizard
          projectId={projectId}
          accountId={accountId}
          onClose={() => setShowWizard(false)}
          onImported={refresh}
        />
      )}

      {/* ── Revisión de conceptos generados en lote ── */}
      {drafts && (
        <Dialog open onOpenChange={(o) => { if (!o) setDrafts(null) }}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Sparkles className="w-4 h-4 text-purple-500" />
                {drafts.length} concepto{drafts.length !== 1 ? "s" : ""} generado{drafts.length !== 1 ? "s" : ""} de creativos reales
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              Nada se ha guardado todavía. Desmarca los que no te convenzan antes de crearlos.
            </p>
            <div className="flex-1 overflow-y-auto space-y-3 py-2">
              {drafts.map((d, i) => (
                <div key={i} className={cn("border rounded-xl overflow-hidden transition-opacity", !keepDraft[i] && "opacity-40")}>
                  <label className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border-b cursor-pointer">
                    <input
                      type="checkbox"
                      checked={keepDraft[i]}
                      onChange={() => setKeepDraft((prev) => prev.map((k, idx) => idx === i ? !k : k))}
                      className="w-3.5 h-3.5"
                    />
                    <span className="text-xs font-semibold">{d.name || `Concepto ${i + 1}`}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{d.angle_type}</span>
                  </label>
                  <div className="px-4 py-3 space-y-1.5 text-xs">
                    <p><span className="text-muted-foreground">Persona:</span> {d.target_persona}</p>
                    <p><span className="text-muted-foreground">Pain point:</span> {d.pain_point}</p>
                    <p><span className="text-muted-foreground">Por qué funciona:</span> {d.why_it_works}</p>
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter className="gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setDrafts(null)}>Cancelar</Button>
              <Button onClick={handleConfirmDrafts} disabled={confirming}>
                {confirming ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                Crear conceptos ({keepDraft.filter(Boolean).length})
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Picker: guardar un creativo como asset de un concepto existente ── */}
      {assetPickerFor && (
        <Dialog open onOpenChange={(o) => { if (!o) setAssetPickerFor(null) }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">Guardar como asset</DialogTitle>
            </DialogHeader>
            {conceptOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Sin conceptos en este proyecto todavía.</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {conceptOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSaveAsAsset(opt.id)}
                    disabled={savingAsset}
                    className="w-full text-left px-3 py-2 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/40 transition-all text-sm disabled:opacity-50"
                  >
                    {opt.name || opt.angle_type || "Sin nombre"}
                  </button>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssetPickerFor(null)}>
                <X className="w-3.5 h-3.5 mr-1.5" /> Cancelar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
