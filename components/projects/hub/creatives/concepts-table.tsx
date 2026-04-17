"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConceptModal } from "./concept-modal"
import { AssetModal } from "./asset-modal"
import { generateCreativeConcepts, confirmAIDrafts, promoteConcept, deleteConcept } from "@/lib/actions/creatives"
import { CONCEPT_STATUS_COLORS, AWARENESS_LABELS, ANGLE_GUIDE, PRODUCTION_STATUS_COLORS, VERDICT_COLORS } from "@/lib/constants/creatives"
import type { CreativeConcept, CreativeAsset } from "@/lib/types"
import type { AIDraftConcept } from "@/lib/actions/creatives"
import { Plus, Sparkles, Check, X, Loader2, Star, ArrowUpRight, Pencil, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

const FUNNEL_COLORS: Record<string, string> = {
  TOF: "bg-sky-100 text-sky-700",
  MOF: "bg-violet-100 text-violet-700",
  BOF: "bg-emerald-100 text-emerald-700",
}

interface ConceptsTableProps {
  concepts: CreativeConcept[]
  assets: CreativeAsset[]
  projectId: string
  cycleId: string | null
  isAdminOrSubadmin: boolean
}

// ── Concept detail modal (read-only) ─────────────────────────────────────────

function ConceptDetailModal({
  concept,
  conceptAssets,
  projectId,
  isAdminOrSubadmin,
  onEdit,
  onClose,
  onNewAsset,
}: {
  concept: CreativeConcept
  conceptAssets: CreativeAsset[]
  projectId: string
  isAdminOrSubadmin: boolean
  onEdit: () => void
  onClose: () => void
  onNewAsset: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const angleEntry = ANGLE_GUIDE.find((a) => a.name === concept.angle_type)

  function handlePromote() {
    startTransition(async () => {
      await promoteConcept(concept.id, projectId)
      onClose()
    })
  }

  function handleDelete() {
    if (!confirm("¿Eliminar este concepto?")) return
    startTransition(async () => {
      await deleteConcept(concept.id, projectId)
      onClose()
    })
  }

  const sectionLabel = "text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2"
  const fieldLabel   = "text-[11px] font-medium text-muted-foreground"
  const fieldValue   = "text-sm mt-0.5 leading-snug"
  const fieldEmpty   = "text-sm mt-0.5 text-muted-foreground/40 italic"

  function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
    return (
      <div>
        <p className={fieldLabel}>{label}</p>
        {value ? <p className={fieldValue}>{value}</p> : <p className={fieldEmpty}>—</p>}
      </div>
    )
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>{concept.name || "Concepto"}</span>
            <Badge className={cn("text-xs border-0", CONCEPT_STATUS_COLORS[concept.status])}>
              {concept.status}
            </Badge>
            {concept.parent_concept_id && (
              <span title="Evolución de concepto anterior" className="text-muted-foreground">
                <ArrowUpRight className="w-3.5 h-3.5" />
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {concept.parent && (
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 flex items-center gap-2">
            <ArrowUpRight className="w-3.5 h-3.5 flex-shrink-0" />
            Evolución de: <span className="font-medium">{concept.parent.angle_type ?? "concepto anterior"}</span>
            {" "}·{" "}<span className={CONCEPT_STATUS_COLORS[concept.parent.status]}>{concept.parent.status}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Left column */}
          <div className="space-y-5">

            {/* IDENTIFICACIÓN */}
            <div>
              <p className={sectionLabel}>Identificación</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Principio organizador" value={concept.organizing_principle} />
                  <Field label="Producto / Servicio" value={concept.product_service} />
                </div>
                <Field label="Persona objetivo" value={concept.target_persona} />
              </div>
            </div>

            {/* TEORÍA DEL ÁNGULO */}
            <div>
              <p className={sectionLabel}>Teoría del Ángulo</p>
              <div className="space-y-3">
                <div>
                  <p className={fieldLabel}>Ángulo</p>
                  <p className={fieldValue}>
                    {angleEntry ? `${angleEntry.emoji} ${concept.angle_type}` : concept.angle_type ?? "—"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className={fieldLabel}>Awareness Stage</p>
                    <p className={concept.awareness_stage ? fieldValue : fieldEmpty}>
                      {concept.awareness_stage
                        ? `${concept.awareness_stage} — ${AWARENESS_LABELS[concept.awareness_stage]}`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className={fieldLabel}>Funnel Stage</p>
                    {concept.funnel_stage
                      ? <Badge className={cn("text-xs border-0 mt-0.5", FUNNEL_COLORS[concept.funnel_stage] ?? "bg-gray-100 text-gray-600")}>{concept.funnel_stage}</Badge>
                      : <p className={fieldEmpty}>—</p>
                    }
                  </div>
                </div>
              </div>
            </div>

            {/* ASSETS */}
            {conceptAssets.length > 0 && (
              <div>
                <p className={sectionLabel}>Assets ({conceptAssets.length})</p>
                <div className="space-y-1">
                  {conceptAssets.map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-muted/40">
                      <span className="text-muted-foreground truncate mr-2">
                        {[a.format, a.platform, [a.variant, a.iteration].filter(Boolean).join("/")].filter(Boolean).join(" · ") || "Sin detalle"}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Badge className={cn("text-xs border-0 h-4 px-1.5", PRODUCTION_STATUS_COLORS[a.production_status] ?? "bg-gray-100 text-gray-600")}>
                          {a.production_status}
                        </Badge>
                        {a.verdict && (
                          <Badge className={cn("text-xs border-0 h-4 px-1.5", VERDICT_COLORS[a.verdict] ?? "")}>
                            {a.verdict}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {isAdminOrSubadmin && (
                  <button
                    type="button"
                    onClick={onNewAsset}
                    className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Nuevo asset
                  </button>
                )}
              </div>
            )}
            {conceptAssets.length === 0 && isAdminOrSubadmin && (
              <div>
                <p className={sectionLabel}>Assets</p>
                <button
                  type="button"
                  onClick={onNewAsset}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Nuevo asset
                </button>
              </div>
            )}

          </div>

          {/* Right column — Mecanismo */}
          <div className="space-y-5">
            <div>
              <p className={sectionLabel}>Mecanismo</p>
              <div className="space-y-4">
                <Field label="¿Por qué va a funcionar este ángulo?" value={concept.why_it_works} />
                <Field label="Pain Point específico" value={concept.pain_point} />
                <Field label="Objeción que derrumba" value={concept.objection} />
                <Field label="Transformación prometida" value={concept.transformation} />
                {concept.ref_links && <Field label="Referencias" value={concept.ref_links} />}
              </div>
            </div>

            {/* Insight — admin only */}
            {isAdminOrSubadmin && concept.insight && (
              <div className="border-t pt-4">
                <div className="flex items-center gap-1 mb-2">
                  <Star className="w-3 h-3 text-amber-500" />
                  <p className={sectionLabel + " mb-0"}>Insight estratégico</p>
                </div>
                <p className={fieldValue}>{concept.insight}</p>
              </div>
            )}
          </div>

        </div>

        <DialogFooter className="flex items-center justify-between pt-4 mt-2 border-t gap-2">
          <div className="flex gap-2">
            {concept.status !== "Evergreen" && isAdminOrSubadmin && (
              <Button type="button" variant="outline" size="sm" onClick={handlePromote} disabled={isPending}>
                <Star className="w-3.5 h-3.5 mr-1 text-amber-500" />
                Evergreen
              </Button>
            )}
            {isAdminOrSubadmin && (
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleDelete} disabled={isPending}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cerrar
            </Button>
            {isAdminOrSubadmin && (
              <Button size="sm" onClick={onEdit} disabled={isPending}>
                <Pencil className="w-3.5 h-3.5 mr-1" />
                Editar
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Draft preview modal ──────────────────────────────────────────────────────

function DraftPreviewModal({
  draft,
  onConfirm,
  onDiscard,
  isPending,
}: {
  draft: AIDraftConcept
  onConfirm: () => void
  onDiscard: () => void
  isPending: boolean
}) {
  const angleEntry = ANGLE_GUIDE.find((a) => a.name === draft.angle_type)
  const sectionLabel = "text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2"
  const fieldLabel   = "text-[11px] font-medium text-muted-foreground"
  const fieldValue   = "text-sm mt-0.5 leading-snug"
  const fieldEmpty   = "text-sm mt-0.5 text-muted-foreground/40 italic"

  function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
    return (
      <div>
        <p className={fieldLabel}>{label}</p>
        {value ? <p className={fieldValue}>{value}</p> : <p className={fieldEmpty}>—</p>}
      </div>
    )
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onDiscard() }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            {draft.name || "Borrador IA"}
            <Badge className="text-xs bg-purple-100 text-purple-700 border-0 ml-1">AI Draft</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-5">
            <div>
              <p className={sectionLabel}>Identificación</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Principio organizador" value={draft.organizing_principle} />
                  <Field label="Producto / Servicio" value={draft.product_service} />
                </div>
                <Field label="Persona objetivo" value={draft.target_persona} />
              </div>
            </div>
            <div>
              <p className={sectionLabel}>Teoría del Ángulo</p>
              <div className="space-y-3">
                <div>
                  <p className={fieldLabel}>Ángulo</p>
                  <p className={fieldValue}>
                    {angleEntry ? `${angleEntry.emoji} ${draft.angle_type}` : draft.angle_type || "—"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className={fieldLabel}>Awareness Stage</p>
                    <p className={draft.awareness_stage ? fieldValue : fieldEmpty}>
                      {draft.awareness_stage
                        ? `${draft.awareness_stage} — ${AWARENESS_LABELS[draft.awareness_stage] ?? ""}`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className={fieldLabel}>Funnel Stage</p>
                    {draft.funnel_stage
                      ? <Badge className={cn("text-xs border-0 mt-0.5", FUNNEL_COLORS[draft.funnel_stage] ?? "bg-gray-100 text-gray-600")}>{draft.funnel_stage}</Badge>
                      : <p className={fieldEmpty}>—</p>
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <p className={sectionLabel}>Mecanismo</p>
              <div className="space-y-4">
                <Field label="¿Por qué va a funcionar este ángulo?" value={draft.why_it_works} />
                <Field label="Pain Point específico" value={draft.pain_point} />
                <Field label="Objeción que derrumba" value={draft.objection} />
                <Field label="Transformación prometida" value={draft.transformation} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between pt-4 mt-2 border-t gap-2">
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onDiscard} disabled={isPending}>
            <X className="w-3.5 h-3.5 mr-1" />
            Descartar
          </Button>
          <Button size="sm" className="bg-purple-600 hover:bg-purple-700" onClick={onConfirm} disabled={isPending}>
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Check className="w-3.5 h-3.5 mr-1" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── AI draft rows ────────────────────────────────────────────────────────────

function AIDraftRows({
  drafts,
  onPreview,
  onConfirm,
  onDiscard,
  onDiscardAll,
  onConfirmAll,
  isConfirming,
}: {
  drafts: AIDraftConcept[]
  onPreview: (idx: number) => void
  onConfirm: (idx: number) => void
  onDiscard: (idx: number) => void
  onDiscardAll: () => void
  onConfirmAll: () => void
  isConfirming: boolean
}) {
  if (!drafts.length) return null
  return (
    <>
      <tr>
        <td colSpan={9} className="px-4 py-2 bg-purple-50 border-t border-purple-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-700 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              {drafts.length} borrador{drafts.length !== 1 ? "es" : ""} generados por IA — revisa y confirma los que quieras guardar
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="text-xs h-7 text-destructive" onClick={onDiscardAll} disabled={isConfirming}>
                Descartar todos
              </Button>
              <Button size="sm" className="text-xs h-7 bg-purple-600 hover:bg-purple-700" onClick={onConfirmAll} disabled={isConfirming}>
                {isConfirming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                Confirmar todos
              </Button>
            </div>
          </div>
        </td>
      </tr>
      {drafts.map((draft, idx) => {
        const angleEntry = ANGLE_GUIDE.find((a) => a.name === draft.angle_type)
        return (
          <tr
            key={idx}
            className="border-t bg-purple-50/40 hover:bg-purple-50/70 transition-colors cursor-pointer"
            onClick={() => onPreview(idx)}
          >
            <td className="px-3 py-3">
              <Badge className="text-xs bg-purple-100 text-purple-700 border-0">AI</Badge>
            </td>
            <td className="px-3 py-3">
              <div className="text-sm font-medium line-clamp-1">{draft.name || "—"}</div>
              <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{draft.product_service || "—"}</div>
            </td>
            <td className="px-3 py-3">
              <div className="text-xs line-clamp-2">{draft.target_persona}</div>
            </td>
            <td className="px-3 py-3">
              <span className="text-xs">{draft.organizing_principle || "—"}</span>
            </td>
            <td className="px-3 py-3">
              <span className="text-xs">{angleEntry ? `${angleEntry.emoji} ${draft.angle_type}` : draft.angle_type || "—"}</span>
            </td>
            <td className="px-3 py-3 whitespace-nowrap">
              <span className="text-xs text-muted-foreground">{draft.awareness_stage ?? "—"}</span>
            </td>
            <td className="px-3 py-3">
              {draft.funnel_stage ? (
                <Badge className={cn("text-xs border-0 h-5 px-1.5", FUNNEL_COLORS[draft.funnel_stage] ?? "bg-gray-100 text-gray-600")}>
                  {draft.funnel_stage}
                </Badge>
              ) : <span className="text-xs text-muted-foreground">—</span>}
            </td>
            <td className="px-3 py-3">
              <MecanismoCell
                why_it_works={draft.why_it_works}
                pain_point={draft.pain_point}
                objection={draft.objection}
                transformation={draft.transformation}
              />
            </td>
            <td className="px-3 py-3">
              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDiscard(idx)} disabled={isConfirming} title="Descartar">
                  <X className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-700" onClick={() => onConfirm(idx)} disabled={isConfirming} title="Confirmar">
                  <Check className="w-3.5 h-3.5" />
                </Button>
              </div>
            </td>
          </tr>
        )
      })}
    </>
  )
}

// ── Mecanismo cell — 4 sub-fields stacked ────────────────────────────────────

function MecanismoCell({
  why_it_works,
  pain_point,
  objection,
  transformation,
}: {
  why_it_works?: string | null
  pain_point?: string | null
  objection?: string | null
  transformation?: string | null
}) {
  const hasAny = why_it_works || pain_point || objection || transformation
  if (!hasAny) return <span className="text-xs text-muted-foreground">—</span>

  return (
    <div className="space-y-1 min-w-[200px]">
      {why_it_works && (
        <p className="text-xs leading-snug line-clamp-1">
          <span className="text-muted-foreground/50 font-medium select-none">¿Por qué? </span>
          {why_it_works}
        </p>
      )}
      {pain_point && (
        <p className="text-xs leading-snug line-clamp-1">
          <span className="text-muted-foreground/50 font-medium select-none">Pain: </span>
          {pain_point}
        </p>
      )}
      {objection && (
        <p className="text-xs leading-snug line-clamp-1">
          <span className="text-muted-foreground/50 font-medium select-none">Objeción: </span>
          {objection}
        </p>
      )}
      {transformation && (
        <p className="text-xs leading-snug line-clamp-1">
          <span className="text-muted-foreground/50 font-medium select-none">Transf.: </span>
          {transformation}
        </p>
      )}
    </div>
  )
}

// ── Main table ───────────────────────────────────────────────────────────────

export function ConceptsTable({ concepts, assets, projectId, cycleId, isAdminOrSubadmin }: ConceptsTableProps) {
  const [detailConcept, setDetailConcept]   = useState<CreativeConcept | null>(null)
  const [editConcept,   setEditConcept]     = useState<CreativeConcept | null>(null)
  const [showCreate,    setShowCreate]      = useState(false)
  const [aiDrafts,      setAiDrafts]        = useState<AIDraftConcept[]>([])
  const [previewIdx,    setPreviewIdx]      = useState<number | null>(null)
  const [newAssetForConceptId, setNewAssetForConceptId] = useState<string | null>(null)
  const [isGenerating, startGenerate] = useTransition()
  const [isConfirming, startConfirm]  = useTransition()

  const evergreen = concepts.filter((c) => c.status === "Evergreen")
  const cycleOnly = concepts.filter((c) => c.status !== "Evergreen")

  function handleGenerate() {
    if (!cycleId) return
    startGenerate(async () => {
      const drafts = await generateCreativeConcepts(projectId, cycleId)
      setAiDrafts(drafts)
    })
  }

  function discardDraft(idx: number) {
    setAiDrafts((prev) => prev.filter((_, i) => i !== idx))
    if (previewIdx === idx) setPreviewIdx(null)
  }

  function confirmSingle(idx: number) {
    const draft = aiDrafts[idx]
    if (!draft || !cycleId) return
    setPreviewIdx(null)
    startConfirm(async () => {
      await confirmAIDrafts(projectId, cycleId, [draft])
      setAiDrafts((prev) => prev.filter((_, i) => i !== idx))
    })
  }

  function confirmAll() {
    if (!cycleId || !aiDrafts.length) return
    setPreviewIdx(null)
    startConfirm(async () => {
      await confirmAIDrafts(projectId, cycleId, aiDrafts)
      setAiDrafts([])
    })
  }

  function openDetailAsNewAsset() {
    if (!detailConcept) return
    const id = detailConcept.id
    setDetailConcept(null)
    setNewAssetForConceptId(id)
  }

  function openEditFromDetail() {
    if (!detailConcept) return
    const c = detailConcept
    setDetailConcept(null)
    setEditConcept(c)
  }

  const groupTh = "px-3 py-1.5 text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 border-b border-border bg-muted/30"
  const subTh   = "px-3 py-2 text-left text-xs font-medium text-muted-foreground bg-muted/50"

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          {cycleOnly.length} concepto{cycleOnly.length !== 1 ? "s" : ""} en este ciclo
          {evergreen.length > 0 && ` · ${evergreen.length} evergreen`}
        </p>
        {isAdminOrSubadmin && (
          <div className="flex gap-2">
            {cycleId && (
              <Button variant="outline" size="sm" className="text-xs" onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Generando…</>
                  : <><Sparkles className="w-3.5 h-3.5 mr-1 text-purple-500" />Generar con IA</>
                }
              </Button>
            )}
            <Button size="sm" className="text-xs" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Nuevo concepto
            </Button>
          </div>
        )}
      </div>

      <div className="border rounded-lg overflow-hidden bg-card overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead>
            <tr className="border-b">
              <th rowSpan={2} className={cn(subTh, "border-r w-16 align-middle")}>Status</th>
              <th colSpan={2} className={cn(groupTh, "border-r border-l")}>IDENTIFICACIÓN</th>
              <th rowSpan={2} className={cn(subTh, "border-r align-middle w-28")}>P. Organizador</th>
              <th rowSpan={2} className={cn(subTh, "border-r align-middle w-36")}>Teoría del Ángulo</th>
              <th colSpan={2} className={cn(groupTh, "border-r")}>ETAPA DE AWARENESS</th>
              <th rowSpan={2} className={cn(subTh, "border-r align-middle")}>Mecanismo</th>
              <th rowSpan={2} className={cn(subTh, "w-16 align-middle text-right")}></th>
            </tr>
            <tr className="border-b">
              <th className={cn(subTh, "border-l w-40")}>Concepto</th>
              <th className={cn(subTh, "border-r w-44")}>Persona</th>
              <th className={cn(subTh, "w-20")}>Stage</th>
              <th className={cn(subTh, "border-r w-16")}>Funnel</th>
            </tr>
          </thead>
          <tbody>
            <AIDraftRows
              drafts={aiDrafts}
              onPreview={setPreviewIdx}
              onConfirm={confirmSingle}
              onDiscard={discardDraft}
              onDiscardAll={() => setAiDrafts([])}
              onConfirmAll={confirmAll}
              isConfirming={isConfirming}
            />

            {evergreen.length > 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-1.5 bg-amber-50/60 border-t">
                  <span className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    Evergreen — ángulos validados del cliente
                  </span>
                </td>
              </tr>
            )}
            {evergreen.map((c) => (
              <ConceptRow
                key={c.id}
                concept={c}
                conceptAssets={assets.filter((a) => a.concept_id === c.id)}
                onClick={() => setDetailConcept(c)}
              />
            ))}

            {cycleOnly.length > 0 && evergreen.length > 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-1.5 border-t bg-muted/20">
                  <span className="text-xs text-muted-foreground">Conceptos de este ciclo</span>
                </td>
              </tr>
            )}
            {cycleOnly.map((c) => (
              <ConceptRow
                key={c.id}
                concept={c}
                conceptAssets={assets.filter((a) => a.concept_id === c.id)}
                onClick={() => setDetailConcept(c)}
              />
            ))}

            {concepts.length === 0 && aiDrafts.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground text-sm">
                  Sin conceptos{cycleId ? " para este ciclo" : ""}
                  {isAdminOrSubadmin && cycleId && (
                    <p className="text-xs mt-1">Crea uno manualmente o genera con IA</p>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Draft preview modal */}
      {previewIdx !== null && aiDrafts[previewIdx] && (
        <DraftPreviewModal
          draft={aiDrafts[previewIdx]}
          onConfirm={() => confirmSingle(previewIdx)}
          onDiscard={() => { discardDraft(previewIdx); setPreviewIdx(null) }}
          isPending={isConfirming}
        />
      )}

      {/* Concept detail modal (read-only) */}
      {detailConcept && (
        <ConceptDetailModal
          concept={detailConcept}
          conceptAssets={assets.filter((a) => a.concept_id === detailConcept.id)}
          projectId={projectId}
          isAdminOrSubadmin={isAdminOrSubadmin}
          onEdit={openEditFromDetail}
          onClose={() => setDetailConcept(null)}
          onNewAsset={openDetailAsNewAsset}
        />
      )}

      {/* Edit modal — opens from detail modal "Editar" button */}
      {editConcept && (
        <ConceptModal
          projectId={projectId}
          cycleId={cycleId}
          concept={editConcept}
          assets={assets.filter((a) => a.concept_id === editConcept.id)}
          isAdminOrSubadmin={isAdminOrSubadmin}
          open={!!editConcept}
          onClose={() => setEditConcept(null)}
          onNewAsset={() => {
            const id = editConcept.id
            setEditConcept(null)
            setNewAssetForConceptId(id)
          }}
        />
      )}

      {/* Create concept modal */}
      {showCreate && (
        <ConceptModal
          projectId={projectId}
          cycleId={cycleId}
          isAdminOrSubadmin={isAdminOrSubadmin}
          open={showCreate}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Asset creation pre-linked to concept */}
      {newAssetForConceptId && (
        <AssetModal
          projectId={projectId}
          cycleId={cycleId}
          concepts={concepts}
          defaultConceptId={newAssetForConceptId}
          isAdminOrSubadmin={isAdminOrSubadmin}
          open={!!newAssetForConceptId}
          onClose={() => setNewAssetForConceptId(null)}
        />
      )}
    </div>
  )
}

// ── Concept row ──────────────────────────────────────────────────────────────

function ConceptRow({
  concept,
  conceptAssets,
  onClick,
}: {
  concept: CreativeConcept
  conceptAssets: CreativeAsset[]
  onClick: () => void
}) {
  const publishedCount = conceptAssets.filter((a) => a.production_status === "Published").length
  const angleEntry = ANGLE_GUIDE.find((a) => a.name === concept.angle_type)

  return (
    <tr className="border-t hover:bg-muted/30 transition-colors cursor-pointer" onClick={onClick}>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1">
          <Badge className={cn("text-xs border-0", CONCEPT_STATUS_COLORS[concept.status])}>
            {concept.status}
          </Badge>
          {concept.parent_concept_id && (
            <span title="Evolución de concepto anterior">
              <ArrowUpRight className="w-3 h-3 text-muted-foreground" />
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="text-sm font-medium line-clamp-1">{concept.name || "—"}</div>
        <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{concept.product_service || "—"}</div>
      </td>
      <td className="px-3 py-3">
        <div className="text-xs line-clamp-2">{concept.target_persona || "—"}</div>
      </td>
      <td className="px-3 py-3">
        <span className="text-xs">{concept.organizing_principle ?? "—"}</span>
      </td>
      <td className="px-3 py-3">
        <span className="text-xs font-medium">
          {angleEntry ? `${angleEntry.emoji} ${concept.angle_type}` : concept.angle_type ?? "—"}
        </span>
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <span className="text-xs text-muted-foreground">
          {concept.awareness_stage
            ? `${concept.awareness_stage} — ${AWARENESS_LABELS[concept.awareness_stage]}`
            : "—"}
        </span>
      </td>
      <td className="px-3 py-3">
        {concept.funnel_stage ? (
          <Badge className={cn("text-xs border-0 h-5 px-1.5", FUNNEL_COLORS[concept.funnel_stage] ?? "bg-gray-100 text-gray-600")}>
            {concept.funnel_stage}
          </Badge>
        ) : <span className="text-xs text-muted-foreground">—</span>}
      </td>
      <td className="px-3 py-3">
        <MecanismoCell
          why_it_works={concept.why_it_works}
          pain_point={concept.pain_point}
          objection={concept.objection}
          transformation={concept.transformation}
        />
      </td>
      <td className="px-3 py-3 text-right">
        {conceptAssets.length > 0 ? (
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-xs font-medium">{conceptAssets.length} asset{conceptAssets.length !== 1 ? "s" : ""}</span>
            {publishedCount > 0 && (
              <span className="text-xs text-emerald-600">{publishedCount} pub.</span>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Ver →</span>
        )}
      </td>
    </tr>
  )
}
