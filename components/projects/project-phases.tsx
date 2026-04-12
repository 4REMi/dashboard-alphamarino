"use client"

import { useState, useTransition } from "react"
import { useTranslations, useFormatter } from "next-intl"
import type { ProjectPhase, PhaseStatus } from "@/lib/types"
import { updateProjectPhaseStatus, updateProjectPhaseNotes } from "@/lib/actions/projects"
import { phaseColor } from "@/lib/phase-colors"
import { AutoTextarea } from "@/components/ui/auto-textarea"

interface TaskCount { done: number; total: number }

interface Props {
  projectId: string
  initialPhases: ProjectPhase[]
  canEdit: boolean // admin or subadmin
  taskCountByPhaseId?: Record<string, TaskCount>
}

const STATUS_STYLES: Record<PhaseStatus, { dot: string; badge: string }> = {
  pending:     { dot: "bg-muted-foreground/40", badge: "bg-muted text-muted-foreground border-border" },
  in_progress: { dot: "bg-warning",             badge: "bg-warning-subtle text-warning-subtle-foreground border-warning-subtle" },
  completed:   { dot: "bg-success",             badge: "bg-success-subtle text-success-subtle-foreground border-success-subtle" },
  blocked:     { dot: "bg-destructive",         badge: "bg-destructive/10 text-destructive border-destructive/20" },
}

export function ProjectPhases({ projectId, initialPhases, canEdit, taskCountByPhaseId = {} }: Props) {
  const t = useTranslations("projects.phases")
  const tStatus = useTranslations("phaseStatus")
  const format = useFormatter()
  const [phases, setPhases] = useState<ProjectPhase[]>(initialPhases)
  const [expandedId, setExpandedId] = useState<string | null>(
    initialPhases.find((p) => p.status === "in_progress")?.id ??
    initialPhases.find((p) => p.status === "blocked")?.id ??
    null
  )
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null)
  const [notesValue, setNotesValue] = useState("")
  const [isPending, startTransition] = useTransition()

  const done = phases.filter((p) => p.status === "completed").length

  function handleStatusChange(phase: ProjectPhase, status: PhaseStatus) {
    setPhases((prev) => prev.map((p) => (p.id === phase.id ? { ...p, status } : p)))
    startTransition(async () => {
      await updateProjectPhaseStatus(phase.id, status, projectId)
    })
  }

  function handleSaveNotes(phaseId: string) {
    setPhases((prev) => prev.map((p) => (p.id === phaseId ? { ...p, notes: notesValue } : p)))
    setEditingNotesId(null)
    startTransition(async () => {
      await updateProjectPhaseNotes(phaseId, notesValue, projectId)
    })
  }

  const tC = useTranslations("common")

  if (phases.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
        {t("noPhases")}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header with mini stepper */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm text-foreground">{t("title")}</h3>
          <span className="text-xs text-muted-foreground">{t("completedOf", { done, total: phases.length })}</span>
        </div>
        {/* Stepper dots — border color is unique per phase, background reflects status */}
        <div className="flex items-center gap-1">
          {phases.map((phase, i) => {
            const pc = phaseColor(phase.phase_order)
            return (
              <div key={phase.id} className="flex items-center flex-1">
                <button
                  title={phase.name}
                  onClick={() => setExpandedId(expandedId === phase.id ? null : phase.id)}
                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold border-2 transition-all ${pc.border} ${
                    phase.status === "completed"
                      ? `${pc.bg} text-white`
                      : phase.status === "in_progress"
                      ? `${pc.light} ${pc.text}`
                      : phase.status === "blocked"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-background text-muted-foreground"
                  }`}
                >
                  {phase.status === "completed" ? "✓" : i + 1}
                </button>
                {i < phases.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-1 rounded-full transition-colors ${
                    phases[i + 1]?.status !== "pending" || phase.status === "completed"
                      ? `${phaseColor(i + 1).bg} opacity-30`
                      : "bg-muted"
                  }`} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Phase list */}
      <div className="divide-y divide-border">
        {phases.map((phase) => {
          const isExpanded = expandedId === phase.id
          const styles = STATUS_STYLES[phase.status]
          const pc = phaseColor(phase.phase_order)

          return (
            <div key={phase.id} className={`transition-colors ${isExpanded && phase.status !== "pending" ? "bg-muted/20" : ""}`}>
              {/* Phase row */}
              <div
                className="flex items-center gap-3 px-5 py-3 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : phase.id)}
              >
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border flex-shrink-0 ${styles.badge}`}>
                  {tStatus(phase.status)}
                </span>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${pc.bg}`} />
                <span className="flex-1 text-sm font-medium text-foreground">{phase.name}</span>
                {taskCountByPhaseId[phase.id] && (
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {taskCountByPhaseId[phase.id].done}/{taskCountByPhaseId[phase.id].total}
                  </span>
                )}
                {phase.status === "in_progress" && phase.started_at && (
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    {t("started", { date: format.dateTime(new Date(phase.started_at), { dateStyle: "short" }) })}
                  </span>
                )}
                <span className={`text-muted-foreground text-xs transition-transform ${isExpanded ? "rotate-180" : ""}`}>▾</span>
              </div>

              {/* Phase detail */}
              {isExpanded && (
                <div className="px-5 pb-4 space-y-3">
                  {/* Status controls */}
                  {canEdit && (
                    <div className="flex flex-wrap gap-2">
                      {(["pending", "in_progress", "completed", "blocked"] as PhaseStatus[]).map((s) => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(phase, s)}
                          disabled={isPending || phase.status === s}
                          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-50 ${
                            phase.status === s
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {tStatus(s)}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Notes */}
                  {editingNotesId === phase.id ? (
                    <div className="space-y-2">
                      <AutoTextarea
                        value={notesValue}
                        onChange={(e) => setNotesValue(e.target.value)}
                        rows={3}
                        autoFocus
                        placeholder={t("notesPlaceholder")}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                      />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingNotesId(null)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{tC("cancel")}</button>
                        <button onClick={() => handleSaveNotes(phase.id)} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors">{tC("save")}</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {phase.notes ? (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{phase.notes}</p>
                      ) : canEdit ? (
                        <button
                          onClick={() => { setEditingNotesId(phase.id); setNotesValue(phase.notes ?? "") }}
                          className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                        >
                          {t("addNotes")}
                        </button>
                      ) : null}
                      {phase.notes && canEdit && (
                        <button
                          onClick={() => { setEditingNotesId(phase.id); setNotesValue(phase.notes ?? "") }}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 block"
                        >
                          {t("editNotes")}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Dates */}
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    {phase.started_at && <span>{t("startLabel", { date: format.dateTime(new Date(phase.started_at), { dateStyle: "short" }) })}</span>}
                    {phase.completed_at && <span>{t("completedLabel", { date: format.dateTime(new Date(phase.completed_at), { dateStyle: "short" }) })}</span>}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
