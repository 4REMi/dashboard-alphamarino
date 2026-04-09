"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { unarchiveProject } from "@/lib/actions/projects"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { Project } from "@/lib/types"

type ArchivedProject = Pick<Project, "id" | "name" | "progress" | "project_value"> & {
  customer?: { name: string } | null
  project_type?: { name: string } | null
}

interface Props {
  projects: ArchivedProject[]
  isAdminOrSubadmin: boolean
}

function RestoreButton({ projectId }: { projectId: string }) {
  const router = useRouter()
  const tP = useTranslations("projects")
  const [isPending, startTransition] = useTransition()

  function handle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    startTransition(async () => {
      await unarchiveProject(projectId)
      router.refresh()
    })
  }

  return (
    <button
      onClick={handle}
      disabled={isPending}
      className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-50 flex-shrink-0"
    >
      {isPending ? "…" : tP("restore")}
    </button>
  )
}

export function ArchivedProjectsSection({ projects, isAdminOrSubadmin }: Props) {
  const tP = useTranslations("projects")
  const [expanded, setExpanded] = useState(false)

  if (projects.length === 0) return null

  return (
    <section>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-base font-semibold text-muted-foreground hover:text-foreground transition-colors mb-3"
      >
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {tP("archived")} ({projects.length})
      </button>

      {expanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="hover:shadow-md transition-all cursor-pointer opacity-60 hover:opacity-80">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base truncate">{project.name}</h3>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium flex-shrink-0">
                          {tP("archivedLabel")}
                        </span>
                        {project.project_type && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-medium flex-shrink-0">
                            {project.project_type.name}
                          </span>
                        )}
                      </div>
                      {project.customer && (
                        <p className="text-xs text-muted-foreground mt-0.5">{project.customer.name}</p>
                      )}
                    </div>
                    {isAdminOrSubadmin && <RestoreButton projectId={project.id} />}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
