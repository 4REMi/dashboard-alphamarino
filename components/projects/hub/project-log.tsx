"use client"

import { useState, useTransition } from "react"
import type { ProjectLogEntry } from "@/lib/types"
import { addLogEntry, toggleLogPin, deleteLogEntry } from "@/lib/actions/projects"

interface Props {
  projectId: string
  initialEntries: ProjectLogEntry[]
  currentUserId: string
  isAdmin: boolean
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
  return new Date(iso).toLocaleDateString("es-MX")
}

export function ProjectLog({ projectId, initialEntries, currentUserId, isAdmin }: Props) {
  const [entries, setEntries] = useState<ProjectLogEntry[]>(initialEntries)
  const [body, setBody] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    const optimistic: ProjectLogEntry = {
      id: crypto.randomUUID(),
      project_id: projectId,
      author_id: currentUserId,
      body: body.trim(),
      pinned: false,
      created_at: new Date().toISOString(),
    }
    setEntries((prev) => [optimistic, ...prev])
    const captured = body.trim()
    setBody("")
    startTransition(async () => {
      await addLogEntry(projectId, captured)
    })
  }

  function handlePin(entry: ProjectLogEntry) {
    const newPinned = !entry.pinned
    setEntries((prev) =>
      prev
        .map((e) => (e.id === entry.id ? { ...e, pinned: newPinned } : e))
        .sort((a, b) => {
          if (a.pinned && !b.pinned) return -1
          if (!a.pinned && b.pinned) return 1
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
    )
    startTransition(async () => {
      await toggleLogPin(entry.id, newPinned, projectId)
    })
  }

  function handleDelete(entryId: string) {
    setEntries((prev) => prev.filter((e) => e.id !== entryId))
    startTransition(async () => {
      await deleteLogEntry(entryId, projectId)
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="font-semibold text-sm text-foreground">Bitácora del Proyecto</h3>
      </div>

      {/* Add entry */}
      <form onSubmit={handleAdd} className="px-5 py-4 border-b border-border flex gap-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAdd(e)
          }}
          placeholder="Escribe una nota, actualización o comentario… (Ctrl+Enter para enviar)"
          rows={2}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
        <button
          type="submit"
          disabled={isPending || !body.trim()}
          className="self-end px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          Agregar
        </button>
      </form>

      {/* Entries */}
      <div className="divide-y divide-border">
        {entries.length === 0 && (
          <p className="px-5 py-6 text-sm text-muted-foreground text-center">Sin entradas todavía.</p>
        )}
        {entries.map((entry) => {
          const canDelete = isAdmin || entry.author_id === currentUserId
          const authorName = entry.author?.full_name ?? "Usuario"

          return (
            <div key={entry.id} className={`px-5 py-4 ${entry.pinned ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}`}>
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">
                  {authorName[0].toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xs font-medium text-foreground">{authorName}</span>
                    <span className="text-xs text-muted-foreground">{timeAgo(entry.created_at)}</span>
                    {entry.pinned && (
                      <span className="text-xs text-amber-500 font-medium">📌 Fijado</span>
                    )}
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{entry.body}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {isAdmin && (
                    <button
                      onClick={() => handlePin(entry)}
                      title={entry.pinned ? "Desfijar" : "Fijar"}
                      className={`p-1 rounded text-sm transition-colors ${
                        entry.pinned ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {entry.pinned ? "📌" : "📍"}
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(entry.id)}
                      title="Eliminar"
                      className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
