"use client"

import { useState } from "react"
import { DeliverableDrawer } from "./deliverable-drawer"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { FileText, Image, Link2, ChevronDown, ChevronRight, Paperclip, List, Layers } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/utils"
import type { Deliverable, DeliverableType } from "@/lib/types"

const TYPE_CONFIG: Record<DeliverableType, { icon: React.ReactNode; label: string; iconClass: string; badgeClass: string }> = {
  text:     { icon: <FileText className="w-3.5 h-3.5" />, label: "Texto",     iconClass: "text-info bg-info-subtle",              badgeClass: "bg-info-subtle text-info-subtle-foreground" },
  document: { icon: <Link2    className="w-3.5 h-3.5" />, label: "Documento", iconClass: "text-warning bg-warning-subtle",         badgeClass: "bg-warning-subtle text-warning-subtle-foreground" },
  image:    { icon: <Image    className="w-3.5 h-3.5" />, label: "Imagen",    iconClass: "text-success bg-success-subtle",         badgeClass: "bg-success-subtle text-success-subtle-foreground" },
}

interface DeliverablesSectionClientProps {
  deliverables: Deliverable[]
  projectId: string
  isAdmin: boolean
}

export function DeliverablesSectionClient({
  deliverables,
  projectId,
  isAdmin,
}: DeliverablesSectionClientProps) {
  const [open, setOpen] = useState(true)
  const [view, setView] = useState<"list" | "grouped">("list")
  const [drawerDeliverable, setDrawerDeliverable] = useState<Deliverable | null>(null)

  const drawerTask = drawerDeliverable
    ? {
        id: drawerDeliverable.task_id,
        title: (drawerDeliverable.task as { title: string } | null)?.title ?? "Tarea",
        requires_deliverable: true,
        project_id: projectId,
        description: null,
        status: "Done" as const,
        priority: "Low" as const,
        is_urgent: false,
        task_order: 0,
        phase_id: null,
        due_date: null,
        assignee_id: null,
        sop_id: null,
        task_set_task_id: null,
        created_at: "",
      }
    : null

  // Group by phase
  const grouped = (() => {
    const map = new Map<string, { phaseName: string; phaseOrder: number; items: Deliverable[] }>()
    const noPhase: Deliverable[] = []
    for (const d of deliverables) {
      const phase = (d.task as { phase?: { id: string; name: string; phase_order: number } | null } | null)?.phase
      if (phase) {
        if (!map.has(phase.id)) map.set(phase.id, { phaseName: phase.name, phaseOrder: phase.phase_order, items: [] })
        map.get(phase.id)!.items.push(d)
      } else {
        noPhase.push(d)
      }
    }
    const sorted = [...map.values()].sort((a, b) => a.phaseOrder - b.phaseOrder)
    if (noPhase.length > 0) sorted.push({ phaseName: "Sin fase", phaseOrder: 9999, items: noPhase })
    return sorted
  })()

  return (
    <>
      <section>
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 group flex-1 min-w-0">
            {open
              ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            }
            <Paperclip className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <h2 className="text-sm font-semibold">Entregables</h2>
            <span className="text-xs text-muted-foreground ml-1">{deliverables.length}</span>
          </button>

          {/* View toggle */}
          <div className="flex items-center rounded-md border border-border overflow-hidden flex-shrink-0">
            <button
              onClick={() => setView("list")}
              title="Vista lista"
              className={cn("p-1.5 transition-colors", view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setView("grouped")}
              title="Agrupar por fase"
              className={cn("p-1.5 transition-colors", view === "grouped" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              <Layers className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {open && (
          view === "list" ? (
            <div className="border rounded-lg overflow-hidden bg-card divide-y">
              {deliverables.map((d) => <DeliverableRow key={d.id} d={d} onClick={() => setDrawerDeliverable(d)} />)}
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map((group) => (
                <div key={group.phaseName}>
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                    <p className="text-xs font-semibold text-foreground">{group.phaseName}</p>
                    <span className="text-xs text-muted-foreground">{group.items.length}</span>
                  </div>
                  <div className="border rounded-lg overflow-hidden bg-card divide-y ml-3">
                    {group.items.map((d) => <DeliverableRow key={d.id} d={d} onClick={() => setDrawerDeliverable(d)} />)}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </section>

      <DeliverableDrawer
        task={drawerTask}
        projectId={projectId}
        deliverable={drawerDeliverable}
        isAdmin={isAdmin}
        onClose={() => setDrawerDeliverable(null)}
      />
    </>
  )
}

function DeliverableRow({ d, onClick }: { d: Deliverable; onClick: () => void }) {
  const uploader = d.uploader
  const initials = uploader?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
  const taskTitle = (d.task as { title: string } | null)?.title

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
    >
      <span className={cn("flex-shrink-0 p-1.5 rounded-md", TYPE_CONFIG[d.type].iconClass)}>
        {TYPE_CONFIG[d.type].icon}
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{d.title}</p>
        {taskTitle && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{taskTitle}</p>
        )}
      </div>

      <span className={cn("hidden sm:inline text-xs font-medium rounded px-2 py-0.5 flex-shrink-0", TYPE_CONFIG[d.type].badgeClass)}>
        {TYPE_CONFIG[d.type].label}
      </span>

      <div className="hidden md:flex items-center gap-2 flex-shrink-0">
        {uploader && (
          <>
            <Avatar className="h-5 w-5">
              {uploader.avatar_url ? (
                <img src={uploader.avatar_url} alt={uploader.full_name} className="h-full w-full object-cover" />
              ) : (
                <AvatarFallback className="text-[9px]">{initials}</AvatarFallback>
              )}
            </Avatar>
            <span className="text-xs text-muted-foreground">{uploader.full_name.split(" ")[0]}</span>
          </>
        )}
        <span className="text-xs text-muted-foreground">{formatDate(d.created_at)}</span>
      </div>
    </button>
  )
}
