"use client"

import { useState } from "react"
import { DeliverableDrawer } from "./deliverable-drawer"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { FileText, Image, Link2, ChevronDown, ChevronRight, Paperclip } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/utils"
import type { Deliverable, DeliverableType } from "@/lib/types"

const TYPE_ICON: Record<DeliverableType, React.ReactNode> = {
  text:     <FileText className="w-3.5 h-3.5" />,
  document: <Link2    className="w-3.5 h-3.5" />,
  image:    <Image    className="w-3.5 h-3.5" />,
}

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
        due_date: null,
        assignee_id: null,
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
                  {/* Type icon */}
                  <span className="text-muted-foreground flex-shrink-0">
                    {TYPE_ICON[d.type]}
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
                  <span className="hidden sm:inline text-xs text-muted-foreground bg-muted rounded px-2 py-0.5 flex-shrink-0">
                    {TYPE_LABEL[d.type]}
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
