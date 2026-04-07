"use client"

import { useState, useTransition } from "react"
import type { WebPhase, WebDeliverable } from "@/lib/types"
import { SITIO_WEB_PHASES, WEB_DELIVERABLES_DEFAULT } from "@/lib/types"
import {
  initWebPhases,
  updateWebPhaseStatus,
  toggleWebDeliverable,
  initWebDeliverables,
} from "@/lib/actions/projects"

interface Props {
  projectId: string
  initialPhases: WebPhase[]
  isAdmin: boolean
}

const STATUS_CONFIG = {
  pending: { label: "Pendiente", color: "text-muted-foreground", bg: "bg-muted/40" },
  in_progress: { label: "En progreso", color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30" },
  done: { label: "Listo", color: "text-green-500", bg: "bg-green-50 dark:bg-green-950/30" },
}

export function WebPhaseStepper({ projectId, initialPhases, isAdmin }: Props) {
  const [phases, setPhases] = useState<WebPhase[]>(initialPhases)
  const [expandedPhaseId, setExpandedPhaseId] = useState<string | null>(
    initialPhases.find((p) => p.status === "in_progress")?.id ??
    initialPhases[0]?.id ??
    null
  )
  const [isPending, startTransition] = useTransition()

  function handleInit() {
    startTransition(async () => {
      await initWebPhases(projectId, [...SITIO_WEB_PHASES])
      // Reload happens via revalidatePath — optimistic placeholder
      const optimisticPhases: WebPhase[] = SITIO_WEB_PHASES.map((name, i) => ({
        id: crypto.randomUUID(),
        project_id: projectId,
        name,
        phase_order: i,
        status: "pending",
        started_at: null,
        completed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deliverables: [],
      }))
      setPhases(optimisticPhases)

      // Init default deliverables for each phase
      for (const phase of optimisticPhases) {
        const defaults = WEB_DELIVERABLES_DEFAULT[phase.name] ?? []
        if (defaults.length) {
          await initWebDeliverables(phase.id, projectId, defaults)
        }
      }
    })
  }

  function handleStatusChange(phase: WebPhase, status: "pending" | "in_progress" | "done") {
    setPhases((prev) =>
      prev.map((p) => (p.id === phase.id ? { ...p, status } : p))
    )
    startTransition(async () => {
      await updateWebPhaseStatus(phase.id, projectId, status)
    })
  }

  function handleToggleDeliverable(phaseId: string, deliverable: WebDeliverable) {
    const newDone = !deliverable.done
    setPhases((prev) =>
      prev.map((p) =>
        p.id === phaseId
          ? {
              ...p,
              deliverables: p.deliverables?.map((d) =>
                d.id === deliverable.id ? { ...d, done: newDone } : d
              ),
            }
          : p
      )
    )
    startTransition(async () => {
      await toggleWebDeliverable(deliverable.id, newDone, projectId)
    })
  }

  if (phases.length === 0) {
    if (!isAdmin) {
      return (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Las fases del proyecto aún no han sido configuradas.
        </div>
      )
    }
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center space-y-3">
        <p className="text-sm text-muted-foreground">No hay fases configuradas todavía.</p>
        <button
          onClick={handleInit}
          disabled={isPending}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Creando fases…" : "Inicializar Fases Estándar"}
        </button>
      </div>
    )
  }

  // Calculate overall progress for display
  const done = phases.filter((p) => p.status === "done").length

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header with stepper progress */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm text-foreground">Fases del Proyecto</h3>
          <span className="text-xs text-muted-foreground">{done} / {phases.length} fases completadas</span>
        </div>
        {/* Stepper dots */}
        <div className="flex items-center gap-1">
          {phases.map((phase, i) => (
            <div key={phase.id} className="flex items-center flex-1">
              <button
                onClick={() => setExpandedPhaseId(expandedPhaseId === phase.id ? null : phase.id)}
                className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 transition-colors ${
                  phase.status === "done"
                    ? "bg-green-500 text-white"
                    : phase.status === "in_progress"
                    ? "bg-amber-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
                title={phase.name}
              >
                {phase.status === "done" ? "✓" : i + 1}
              </button>
              {i < phases.length - 1 && (
                <div className={`h-0.5 flex-1 mx-1 rounded-full ${
                  phases[i + 1].status === "done" || phase.status === "done"
                    ? "bg-green-500"
                    : "bg-muted"
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Phase list */}
      <div className="divide-y divide-border">
        {phases.map((phase) => {
          const isExpanded = expandedPhaseId === phase.id
          const cfg = STATUS_CONFIG[phase.status]
          const deliverablesDone = phase.deliverables?.filter((d) => d.done).length ?? 0
          const deliverablesTotal = phase.deliverables?.length ?? 0

          return (
            <div key={phase.id} className={`${isExpanded ? cfg.bg : ""} transition-colors`}>
              {/* Phase row */}
              <div
                className="flex items-center gap-3 px-5 py-3 cursor-pointer"
                onClick={() => setExpandedPhaseId(isExpanded ? null : phase.id)}
              >
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                  phase.status === "done"
                    ? "bg-green-500/10 border-green-500/20 text-green-500"
                    : phase.status === "in_progress"
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
                    : "bg-muted border-border text-muted-foreground"
                }`}>
                  {cfg.label}
                </span>
                <span className="flex-1 text-sm font-medium text-foreground">{phase.name}</span>
                {deliverablesTotal > 0 && (
                  <span className="text-xs text-muted-foreground">{deliverablesDone}/{deliverablesTotal}</span>
                )}
                <span className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                  ▾
                </span>
              </div>

              {/* Phase detail */}
              {isExpanded && (
                <div className="px-5 pb-4 space-y-3">
                  {/* Status controls */}
                  {isAdmin && (
                    <div className="flex gap-2">
                      {(["pending", "in_progress", "done"] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(phase, s)}
                          disabled={isPending || phase.status === s}
                          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                            phase.status === s
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          } disabled:opacity-50`}
                        >
                          {STATUS_CONFIG[s].label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Deliverables */}
                  {deliverablesTotal > 0 && (
                    <div className="space-y-1.5">
                      {phase.deliverables?.map((d) => (
                        <label key={d.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={d.done}
                            onChange={() => handleToggleDeliverable(phase.id, d)}
                            className="w-4 h-4 rounded border-border accent-primary"
                          />
                          <span className={`text-sm ${d.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                            {d.title}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  {phase.started_at && (
                    <p className="text-xs text-muted-foreground">
                      Iniciado: {new Date(phase.started_at).toLocaleDateString("es-MX")}
                      {phase.completed_at && ` · Completado: ${new Date(phase.completed_at).toLocaleDateString("es-MX")}`}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
