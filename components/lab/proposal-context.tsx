"use client"

// Shared "reconstruct canonical context with the proposal highlighted" pieces,
// used by both the author's view (my-proposals-view.tsx) and the reviewer's
// view (phase-review-panel.tsx) so the two never drift out of sync again.

import type { CanonicalTask } from "@/lib/types"
import { ListChecks, Layers, Lock, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Positioned list with one highlighted item — tasks within a phase ──────────

export function PositionedTaskContext({
  anchorTasks, afterIndex, isEdit, editTaskId, proposedTitle,
}: {
  anchorTasks: { id: string; title: string }[]
  afterIndex: number
  isEdit: boolean
  editTaskId?: string | null
  proposedTitle: string
}) {
  if (anchorTasks.length === 0) return null
  const withHighlight: { id: string; title: string; highlighted: boolean }[] =
    anchorTasks.map((t) => ({ id: t.id, title: t.title, highlighted: false }))
  if (!isEdit) withHighlight.splice(afterIndex + 1, 0, { id: "__new__", title: proposedTitle, highlighted: true })

  return (
    <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
      {withHighlight.map((t, i) => {
        const isThisEdit = isEdit && t.id === editTaskId
        const highlighted = t.highlighted || isThisEdit
        return (
          <div
            key={t.id}
            className={cn(
              "px-3 py-2 text-sm flex items-center gap-2",
              highlighted && "border-2 border-dashed border-primary/50 bg-primary/5"
            )}
          >
            {highlighted
              ? <ListChecks className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              : <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground flex-shrink-0">{i + 1}</span>}
            <span className={cn("truncate", highlighted && "font-medium text-primary")}>
              {isThisEdit ? proposedTitle : t.title}{highlighted && (isThisEdit ? " (edición propuesta)" : " (propuesta)")}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Positioned list with one highlighted item — phases within a phase set ─────

export function PositionedPhaseContext({
  orderedPhases, afterIndex, proposedName,
}: {
  orderedPhases: { id: string; name: string }[]
  afterIndex: number
  proposedName: string
}) {
  const withHighlight: { id: string; name: string; highlighted: boolean }[] =
    orderedPhases.map((p) => ({ id: p.id, name: p.name, highlighted: false }))
  withHighlight.splice(afterIndex + 1, 0, { id: "__new__", name: proposedName, highlighted: true })

  return (
    <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
      {withHighlight.map((p, i) => (
        <div
          key={p.id}
          className={cn(
            "px-3 py-2 text-sm flex items-center gap-2",
            p.highlighted && "border-2 border-dashed border-primary/50 bg-primary/5"
          )}
        >
          {p.highlighted
            ? <Layers className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            : <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground flex-shrink-0">{i + 1}</span>}
          <span className={cn("truncate", p.highlighted && "font-medium text-primary")}>
            {p.name}{p.highlighted && " (propuesta)"}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Before/after diff for a task-edit proposal — only changed fields render ───

export function TaskEditDiff({ original, proposed }: {
  original: CanonicalTask
  proposed: {
    title: string
    description: string | null
    requires_deliverable: boolean
    deliverable_instructions?: string | null
    default_position?: { name: string } | null
    sop?: { title: string } | null
    checklist_items?: { text: string; is_blocking: boolean }[]
  }
}) {
  const rows: { label: string; before: string; after: string }[] = []

  if (original.title !== proposed.title) {
    rows.push({ label: "Título", before: original.title, after: proposed.title })
  }
  if ((original.description ?? "") !== (proposed.description ?? "")) {
    rows.push({ label: "Descripción", before: original.description || "—", after: proposed.description || "—" })
  }
  if (original.requires_deliverable !== proposed.requires_deliverable) {
    rows.push({
      label: "Entregable",
      before: original.requires_deliverable ? "Requiere entregable" : "No requiere entregable",
      after: proposed.requires_deliverable ? "Requiere entregable" : "No requiere entregable",
    })
  }
  if ((original.deliverable_instructions ?? "") !== (proposed.deliverable_instructions ?? "")) {
    rows.push({
      label: "Instrucciones del entregable",
      before: original.deliverable_instructions || "—",
      after: proposed.deliverable_instructions || "—",
    })
  }
  if ((original.default_position_name ?? "") !== (proposed.default_position?.name ?? "")) {
    rows.push({ label: "Puesto", before: original.default_position_name || "Sin puesto", after: proposed.default_position?.name || "Sin puesto" })
  }
  if ((original.sop_title ?? "") !== (proposed.sop?.title ?? "")) {
    rows.push({ label: "SOP", before: original.sop_title || "Sin SOP", after: proposed.sop?.title || "Sin SOP" })
  }

  const originalItems = original.checklist_items ?? []
  const proposedItems = proposed.checklist_items ?? []
  const checklistKey = (items: { text: string; is_blocking: boolean }[]) =>
    items.map((i) => `${i.text}::${i.is_blocking}`).join("|")
  const checklistChanged = checklistKey(originalItems) !== checklistKey(proposedItems)

  if (rows.length === 0 && !checklistChanged) {
    return (
      <p className="text-xs text-muted-foreground italic">Sin cambios detectados respecto a la tarea original.</p>
    )
  }

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
        <ArrowRight className="w-3.5 h-3.5" /> Qué cambia
      </p>
      <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
        {rows.map((row) => (
          <div key={row.label} className="px-3 py-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">{row.label}</p>
            <div className="flex items-start gap-2 text-xs">
              <span className="flex-1 min-w-0 text-muted-foreground line-through decoration-destructive/50">{row.before}</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5" />
              <span className="flex-1 min-w-0 font-medium text-primary">{row.after}</span>
            </div>
          </div>
        ))}

        {checklistChanged && (
          <div className="px-3 py-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Checklist</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Antes</p>
                {originalItems.length === 0 && <p className="text-muted-foreground/60 italic">Sin checklist</p>}
                {originalItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-1 text-muted-foreground line-through decoration-destructive/50">
                    {item.is_blocking && <Lock className="w-2.5 h-2.5 flex-shrink-0" />}
                    <span className="truncate">{item.text}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Propuesto</p>
                {proposedItems.length === 0 && <p className="text-muted-foreground/60 italic">Sin checklist</p>}
                {proposedItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-1 font-medium text-primary">
                    {item.is_blocking && <Lock className="w-2.5 h-2.5 flex-shrink-0" />}
                    <span className="truncate">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Existing checklist on a task, with the newly-proposed items appended ──────

export function ChecklistBeforeAfter({ anchorItems, proposedItems }: {
  anchorItems: { id: string; text: string; is_blocking: boolean }[]
  proposedItems: { id: string; text: string; is_blocking: boolean }[]
}) {
  return (
    <>
      {anchorItems.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Checklist actual</p>
          <div className="rounded-lg border border-border/50 divide-y divide-border/30 bg-muted/20">
            {anchorItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <span className={cn("truncate flex-1 min-w-0", item.is_blocking && "font-medium text-foreground")}>{item.text}</span>
                {item.is_blocking && <Lock className="w-2.5 h-2.5 text-destructive flex-shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
          <ListChecks className="w-3.5 h-3.5" /> Ítems propuestos
        </p>
        {proposedItems.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Sin ítems.</p>
        ) : (
          <div className="rounded-lg border border-primary/20 bg-primary/5 divide-y divide-border/30">
            {proposedItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className={cn("flex-1 min-w-0 truncate", item.is_blocking && "font-medium")}>{item.text}</span>
                {item.is_blocking && <Lock className="w-2.5 h-2.5 text-destructive flex-shrink-0" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
