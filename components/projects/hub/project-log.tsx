"use client"

import { Fragment, useMemo, useRef, useState, useTransition } from "react"
import { Bell, Calendar, Pencil, X, Check, Pin, PinOff, ImagePlus, Bold, List, Link2, Search, Loader2, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ProjectLogEntry, ProjectLogCategory } from "@/lib/types"
import { addLogEntry, updateLogEntry, deleteLogEntry, setLogEntryPinned } from "@/lib/actions/projects"
import { createClient } from "@/lib/supabase/client"
import { AutoTextarea } from "@/components/ui/auto-textarea"
import { PingRecipientsPicker } from "@/components/tasks/ping-recipients-picker"
import { RichText } from "@/components/projects/hub/rich-text"

// Bitácora del proyecto — "contexto vivo":
//  - Contexto fijo (notas fijadas: acuerdos, con quién se habla, reglas)
//    siempre a la vista; cualquier miembro del proyecto fija o edita.
//  - Línea de tiempo agrupada por semana, con filtro por categoría y búsqueda.
//  - Editor con formato básico (negritas, listas, enlaces) e imágenes:
//    Ctrl+V, arrastrar o botón. Las imágenes van a un bucket privado.

interface Props {
  projectId: string
  initialEntries: ProjectLogEntry[]
  currentUserId: string
  isAdmin: boolean
  compact?: boolean
}

type Attachment = NonNullable<ProjectLogEntry["attachments"]>[number] & { uploading?: boolean }

const CATEGORIES: ProjectLogCategory[] = ["Decisión", "Bloqueo", "Cliente", "Interno"]
const CATEGORY_STYLE: Record<ProjectLogCategory, string> = {
  "Decisión": "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-900",
  "Bloqueo":  "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
  "Cliente":  "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-900",
  "Interno":  "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
}

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return "ahora"
  if (minutes < 60) return `hace ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `hace ${days}d`
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" })
}
function formatEventDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
}
// "1 oct 2026, 14:32" — fecha y hora exactas en hora local.
function exactDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}
function todayStr(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`
}
const entryDate = (e: ProjectLogEntry) => (e.event_date ? new Date(e.event_date + "T12:00:00") : new Date(e.created_at))
function weekLabel(d: Date): string {
  const monday = new Date(d); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const now = new Date(); now.setHours(0, 0, 0, 0); now.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  const diff = Math.round((now.getTime() - monday.getTime()) / (7 * 86_400_000))
  if (diff === 0) return "Esta semana"
  if (diff === 1) return "Semana pasada"
  return `Semana del ${monday.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: monday.getFullYear() !== now.getFullYear() ? "numeric" : undefined })}`
}

function CategoryPicker({ value, onChange }: { value: ProjectLogCategory | null; onChange: (v: ProjectLogCategory | null) => void }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <button type="button" onClick={() => onChange(null)} className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full border", value === null ? "bg-muted border-border" : "border-transparent text-muted-foreground hover:bg-muted/60")}>Sin categoría</button>
      {CATEGORIES.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)} className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full border", value === c ? CATEGORY_STYLE[c] : "border-transparent text-muted-foreground hover:bg-muted/60")}>{c}</button>
      ))}
    </div>
  )
}

// ── Editor con formato e imágenes (Ctrl+V / arrastrar / botón) ──────
function useImageUploads(projectId: string) {
  const [items, setItems] = useState<Attachment[]>([])
  const [error, setError] = useState<string | null>(null)
  async function addFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"))
    if (!images.length) return
    setError(null)
    const supabase = createClient()
    for (const file of images) {
      const ext = (file.type.split("/")[1] ?? "png").replace("jpeg", "jpg").slice(0, 4)
      const path = `${projectId}/${crypto.randomUUID()}.${ext}`
      const preview = URL.createObjectURL(file)
      const dims = await new Promise<{ w: number; h: number }>((res) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 0, h: 0 }); im.src = preview })
      setItems((s) => [...s, { path, name: file.name || "imagen", url: preview, width: dims.w, height: dims.h, uploading: true }])
      const { error: upErr } = await supabase.storage.from("project-log").upload(path, file, { contentType: file.type, upsert: false })
      if (upErr) {
        setError(upErr.message.includes("Bucket not found") ? "Falta correr la migración 110 en Supabase" : `No se pudo subir la imagen: ${upErr.message}`)
        setItems((s) => s.filter((a) => a.path !== path))
      } else {
        setItems((s) => s.map((a) => (a.path === path ? { ...a, uploading: false } : a)))
      }
    }
  }
  return { items, setItems, addFiles, error, uploading: items.some((a) => a.uploading) }
}

function Composer({ value, onChange, onSubmit, uploads, placeholder, autoFocus, minRows = 3 }: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  uploads: ReturnType<typeof useImageUploads>
  placeholder: string
  autoFocus?: boolean
  minRows?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function wrap(before: string, after = before, fallback = "texto") {
    const el = ref.current
    if (!el) return
    const { selectionStart: a, selectionEnd: b } = el
    const sel = value.slice(a, b) || fallback
    onChange(value.slice(0, a) + before + sel + after + value.slice(b))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + before.length, a + before.length + sel.length) })
  }
  function listify() {
    const el = ref.current
    if (!el) return
    const a = value.lastIndexOf("\n", el.selectionStart - 1) + 1
    onChange(value.slice(0, a) + "- " + value.slice(a))
    requestAnimationFrame(() => el.focus())
  }

  return (
    <div
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true) } }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); uploads.addFiles([...e.dataTransfer.files]) }}
      className={cn("rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring", dragging ? "border-primary border-dashed bg-primary/5" : "border-input")}
    >
      <AutoTextarea
        textareaRef={ref}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => {
          const files = [...e.clipboardData.files]
          if (files.some((f) => f.type.startsWith("image/"))) { e.preventDefault(); uploads.addFiles(files) }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSubmit() }
          if (e.key === "b" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); wrap("**") }
        }}
        placeholder={placeholder}
        rows={minRows}
        className="w-full bg-transparent px-3 py-2.5 text-sm resize-none focus:outline-none"
      />
      {uploads.items.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-2">
          {uploads.items.map((a) => (
            <div key={a.path} className="relative w-20 h-20 rounded-md overflow-hidden border border-border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {a.url && <img src={a.url} alt="" className="w-full h-full object-cover" />}
              {a.uploading && <div className="absolute inset-0 bg-background/60 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin" /></div>}
              <button type="button" onClick={() => uploads.setItems((s) => s.filter((x) => x.path !== a.path))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-0.5 px-2 py-1 border-t border-border/60 text-muted-foreground">
        <button type="button" title="Negritas (Ctrl+B)" onClick={() => wrap("**")} className="p-1.5 rounded hover:bg-muted hover:text-foreground"><Bold className="w-3.5 h-3.5" /></button>
        <button type="button" title="Lista" onClick={listify} className="p-1.5 rounded hover:bg-muted hover:text-foreground"><List className="w-3.5 h-3.5" /></button>
        <button type="button" title="Enlace" onClick={() => wrap("[", "](https://)", "texto del enlace")} className="p-1.5 rounded hover:bg-muted hover:text-foreground"><Link2 className="w-3.5 h-3.5" /></button>
        <button type="button" title="Agregar imagen (también Ctrl+V o arrastrar)" onClick={() => fileRef.current?.click()} className="p-1.5 rounded hover:bg-muted hover:text-foreground"><ImagePlus className="w-3.5 h-3.5" /></button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { uploads.addFiles([...(e.target.files ?? [])]); e.target.value = "" }} />
        <span className="ml-auto text-[10px]">Ctrl+V para pegar imágenes · Ctrl+Enter para publicar</span>
      </div>
      {uploads.error && <p className="px-3 pb-2 text-xs text-red-600">{uploads.error}</p>}
    </div>
  )
}

function Gallery({ items, onOpen }: { items: Attachment[]; onOpen: (url: string) => void }) {
  if (!items.length) return null
  return (
    <div className={cn("mt-2 grid gap-1.5", items.length === 1 ? "grid-cols-1 max-w-md" : "grid-cols-2 sm:grid-cols-3 max-w-xl")}>
      {items.map((a) => (
        <button key={a.path} type="button" onClick={() => a.url && onOpen(a.url)} className="block rounded-md overflow-hidden border border-border bg-muted hover:opacity-90">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {a.url ? <img src={a.url} alt={a.name} className={cn("w-full object-cover", items.length === 1 ? "max-h-72 object-contain bg-black/5" : "h-28")} /> : <span className="block h-28 text-xs text-muted-foreground p-2">{a.name}</span>}
        </button>
      ))}
    </div>
  )
}

export function ProjectLog({ projectId, initialEntries, currentUserId, isAdmin }: Props) {
  const [entries, setEntries] = useState<ProjectLogEntry[]>(initialEntries)
  const [body, setBody] = useState("")
  const [eventDate, setEventDate] = useState("")
  const [category, setCategory] = useState<ProjectLogCategory | null>(null)
  const [pinNew, setPinNew] = useState(false)
  const [notify, setNotify] = useState(false)
  const [notifyRecipientIds, setNotifyRecipientIds] = useState<string[]>([])
  const [showDetails, setShowDetails] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Una nota fijada sale en ambas columnas: se edita solo donde se pidió.
  const [editingWhere, setEditingWhere] = useState<"timeline" | "pinned">("timeline")
  const [editBody, setEditBody] = useState("")
  const [editDate, setEditDate] = useState("")
  const [editCategory, setEditCategory] = useState<ProjectLogCategory | null>(null)
  const [filter, setFilter] = useState<ProjectLogCategory | null>(null)
  const [query, setQuery] = useState("")
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const uploads = useImageUploads(projectId)
  const editUploads = useImageUploads(projectId)

  const run = (fn: () => Promise<void>) => startTransition(async () => { try { setError(null); await fn() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } })

  function handleAdd() {
    if ((!body.trim() && !uploads.items.length) || uploads.uploading) return
    const atts = uploads.items.map(({ uploading: _u, ...a }) => { void _u; return a })
    const optimistic: ProjectLogEntry = {
      id: crypto.randomUUID(), project_id: projectId, author_id: currentUserId, body: body.trim(),
      created_at: new Date().toISOString(), event_date: eventDate || null, category, pinned: pinNew, attachments: atts,
    }
    setEntries((prev) => [optimistic, ...prev])
    const captured = { body: body.trim() || "(imagen)", eventDate: eventDate || null, category, atts, pinned: pinNew, notify, recipients: [...notifyRecipientIds] }
    setBody(""); setEventDate(""); setCategory(null); setShowDetails(false); setPinNew(false); setNotify(false); setNotifyRecipientIds([]); uploads.setItems([])
    run(() => addLogEntry(
      projectId, captured.body, undefined,
      captured.notify ? { team: captured.recipients.length === 0, recipientIds: captured.recipients.length ? captured.recipients : undefined } : undefined,
      { eventDate: captured.eventDate, category: captured.category, attachments: captured.atts, pinned: captured.pinned },
    ))
  }

  function startEdit(entry: ProjectLogEntry, where: "timeline" | "pinned" = "timeline") {
    setEditingWhere(where)
    setEditingId(entry.id); setEditBody(entry.body); setEditDate(entry.event_date ?? ""); setEditCategory(entry.category)
    editUploads.setItems((entry.attachments ?? []).map((a) => ({ ...a })))
  }
  function saveEdit() {
    if (!editingId || editUploads.uploading) return
    const id = editingId
    const atts = editUploads.items.map(({ uploading: _u, ...a }) => { void _u; return a })
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, body: editBody.trim(), event_date: editDate || null, category: editCategory, attachments: atts } : e)))
    setEditingId(null)
    run(() => updateLogEntry(id, projectId, { body: editBody.trim() || "(imagen)", eventDate: editDate || null, category: editCategory, attachments: atts }))
  }
  function togglePin(entry: ProjectLogEntry) {
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, pinned: !e.pinned } : e)))
    run(() => setLogEntryPinned(entry.id, projectId, !entry.pinned))
  }

  const pinned = entries.filter((e) => e.pinned)
  const timeline = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = entries.filter((e) => (!filter || e.category === filter) && (!q || e.body.toLowerCase().includes(q) || (e.author?.full_name ?? "").toLowerCase().includes(q)))
      .sort((a, b) => entryDate(b).getTime() - entryDate(a).getTime())
    const groups: { label: string; items: ProjectLogEntry[] }[] = []
    for (const e of list) {
      const label = weekLabel(entryDate(e))
      const g = groups[groups.length - 1]
      if (g && g.label === label) g.items.push(e); else groups.push({ label, items: [e] })
    }
    return groups
  }, [entries, filter, query])

  // Función de render (no componente): declarada aquí como componente se
  // re-montaría en cada tecla y el editor perdería el foco.
  function renderEntry(entry: ProjectLogEntry, variant: "timeline" | "pinned") {
    const canEdit = isAdmin || entry.author_id === currentUserId || !!entry.pinned
    const authorName = entry.author?.full_name ?? "—"
    const long = entry.body.length > 420 || entry.body.split("\n").length > 10
    const isOpen = expanded.has(entry.id) || !long

    if (editingId === entry.id && editingWhere === variant) {
      return (
        <div className="rounded-xl border border-primary/40 bg-card p-3 space-y-2">
          <Composer value={editBody} onChange={setEditBody} onSubmit={saveEdit} uploads={editUploads} placeholder="Edita la nota…" autoFocus minRows={4} />
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={editDate} max={todayStr()} onChange={(e) => setEditDate(e.target.value)} className="h-7 rounded-md border border-input bg-background px-2 text-xs" />
            <CategoryPicker value={editCategory} onChange={setEditCategory} />
            <div className="ml-auto flex gap-1.5">
              <button onClick={() => setEditingId(null)} className="px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:bg-muted">Cancelar</button>
              <button onClick={saveEdit} disabled={editUploads.uploading} className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50"><Check className="w-3 h-3" />Guardar</button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className={cn("group rounded-xl border bg-card p-3.5", variant === "pinned" ? "border-amber-300/70 dark:border-amber-900" : "border-border")}>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary overflow-hidden shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {entry.author?.avatar_url ? <img src={entry.author.avatar_url} alt="" className="w-full h-full object-cover" /> : authorName[0]?.toUpperCase()}
          </div>
          <span className="text-xs font-medium">{authorName}</span>
          {/* Fecha exacta siempre visible; lo relativo queda como apoyo. */}
          <span className="text-xs text-foreground/80" title={`Registrada el ${exactDateTime(entry.created_at)}`}>
            {entry.event_date ? formatEventDate(entry.event_date) : exactDateTime(entry.created_at)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {entry.event_date ? `· registrada ${exactDateTime(entry.created_at)}` : `· ${timeAgo(entry.created_at)}`}
          </span>
          {entry.updated_at && <span className="text-[10px] text-muted-foreground">· editada</span>}
          {entry.category && <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full border", CATEGORY_STYLE[entry.category])}>{entry.category}</span>}
          <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => togglePin(entry)} title={entry.pinned ? "Quitar del contexto fijo" : "Fijar en el contexto del proyecto"} className="p-1 rounded text-muted-foreground hover:text-amber-600">
              {entry.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            </button>
            {canEdit && <button onClick={() => startEdit(entry, variant)} title="Editar" className="p-1 rounded text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>}
            {(isAdmin || entry.author_id === currentUserId) && (
              <button onClick={() => { if (!confirm("¿Borrar esta nota?")) return; setEntries((p) => p.filter((e) => e.id !== entry.id)); run(() => deleteLogEntry(entry.id, projectId)) }} title="Borrar" className="p-1 rounded text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
            )}
          </div>
        </div>
        <div className={cn("text-sm leading-relaxed", !isOpen && "max-h-48 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]")}>
          <RichText text={entry.body} className="space-y-1" />
        </div>
        {long && <button onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(entry.id)) n.delete(entry.id); else n.add(entry.id); return n })} className="mt-1 text-xs font-medium text-primary hover:underline">{isOpen ? "Ver menos" : "Ver completo"}</button>}
        <Gallery items={entry.attachments ?? []} onOpen={setLightbox} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 min-h-0">
      {/* Nueva nota */}
      <div className="space-y-2">
        <Composer value={body} onChange={setBody} onSubmit={handleAdd} uploads={uploads} placeholder="Escribe una actualización, un acuerdo o pega una captura… (Ctrl+V)" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <button type="button" onClick={() => setShowDetails((v) => !v)} className={cn("h-8 px-2.5 rounded-md border text-xs inline-flex items-center gap-1.5", (eventDate || category || showDetails) ? "border-foreground/30 bg-muted" : "border-input text-muted-foreground hover:bg-muted/60")}>
            <Calendar className="w-3.5 h-3.5" />{eventDate ? formatEventDate(eventDate) : "Fecha"}{category ? ` · ${category}` : ""}
          </button>
          <button type="button" onClick={() => setPinNew((v) => !v)} title="Fijarla en el contexto del proyecto" className={cn("h-8 px-2.5 rounded-md border text-xs inline-flex items-center gap-1.5", pinNew ? "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" : "border-input text-muted-foreground hover:bg-muted/60")}>
            <Pin className="w-3.5 h-3.5" />{pinNew ? "Se fijará" : "Fijar"}
          </button>
          <button type="button" onClick={() => setNotify((v) => !v)} title={notify ? "Avisar por Telegram" : "Nota silenciosa"} className={cn("h-8 px-2.5 rounded-md border text-xs inline-flex items-center gap-1.5", notify ? "border-sky-400 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" : "border-input text-muted-foreground hover:bg-muted/60")}>
            <Bell className={cn("w-3.5 h-3.5", notify && "fill-current")} />{notify ? "Avisar" : "Silenciosa"}
          </button>
          {isPending && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          <button type="button" onClick={handleAdd} disabled={(!body.trim() && !uploads.items.length) || uploads.uploading}
            className="ml-auto h-8 px-4 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50">{uploads.uploading ? "Subiendo…" : "Publicar"}</button>
        </div>
        {showDetails && (
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={eventDate} max={todayStr()} onChange={(e) => setEventDate(e.target.value)} className="h-7 rounded-md border border-input bg-background px-2 text-xs" />
            {eventDate && <button type="button" onClick={() => setEventDate("")} className="text-[11px] text-muted-foreground hover:text-foreground">Usar hoy</button>}
            <div className="w-px h-4 bg-border" />
            <CategoryPicker value={category} onChange={setCategory} />
          </div>
        )}
        {notify && <PingRecipientsPicker projectId={projectId} selectedIds={notifyRecipientIds} onChange={setNotifyRecipientIds} />}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start min-h-0">
        {/* Línea de tiempo */}
        <section className="min-w-0 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en la bitácora…" className="w-full h-8 rounded-md border border-input bg-background pl-8 pr-3 text-xs" />
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setFilter(null)} className={cn("text-[11px] px-2 py-0.5 rounded-full border", !filter ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground")}>Todas</button>
              {CATEGORIES.map((c) => <button key={c} onClick={() => setFilter(filter === c ? null : c)} className={cn("text-[11px] px-2 py-0.5 rounded-full border", filter === c ? CATEGORY_STYLE[c] : "border-border text-muted-foreground")}>{c}</button>)}
            </div>
          </div>
          {timeline.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">{entries.length ? "Nada coincide con el filtro." : "Sin entradas todavía."}</p>}
          {timeline.map((g) => (
            <div key={g.label} className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 bg-background/95 py-1 z-10">{g.label}</p>
              {g.items.map((e) => <Fragment key={e.id}>{renderEntry(e, "timeline")}</Fragment>)}
            </div>
          ))}
        </section>

        {/* Contexto fijo */}
        <aside className="lg:sticky lg:top-0 space-y-2 order-first lg:order-none">
          <div className="flex items-center gap-1.5">
            <Pin className="w-3.5 h-3.5 text-amber-600" />
            <p className="text-xs font-semibold uppercase tracking-wide">Contexto fijo</p>
            <span className="text-[11px] text-muted-foreground">{pinned.length}</span>
          </div>
          {pinned.length === 0 ? (
            <p className="text-xs text-muted-foreground rounded-xl border border-dashed border-border p-4">Fija aquí lo que define cómo funciona el proyecto hoy: acuerdos, con quién se habla, reglas, accesos. Cualquier miembro puede fijar y editar estas notas.</p>
          ) : pinned.map((e) => <Fragment key={e.id}>{renderEntry(e, "pinned")}</Fragment>)}
        </aside>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-lg object-contain" />
          <button className="absolute top-4 right-4 text-white/80 hover:text-white"><X className="w-6 h-6" /></button>
        </div>
      )}
    </div>
  )
}
