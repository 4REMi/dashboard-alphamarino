"use client"

import { useState, useTransition } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConceptModal } from "./concept-modal"
import { generateCreativeConcepts, confirmAIDrafts } from "@/lib/actions/creatives"
import { CONCEPT_STATUS_COLORS, AWARENESS_LABELS } from "@/lib/constants/creatives"
import type { CreativeConcept } from "@/lib/types"
import type { AIDraftConcept } from "@/lib/actions/creatives"
import { Plus, Sparkles, Check, X, Loader2, Star, ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface ConceptsTableProps {
  concepts: CreativeConcept[]
  projectId: string
  cycleId: string | null
  isAdminOrSubadmin: boolean
}

function AIDraftRows({
  drafts,
  onConfirm,
  onDiscard,
  onDiscardAll,
  onConfirmAll,
  isConfirming,
}: {
  drafts: AIDraftConcept[]
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
        <td colSpan={6} className="px-4 py-2 bg-purple-50 border-t border-purple-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-700 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              {drafts.length} borrador{drafts.length !== 1 ? "es" : ""} generados por IA — confirma los que quieras guardar
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
        <tr key={idx} className="border-t bg-purple-50/40 hover:bg-purple-50/60 transition-colors">
          <td className="px-4 py-3">
            <Badge className="text-xs bg-purple-100 text-purple-700 border-0">AI Draft</Badge>
          </td>
          <td className="px-4 py-3">
            <div className="text-sm font-medium truncate max-w-[180px]" title={draft.target_persona}>
              {draft.target_persona}
            </div>
            <div className="text-xs text-muted-foreground truncate max-w-[180px]" title={draft.pain_or_desire}>
              {draft.pain_or_desire}
            </div>
          </td>
          <td className="px-4 py-3 text-sm hidden md:table-cell">
            <span className="inline-block max-w-[140px] truncate" title={draft.angle_type}>{draft.angle_type}</span>
          </td>
          <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
            {draft.awareness_stage} — {AWARENESS_LABELS[draft.awareness_stage] ?? ""}
          </td>
          <td className="px-4 py-3 text-xs text-muted-foreground hidden xl:table-cell">
            <span className="line-clamp-2" title={draft.proposed_hook}>{draft.proposed_hook}</span>
          </td>
          <td className="px-4 py-3">
            <div className="flex items-center justify-end gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDiscard(idx)} disabled={isConfirming}>
                <X className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-700" onClick={() => onConfirm(idx)} disabled={isConfirming}>
                <Check className="w-3.5 h-3.5" />
              </Button>
            </div>
          </td>
        </tr>
      ))}
    </>
  )
}

export function ConceptsTable({ concepts, projectId, cycleId, isAdminOrSubadmin }: ConceptsTableProps) {
  const [selectedConcept, setSelectedConcept] = useState<CreativeConcept | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [aiDrafts, setAiDrafts] = useState<AIDraftConcept[]>([])
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
  }

  function confirmSingle(idx: number) {
    const draft = aiDrafts[idx]
    if (!draft || !cycleId) return
    startConfirm(async () => {
      await confirmAIDrafts(projectId, cycleId, [draft])
      setAiDrafts((prev) => prev.filter((_, i) => i !== idx))
    })
  }

  function confirmAll() {
    if (!cycleId || !aiDrafts.length) return
    startConfirm(async () => {
      await confirmAIDrafts(projectId, cycleId, aiDrafts)
      setAiDrafts([])
    })
  }

  const colHeader = "text-left px-4 py-2.5 text-xs font-medium text-muted-foreground"

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
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className={colHeader}>Status</th>
              <th className={colHeader}>Persona / Dolor</th>
              <th className={cn(colHeader, "hidden md:table-cell")}>Ángulo</th>
              <th className={cn(colHeader, "hidden lg:table-cell")}>Awareness</th>
              <th className={cn(colHeader, "hidden xl:table-cell")}>Hook</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {/* AI drafts at top */}
            <AIDraftRows
              drafts={aiDrafts}
              onConfirm={confirmSingle}
              onDiscard={discardDraft}
              onDiscardAll={() => setAiDrafts([])}
              onConfirmAll={confirmAll}
              isConfirming={isConfirming}
            />

            {/* Evergreen row separator */}
            {evergreen.length > 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-1.5 bg-amber-50/60 border-t">
                  <span className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    Evergreen — ángulos validados del cliente
                  </span>
                </td>
              </tr>
            )}
            {evergreen.map((c) => <ConceptRow key={c.id} concept={c} onClick={() => setSelectedConcept(c)} />)}

            {/* Cycle concepts */}
            {cycleOnly.length > 0 && evergreen.length > 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-1.5 border-t bg-muted/20">
                  <span className="text-xs text-muted-foreground">Conceptos de este ciclo</span>
                </td>
              </tr>
            )}
            {cycleOnly.map((c) => <ConceptRow key={c.id} concept={c} onClick={() => setSelectedConcept(c)} />)}

            {concepts.length === 0 && aiDrafts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">
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

      {/* Modals */}
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
          isAdminOrSubadmin={isAdminOrSubadmin}
          open={!!selectedConcept}
          onClose={() => setSelectedConcept(null)}
        />
      )}
    </div>
  )
}

function ConceptRow({ concept, onClick }: { concept: CreativeConcept; onClick: () => void }) {
  return (
    <tr className="border-t hover:bg-muted/30 transition-colors cursor-pointer" onClick={onClick}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
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
      <td className="px-4 py-3">
        <div className="text-sm font-medium truncate max-w-[180px]" title={concept.target_persona}>
          {concept.target_persona || "—"}
        </div>
        <div className="text-xs text-muted-foreground truncate max-w-[180px]" title={concept.pain_or_desire}>
          {concept.pain_or_desire || "—"}
        </div>
      </td>
      <td className="px-4 py-3 text-sm hidden md:table-cell">
        <span className="truncate max-w-[140px] inline-block" title={concept.angle_type ?? ""}>
          {concept.angle_type ?? "—"}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
        {concept.awareness_stage
          ? `${concept.awareness_stage} — ${AWARENESS_LABELS[concept.awareness_stage]}`
          : "—"}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground hidden xl:table-cell max-w-[200px]">
        <span className="line-clamp-2" title={concept.proposed_hook ?? ""}>{concept.proposed_hook ?? "—"}</span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="text-xs text-muted-foreground hover:text-foreground">Ver →</span>
      </td>
    </tr>
  )
}
