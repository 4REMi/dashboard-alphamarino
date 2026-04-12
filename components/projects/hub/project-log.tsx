"use client"

import { useState, useTransition } from "react"
import type { ProjectLogEntry } from "@/lib/types"
import { addLogEntry, deleteLogEntry } from "@/lib/actions/projects"
import { AutoTextarea } from "@/components/ui/auto-textarea"

interface Props {
  projectId: string
  initialEntries: ProjectLogEntry[]
  currentUserId: string
  isAdmin: boolean
  compact?: boolean
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "ahora"
  if (minutes < 60) return `hace ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `hace ${days}d`
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" })
}

export function ProjectLog({ projectId, initialEntries, currentUserId, isAdmin, compact }: Props) {
  const [entries, setEntries] = useState<ProjectLogEntry[]>(initialEntries)
  const [body, setBody] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    const captured = body.trim()
    const optimistic: ProjectLogEntry = {
      id: crypto.randomUUID(),
      project_id: projectId,
      author_id: currentUserId,
      body: captured,
      created_at: new Date().toISOString(),
    }
    setEntries((prev) => [optimistic, ...prev])
    setBody("")
    startTransition(async () => {
      await addLogEntry(projectId, captured)
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <h3 className="font-semibold text-sm">Bitácora</h3>
      </div>

      {/* Input */}
      <form onSubmit={handleAdd} className="px-4 py-3 border-b border-border flex gap-2 flex-shrink-0">
        <AutoTextarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAdd(e)
          }}
          placeholder={compact ? "Nueva nota… (Ctrl+Enter)" : "Escribe una actualización… (Ctrl+Enter)"}
          rows={compact ? 2 : 2}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
        <button
          type="submit"
          disabled={isPending || !body.trim()}
          className="self-end px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex-shrink-0"
        >
          +
        </button>
      </form>

      {/* Entries */}
      <div className={compact ? "overflow-y-auto max-h-64 divide-y divide-border" : "divide-y divide-border"}>
        {entries.length === 0 && (
          <p className="px-4 py-5 text-sm text-muted-foreground text-center">Sin entradas todavía.</p>
        )}
        {entries.map((entry) => {
          const canDelete = isAdmin || entry.author_id === currentUserId
          const authorName = entry.author?.full_name ?? "—"
          return (
            <div key={entry.id} className="px-4 py-3">
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary overflow-hidden">
                  {entry.author?.avatar_url ? (
                    <img src={entry.author.avatar_url} alt={authorName} className="w-full h-full object-cover" />
                  ) : (
                    authorName[0]?.toUpperCase() ?? "?"
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5 mb-0.5">
                    <span className="text-xs font-medium">{authorName}</span>
                    <span className="text-xs text-muted-foreground">{timeAgo(entry.created_at)}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{entry.body}</p>
                </div>
                {canDelete && (
                  <button
                    onClick={() => {
                      setEntries((prev) => prev.filter((e) => e.id !== entry.id))
                      startTransition(async () => { await deleteLogEntry(entry.id, projectId) })
                    }}
                    className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
