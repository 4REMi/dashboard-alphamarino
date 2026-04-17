"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConceptModal } from "./concept-modal"
import { AssetModal } from "./asset-modal"
import { generateCreativeConcepts, confirmAIDrafts } from "@/lib/actions/creatives"
import { CONCEPT_STATUS_COLORS, AWARENESS_LABELS, ANGLE_GUIDE } from "@/lib/constants/creatives"
import type { CreativeConcept, CreativeAsset } from "@/lib/types"
import type { AIDraftConcept } from "@/lib/actions/creatives"
import { Plus, Sparkles, Check, X, Loader2, Star, ArrowUpRight } from "lucide-react"
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
  const labelCls = "text-xs font-medium text-muted-foreground"
  const valueCls = "text-sm mt-0.5"
  const emptyCls = "text-sm mt-0.5 text-muted-foreground italic"

  function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
    return (
      <div className="space-y-0.5">
        <p className={labelCls}>{label}</p>
        {value ? <p className={valueCls}>{value}</p> : <p className={emptyCls}>—</p>}
      </div>
    )
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onDiscard() }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            Revisar borrador IA
            <Badge className="text-xs bg-purple-100 text-purple-700 border-0 ml-1">AI Draft</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <div className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Identificación</p>
            <Field label="Nombre" value={draft.name} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Principio organizador" value={draft.organizing_principle} />
              <Field label="Producto / Servicio" value={draft.product_service} />
            </div>
            <Field label="Persona objetivo" value={draft.target_persona} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ángulo" value={draft.angle_type} />
              <Field
                label="Awareness Stage"
                value={draft.awareness_stage ? `${draft.awareness_stage} — ${AWARENESS_LABELS[draft.awareness_stage] ?? ""}` : null}
              />
            </div>
            <Field label="Funnel Stage" value={draft.funnel_stage} />
          </div>

          <div className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mecanismo</p>
            <Field label="Pain Point" value={draft.pain_point} />
            <Field label="¿Por qué funciona?" value={draft.why_it_works} />
            <Field label="Objeción" value={draft.objection} />
            <Field label="Transformación" value={draft.transformation} />
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
      {drafts.map((draft, idx) => (
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
            <span className="text-xs">
              {draft.angle_type
                ? `${ANGLE_GUIDE.find((a) => a.name === draft.angle_type)?.emoji ?? ""} ${draft.angle_type}`
                : "—"}
            </span>
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
            <span className="text-xs text-muted-foreground line-clamp-2">{draft.pain_point || "—"}</span>
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
      ))}
    </>
  )
}

// ── Main table ───────────────────────────────────────────────────────────────

export function ConceptsTable({ concepts, assets, projectId, cycleId, isAdminOrSubadmin }: ConceptsTableProps) {
  const [selectedConcept, setSelectedConcept] = useState<CreativeConcept | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [aiDrafts, setAiDrafts] = useState<AIDraftConcept[]>([])
  const [previewIdx, setPreviewIdx] = useState<number | null>(null)
  const [newAssetForConceptId, setNewAssetForConceptId] = useState<string | null>(null)
  const [isGenerating, startGenerate] = useTransition()
  const [isConfirming, startConfirm] = useTransition()

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

  function handleNewAssetFromConcept() {
    if (!selectedConcept) return
    const conceptId = selectedConcept.id
    setSelectedConcept(null)
    setNewAssetForConceptId(conceptId)
  }

  // group header cell style
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
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            {/* Group headers */}
            <tr className="border-b">
              <th rowSpan={2} className={cn(subTh, "border-r w-16 align-middle")}>Status</th>
              <th colSpan={2} className={cn(groupTh, "border-r border-l")}>IDENTIFICACIÓN</th>
              <th rowSpan={2} className={cn(subTh, "border-r align-middle w-28")}>P. Organizador</th>
              <th rowSpan={2} className={cn(subTh, "border-r align-middle w-36")}>Teoría del Ángulo</th>
              <th colSpan={2} className={cn(groupTh, "border-r")}>ETAPA DE AWARENESS</th>
              <th rowSpan={2} className={cn(subTh, "border-r align-middle")}>Mecanismo</th>
              <th rowSpan={2} className={cn(subTh, "w-20 align-middle text-right")}></th>
            </tr>
            {/* Sub-headers (only fills colSpan cells) */}
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
                onClick={() => setSelectedConcept(c)}
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
                onClick={() => setSelectedConcept(c)}
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

      {showCreate && (
        <ConceptModal
          projectId={projectId}
          cycleId={cycleId}
          isAdminOrSubadmin={isAdminOrSubadmin}
          open={showCreate}
          onClose={() => setShowCreate(false)}
        />
      )}

      {selectedConcept && (
        <ConceptModal
          projectId={projectId}
          cycleId={cycleId}
          concept={selectedConcept}
          assets={assets.filter((a) => a.concept_id === selectedConcept.id)}
          isAdminOrSubadmin={isAdminOrSubadmin}
          open={!!selectedConcept}
          onClose={() => setSelectedConcept(null)}
          onNewAsset={isAdminOrSubadmin ? handleNewAssetFromConcept : undefined}
        />
      )}

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

  return (
    <tr className="border-t hover:bg-muted/30 transition-colors cursor-pointer" onClick={onClick}>
      {/* Status */}
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
      {/* IDENTIFICACIÓN — Concepto */}
      <td className="px-3 py-3">
        <div className="text-sm font-medium line-clamp-1">{concept.name || "—"}</div>
        <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{concept.product_service || "—"}</div>
      </td>
      {/* IDENTIFICACIÓN — Persona */}
      <td className="px-3 py-3">
        <div className="text-xs line-clamp-2">{concept.target_persona || "—"}</div>
      </td>
      {/* Principio Organizador */}
      <td className="px-3 py-3">
        <span className="text-xs">{concept.organizing_principle ?? "—"}</span>
      </td>
      {/* Teoría del Ángulo */}
      <td className="px-3 py-3">
        <span className="text-xs font-medium">
          {concept.angle_type
            ? `${ANGLE_GUIDE.find((a) => a.name === concept.angle_type)?.emoji ?? ""} ${concept.angle_type}`
            : "—"}
        </span>
      </td>
      {/* Awareness Stage */}
      <td className="px-3 py-3 whitespace-nowrap">
        <span className="text-xs text-muted-foreground">
          {concept.awareness_stage
            ? `${concept.awareness_stage} — ${AWARENESS_LABELS[concept.awareness_stage]}`
            : "—"}
        </span>
      </td>
      {/* Funnel Stage */}
      <td className="px-3 py-3">
        {concept.funnel_stage ? (
          <Badge className={cn("text-xs border-0 h-5 px-1.5", FUNNEL_COLORS[concept.funnel_stage] ?? "bg-gray-100 text-gray-600")}>
            {concept.funnel_stage}
          </Badge>
        ) : <span className="text-xs text-muted-foreground">—</span>}
      </td>
      {/* Mecanismo — pain point abbreviated */}
      <td className="px-3 py-3">
        <span className="text-xs text-muted-foreground line-clamp-2">{concept.pain_point ?? "—"}</span>
      </td>
      {/* Assets */}
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
