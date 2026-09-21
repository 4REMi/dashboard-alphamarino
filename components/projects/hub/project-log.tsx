"use client"

import { useState, useTransition } from "react"
import { Bell, Calendar, Pencil, X, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ProjectLogEntry, ProjectLogCategory } from "@/lib/types"
import { addLogEntry, updateLogEntry, deleteLogEntry } from "@/lib/actions/projects"
import { AutoTextarea } from "@/components/ui/auto-textarea"
import { PingRecipientsPicker } from "@/components/tasks/ping-recipients-picker"

interface Props {
  projectId: string
  initialEntries: ProjectLogEntry[]
  currentUserId: string
  isAdmin: boolean
  compact?: boolean
}

const CATEGORIES: ProjectLogCategory[] = ["Decisión", "Bloqueo", "Cliente", "Interno"]

const CATEGORY_STYLE: Record<ProjectLogCategory, string> = {
  "Decisión": "bg-violet-100 text-violet-700 border-violet-200",
  "Bloqueo":  "bg-rose-100 text-rose-700 border-rose-200",
  "Cliente":  "bg-sky-100 text-sky-700 border-sky-200",
  "Interno":  "bg-slate-100 text-slate-600 border-slate-200",
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

function formatEventDate(dateStr: string): string {
  // event_date es DATE puro (YYYY-MM-DD) — parsear con new Date directo lo
  // corre un día atrás por timezone, así que se construye en local.
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
}

function todayStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

function CategoryPicker({ value, onChange }: { value: ProjectLogCategory | null; onChange: (v: ProjectLogCategory | null) => void }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          "text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors",
          value === null ? "bg-muted border-border" : "border-transparent text-muted-foreground hover:bg-muted/60"
        )}
      >
        Sin categoría
      </button>
      {CATEGORIES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            "text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors",
            value === c ? CATEGORY_STYLE[c] : "border-transparent text-muted-foreground hover:bg-muted/60"
          )}
        >
          {c}
        </button>
      ))}
    </div>
  )
}

export function ProjectLog({ projectId, initialEntries, currentUserId, isAdmin, compact }: Props) {
  const [entries, setEntries] = useState<ProjectLogEntry[]>(initialEntries)
  const [body, setBody] = useState("")
  const [eventDate, setEventDate] = useState("") // vacío = hoy (created_at manda)
  const [category, setCategory] = useState<ProjectLogCategory | null>(null)
  // Avisar por Telegram es opt-in, apagado por default — la mayoría de
  // las notas son solo constancia interna, no le importan a todo el
  // equipo. Mismo componente/mecánica que Ping en tareas.
  const [notify, setNotify] = useState(false)
  const [notifyRecipientIds, setNotifyRecipientIds] = useState<string[]>([])
  const [showDetails, setShowDetails] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState("")
  const [editDate, setEditDate] = useState("")
  const [editCategory, setEditCategory] = useState<ProjectLogCategory | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    const captured = body.trim()
    const capturedDate = eventDate || null
    const capturedCategory = category
    const optimistic: ProjectLogEntry = {
      id: crypto.randomUUID(),
      project_id: projectId,
      author_id: currentUserId,
      body: captured,
      created_at: new Date().toISOString(),
      event_date: capturedDate,
      category: capturedCategory,
    }
    setEntries((prev) => [optimistic, ...prev])
    setBody("")
    setEventDate("")
    setCategory(null)
    setShowDetails(false)
    const shouldNotify = notify
    const recipients = [...notifyRecipientIds]
    setNotify(false)
    setNotifyRecipientIds([])
    startTransition(async () => {
      await addLogEntry(
        projectId, captured, undefined,
        shouldNotify ? { team: recipients.length === 0, recipientIds: recipients.length > 0 ? recipients : undefined } : undefined,
        { eventDate: capturedDate, category: capturedCategory },
      )
    })
  }

  function startEdit(entry: ProjectLogEntry) {
    setEditingId(entry.id)
    setEditBody(entry.body)
    setEditDate(entry.event_date ?? "")
    setEditCategory(entry.category)
  }

  function saveEdit() {
    if (!editingId || !editBody.trim()) return
    const id = editingId
    const newBody = editBody.trim()
    const newDate = editDate || null
    const newCategory = editCategory
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, body: newBody, event_date: newDate, category: newCategory } : e))
    setEditingId(null)
    startTransition(async () => {
      await updateLogEntry(id, projectId, { body: newBody, eventDate: newDate, category: newCategory })
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <h3 className="font-semibold text-sm">Bitácora</h3>
      </div>

      {/* Input */}
      <form onSubmit={handleAdd} className="px-4 py-3 border-b border-border flex-shrink-0 space-y-2">
        <div className="flex gap-2">
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
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            title="Fecha del evento y categoría"
            className={cn(
              "self-end p-2 rounded-md border transition-colors flex-shrink-0",
              (eventDate || category || showDetails) ? "border-foreground/30 bg-muted text-foreground" : "border-input bg-background text-muted-foreground hover:bg-muted/60"
            )}
          >
            <Calendar className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setNotify((v) => !v)}
            title={notify ? "Avisar por Telegram" : "Nota silenciosa (no avisa a nadie)"}
            className={cn(
              "self-end p-2 rounded-md border transition-colors flex-shrink-0",
              notify ? "border-sky-400 bg-sky-50 text-sky-600" : "border-input bg-background text-muted-foreground hover:bg-muted/60"
            )}
          >
            <Bell className={cn("w-4 h-4", notify && "fill-current")} />
          </button>
          <button
            type="submit"
            disabled={isPending || !body.trim()}
            className="self-end px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            +
          </button>
        </div>

        {showDetails && (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={eventDate}
              max={todayStr()}
              onChange={(e) => setEventDate(e.target.value)}
              className="h-7 rounded-md border border-input bg-background px-2 text-xs"
            />
            {eventDate && (
              <button type="button" onClick={() => setEventDate("")} className="text-[11px] text-muted-foreground hover:text-foreground">
                Usar hoy
              </button>
            )}
            <div className="w-px h-4 bg-border" />
            <CategoryPicker value={category} onChange={setCategory} />
          </div>
        )}

        {notify && (
          <PingRecipientsPicker
            projectId={projectId}
            selectedIds={notifyRecipientIds}
            onChange={setNotifyRecipientIds}
          />
        )}
      </form>

      {/* Entries */}
      <div className={compact ? "overflow-y-auto max-h-64 divide-y divide-border" : "divide-y divide-border"}>
        {entries.length === 0 && (
          <p className="px-4 py-5 text-sm text-muted-foreground text-center">Sin entradas todavía.</p>
        )}
        {entries.map((entry) => {
          const canEdit = isAdmin || entry.author_id === currentUserId
          const authorName = entry.author?.full_name ?? "—"
          const isEditing = editingId === entry.id

          if (isEditing) {
            return (
              <div key={entry.id} className="px-4 py-3 space-y-2 bg-muted/30">
                <AutoTextarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  autoFocus
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="date"
                    value={editDate}
                    max={todayStr()}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                  />
                  <div className="w-px h-4 bg-border" />
                  <CategoryPicker value={editCategory} onChange={setEditCategory} />
                </div>
                <div className="flex items-center justify-end gap-1.5">
                  <button onClick={() => setEditingId(null)} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={saveEdit} disabled={!editBody.trim()} className="p-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          }

          return (
            <div key={entry.id} className="px-4 py-3 group">
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary overflow-hidden">
                  {entry.author?.avatar_url ? (
                    <img src={entry.author.avatar_url} alt={authorName} className="w-full h-full object-cover" />
                  ) : (
                    authorName[0]?.toUpperCase() ?? "?"
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5 mb-0.5 flex-wrap">
                    <span className="text-xs font-medium">{authorName}</span>
                    <span className="text-xs text-muted-foreground">
                      {entry.event_date ? formatEventDate(entry.event_date) : timeAgo(entry.created_at)}
                    </span>
                    {entry.category && (
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full border", CATEGORY_STYLE[entry.category])}>
                        {entry.category}
                      </span>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{entry.body}</p>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => startEdit(entry)}
                      className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => {
                        setEntries((prev) => prev.filter((e) => e.id !== entry.id))
                        startTransition(async () => { await deleteLogEntry(entry.id, projectId) })
                      }}
                      className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
