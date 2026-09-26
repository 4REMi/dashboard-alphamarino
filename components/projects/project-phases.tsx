"use client"

import { useState, useEffect, useTransition } from "react"
import { useTranslations } from "next-intl"
import type { ProjectPhase, PhaseStatus } from "@/lib/types"
import { updateProjectPhaseStatus, deleteProjectPhase } from "@/lib/actions/projects"
import { recalculatePhaseStatus } from "@/lib/actions/tasks"
import { phaseColor } from "@/lib/phase-colors"

interface TaskCount { done: number; total: number }

interface Props {
  projectId: string
  initialPhases: ProjectPhase[]
  canEdit: boolean // admin or subadmin
  taskCountByPhaseId?: Record<string, TaskCount>
  // Botones de agregar/aplicar fases, a la derecha de la fila.
  actions?: React.ReactNode
}

const STATUS_STYLES: Record<PhaseStatus, { dot: string; badge: string }> = {
  pending:     { dot: "bg-muted-foreground/40", badge: "bg-muted text-muted-foreground border-border" },
  in_progress: { dot: "bg-warning",             badge: "bg-warning-subtle text-warning-subtle-foreground border-warning-subtle" },
  completed:   { dot: "bg-success",             badge: "bg-success-subtle text-success-subtle-foreground border-success-subtle" },
  blocked:     { dot: "bg-destructive",         badge: "bg-destructive/10 text-destructive border-destructive/20" },
}

// Fila compacta: solo la numeración. Al pasar el cursor por un círculo se
// ve la fase (nombre, estado, tareas) y, con permiso, bloquear/eliminar.
// Antes era una lista desplegable por fase (estado + notas) que ocupaba
// mucho espacio: el estado ya se deriva de las tareas y las notas nadie
// las usaba (la columna sigue en la base).
export function ProjectPhases({ projectId, initialPhases, canEdit, taskCountByPhaseId = {}, actions }: Props) {
  const t = useTranslations("projects.phases")
  const tStatus = useTranslations("phaseStatus")
  const [phases, setPhases] = useState<ProjectPhase[]>(initialPhases)
  const [, startTransition] = useTransition()

  // Keep phases in sync with fresh data after a revalidation triggered by
  // task changes elsewhere (e.g. status/checklist updates auto-syncing phase status).
  useEffect(() => {
    setPhases(initialPhases)
  }, [initialPhases])

  const done = phases.filter((p) => p.status === "completed").length
  const current = phases.find((p) => p.status === "blocked") ?? phases.find((p) => p.status === "in_progress") ?? phases.find((p) => p.status === "pending")

  function handleStatusChange(phase: ProjectPhase, status: PhaseStatus) {
    setPhases((prev) => prev.map((p) => (p.id === phase.id ? { ...p, status } : p)))
    startTransition(async () => {
      await updateProjectPhaseStatus(phase.id, status, projectId)
    })
  }

  // "blocked" is the only manual override: pending/in_progress/completed
  // are derived automatically from the phase's task statuses. Unblocking
  // recomputes the natural status from the current tasks.
  function handleToggleBlocked(phase: ProjectPhase) {
    if (phase.status === "blocked") {
      startTransition(async () => {
        const status = await recalculatePhaseStatus(phase.id, projectId)
        if (status) setPhases((prev) => prev.map((p) => (p.id === phase.id ? { ...p, status } : p)))
      })
    } else {
      handleStatusChange(phase, "blocked")
    }
  }

  function handleDeletePhase(phase: ProjectPhase) {
    const taskCount = taskCountByPhaseId[phase.id]?.total ?? 0
    const msg = taskCount > 0
      ? `¿Eliminar la fase "${phase.name}" y sus ${taskCount} tarea${taskCount === 1 ? "" : "s"}? Esta acción no se puede deshacer.`
      : `¿Eliminar la fase "${phase.name}"? Esta acción no se puede deshacer.`
    if (!confirm(msg)) return
    setPhases((prev) => prev.filter((p) => p.id !== phase.id))
    startTransition(async () => {
      await deleteProjectPhase(phase.id, projectId)
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-4 flex-wrap">
      <div className="flex-shrink-0">
        <p className="text-xs font-semibold text-foreground">Fases <span className="font-normal text-muted-foreground">· {done}/{phases.length}</span></p>
        {current && <p className="text-[11px] text-muted-foreground">Actual: <span className="text-foreground">{current.name}</span></p>}
      </div>

      {phases.length === 0 ? (
        <p className="flex-1 text-xs text-muted-foreground">{t("noPhases")}</p>
      ) : (
        <div className="flex-1 min-w-[240px] flex items-center gap-1">
          {phases.map((phase, i) => {
            const pc = phaseColor(phase.phase_order)
            const tc = taskCountByPhaseId[phase.id]
            const st = STATUS_STYLES[phase.status]
            return (
              <div key={phase.id} className="flex items-center flex-1 last:flex-none">
                <div className="relative group">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 cursor-default transition-all ${pc.border} ${
                      phase.status === "completed"
                        ? `${pc.bg} text-white`
                        : phase.status === "in_progress"
                        ? `${pc.light} ${pc.text} ring-2 ring-offset-1 ring-current`
                        : phase.status === "blocked"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-background text-muted-foreground"
                    }`}
                  >
                    {phase.status === "completed" ? "✓" : phase.status === "blocked" ? "!" : i + 1}
                  </span>
                  {/* Tarjeta al hacer hover; pt-2 = puente para poder llegar a los botones. */}
                  <div className="absolute left-1/2 -translate-x-1/2 top-full pt-2 z-30 hidden group-hover:block">
                    <div className="w-56 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg p-3 space-y-2">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Fase {i + 1}</p>
                        <p className="text-sm font-semibold leading-tight">{phase.name}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${st.badge}`}>{tStatus(phase.status)}</span>
                        <span className="text-muted-foreground">{tc ? `${tc.done}/${tc.total} tareas` : "Sin tareas"}</span>
                      </div>
                      {tc && tc.total > 0 && (
                        <div className="h-1 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full ${pc.bg}`} style={{ width: `${(tc.done / tc.total) * 100}%` }} />
                        </div>
                      )}
                      {canEdit && (
                        <div className="flex items-center gap-3 pt-1 border-t border-border text-[11px]">
                          <button onClick={() => handleToggleBlocked(phase)} className="text-muted-foreground hover:text-foreground">
                            {phase.status === "blocked" ? "Desbloquear" : "Marcar bloqueada"}
                          </button>
                          <button onClick={() => handleDeletePhase(phase)} className="ml-auto text-muted-foreground hover:text-destructive">Eliminar</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {i < phases.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-1 rounded-full ${phase.status === "completed" ? `${pc.bg} opacity-40` : "bg-muted"}`} />
                )}
              </div>
            )
          })}
        </div>
      )}

      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}
