"use client"

import { useState } from "react"
import { DeliverableDrawer } from "./deliverable-drawer"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { FileText, Image, Link2, ChevronDown, ChevronRight, Paperclip } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/utils"
import type { Deliverable, DeliverableType } from "@/lib/types"

const TYPE_CONFIG: Record<DeliverableType, { icon: React.ReactNode; label: string; iconClass: string; badgeClass: string }> = {
  text:     { icon: <FileText className="w-3.5 h-3.5" />, label: "Texto",     iconClass: "text-info bg-info-subtle",              badgeClass: "bg-info-subtle text-info-subtle-foreground" },
  document: { icon: <Link2    className="w-3.5 h-3.5" />, label: "Documento", iconClass: "text-warning bg-warning-subtle",         badgeClass: "bg-warning-subtle text-warning-subtle-foreground" },
  image:    { icon: <Image    className="w-3.5 h-3.5" />, label: "Imagen",    iconClass: "text-success bg-success-subtle",         badgeClass: "bg-success-subtle text-success-subtle-foreground" },
}

// kept for backward compat in places that use TYPE_LABEL directly
const TYPE_LABEL: Record<DeliverableType, string> = {
  text:     "Texto",
  document: "Documento",
  image:    "Imagen",
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
  const [drawerDeliverable, setDrawerDeliverable] = useState<Deliverable | null>(null)

  // Synthesize a minimal Task object for the drawer header
  const drawerTask = drawerDeliverable
    ? {
        id: drawerDeliverable.task_id,
        title: (drawerDeliverable.task as { title: string } | null)?.title ?? "Tarea",
        requires_deliverable: true,
        // fill required Task fields with safe defaults
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

  return (
    <>
      <section>
        {/* Section header */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2 mb-3 group"
        >
          {open
            ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
            : <ChevronRight className="w-4 h-4 text-muted-foreground" />
          }
          <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Entregables</h2>
          <span className="text-xs text-muted-foreground ml-1">{deliverables.length}</span>
        </button>

        {open && (
          <div className="border rounded-lg overflow-hidden bg-card divide-y">
            {deliverables.map((d) => {
              const uploader = d.uploader
              const initials = uploader?.full_name
                ?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
              const taskTitle = (d.task as { title: string } | null)?.title

              return (
                <button
                  key={d.id}
                  onClick={() => setDrawerDeliverable(d)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                >
                  {/* Type icon pill */}
                  <span className={cn("flex-shrink-0 p-1.5 rounded-md", TYPE_CONFIG[d.type].iconClass)}>
                    {TYPE_CONFIG[d.type].icon}
                  </span>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    {taskTitle && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {taskTitle}
                      </p>
                    )}
                  </div>

                  {/* Type badge */}
                  <span className={cn("hidden sm:inline text-xs font-medium rounded px-2 py-0.5 flex-shrink-0", TYPE_CONFIG[d.type].badgeClass)}>
                    {TYPE_CONFIG[d.type].label}
                  </span>

                  {/* Uploader + date */}
                  <div className="hidden md:flex items-center gap-2 flex-shrink-0">
                    {uploader && (
                      <>
                        <Avatar className="h-5 w-5">
                          {uploader.avatar_url ? (
                            <img
                              src={uploader.avatar_url}
                              alt={uploader.full_name}
                              className="h-full w-full object-cover"
                            />
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
            })}
          </div>
        )}
      </section>

      {/* Drawer for viewing a deliverable from this section */}
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
