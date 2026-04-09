"use client"

import { useState, useTransition } from "react"
import { createSop, updateSop, deleteSop } from "@/lib/actions/sops"
import { BookOpen, ExternalLink, Plus, Pencil, Trash2, X, Search, Video, FileText, Tag } from "lucide-react"
import type { Sop, Profile, ProjectType } from "@/lib/types"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/utils"

// ── SOP form (shared by create + edit) ───────────────────────────────────────

function SopForm({
  initial,
  isPending,
  onSubmit,
  onClose,
  projectTypes,
}: {
  initial?: Sop
  isPending: boolean
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onClose: () => void
  projectTypes: ProjectType[]
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">Título *</label>
          <input
            name="title"
            required
            defaultValue={initial?.title}
            placeholder="Cómo configurar Meta Ads desde cero"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">Descripción</label>
          <textarea
            name="description"
            rows={2}
            defaultValue={initial?.description ?? ""}
            placeholder="Breve descripción del proceso…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 block">
            <FileText className="w-3.5 h-3.5" /> URL Documento
          </label>
          <input
            name="doc_url"
            type="url"
            defaultValue={initial?.doc_url ?? ""}
            placeholder="https://docs.google.com/…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 block">
            <Video className="w-3.5 h-3.5" /> URL Video
          </label>
          <input
            name="video_url"
            type="url"
            defaultValue={initial?.video_url ?? ""}
            placeholder="https://youtube.com/…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">Categoría</label>
          <select
            name="category"
            defaultValue={initial?.category ?? ""}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Sin categoría</option>
            {projectTypes.map((pt) => (
              <option key={pt.id} value={pt.name}>{pt.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 block">
            <Tag className="w-3.5 h-3.5" /> Tags (separados por coma)
          </label>
          <input
            name="tags"
            defaultValue={initial?.tags?.join(", ") ?? ""}
            placeholder="ads, configuración, meta"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">Visibilidad</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-input bg-background text-sm cursor-pointer select-none flex-1">
              <input
                type="radio"
                name="visibility"
                value="public"
                defaultChecked={(initial?.visibility ?? "public") === "public"}
                className="accent-primary"
              />
              Público — todos los usuarios
            </label>
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-input bg-background text-sm cursor-pointer select-none flex-1">
              <input
                type="radio"
                name="visibility"
                value="restricted"
                defaultChecked={initial?.visibility === "restricted"}
                className="accent-primary"
              />
              Restringido — solo admin/autor
            </label>
          </div>
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Guardando…" : initial ? "Actualizar SOP" : "Crear SOP"}
        </button>
      </div>
    </form>
  )
}

// ── SOP Modal ────────────────────────────────────────────────────────────────

function SopModal({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

interface Props {
  sops: Sop[]
  currentUser: Profile
  isAdmin: boolean
  projectTypes: ProjectType[]
}

export function SopsClient({ sops: initSops, currentUser, isAdmin, projectTypes }: Props) {
  const [sops, setSops] = useState<Sop[]>(initSops)
  const [showCreate, setShowCreate] = useState(false)
  const [editingSop, setEditingSop] = useState<Sop | null>(null)
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "public" | "restricted">("all")
  const [isPending, startTransition] = useTransition()

  function run(fn: () => Promise<void>) {
    startTransition(async () => { try { await fn() } catch { /* ignore */ } })
  }

  // ── categories derived from data ─────────────────────────────────────────
  const categories = Array.from(new Set(sops.map((s) => s.category).filter(Boolean))).sort() as string[]

  // ── filtered list ────────────────────────────────────────────────────────
  const filtered = sops.filter((s) => {
    const q = search.toLowerCase()
    const matchesSearch = !q ||
      s.title.toLowerCase().includes(q) ||
      (s.description ?? "").toLowerCase().includes(q) ||
      (s.category ?? "").toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q))
    const matchesCategory = categoryFilter === "all" || s.category === categoryFilter
    const matchesVisibility = visibilityFilter === "all" || s.visibility === visibilityFilter
    return matchesSearch && matchesCategory && matchesVisibility
  })

  // ── handlers ─────────────────────────────────────────────────────────────
  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    run(async () => {
      const created = await createSop(fd)
      setSops((prev) => [created, ...prev])
      setShowCreate(false)
    })
  }

  function handleUpdate(id: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    run(async () => {
      const updated = await updateSop(id, fd)
      setSops((prev) => prev.map((s) => s.id === id ? { ...s, ...updated } : s))
      setEditingSop(null)
    })
  }

  function handleDelete(id: string) {
    if (!confirm("¿Eliminar este SOP permanentemente?")) return
    run(async () => {
      await deleteSop(id)
      setSops((prev) => prev.filter((s) => s.id !== id))
    })
  }

  function canEdit(sop: Sop) {
    return isAdmin || sop.author_id === currentUser.id
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar SOPs…"
            className="w-full rounded-lg border border-input bg-background pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Category filter */}
        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">Todas las categorías</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        {/* Visibility pills (admin only) */}
        {isAdmin && (
          <div className="flex gap-1">
            {(["all", "public", "restricted"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVisibilityFilter(v)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                  visibilityFilter === v
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                )}
              >
                {v === "all" ? "Todos" : v === "public" ? "Públicos" : "Restringidos"}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => setShowCreate(true)}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nuevo SOP
        </button>
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground">
        {filtered.length === sops.length
          ? `${sops.length} SOP${sops.length !== 1 ? "s" : ""}`
          : `${filtered.length} de ${sops.length} SOPs`}
      </p>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="border rounded-xl py-16 text-center bg-card">
          <BookOpen className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {sops.length === 0
              ? "El banco de SOPs está vacío. Crea el primero."
              : "Sin resultados para los filtros aplicados."}
          </p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Título</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Categoría</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Tags</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Autor</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Recursos</th>
                <th className="w-20 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((sop) => (
                <tr key={sop.id} className="border-t hover:bg-muted/20 transition-colors group">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">{sop.title}</p>
                      {sop.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{sop.description}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {sop.category ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                        {sop.category}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {sop.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                          {tag}
                        </span>
                      ))}
                      {sop.tags.length > 3 && (
                        <span className="text-xs text-muted-foreground">+{sop.tags.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-muted-foreground">
                      {(sop.author as Profile | null)?.full_name ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {sop.doc_url && (
                        <a
                          href={sop.doc_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Doc
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                      {sop.video_url && (
                        <a
                          href={sop.video_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Video className="w-3.5 h-3.5" />
                          Video
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                      {!sop.doc_url && !sop.video_url && (
                        <span className="text-xs text-muted-foreground/40">Sin recursos</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {canEdit(sop) && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingSop(sop)}
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(sop.id)}
                          className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <SopModal title="Nuevo SOP" onClose={() => setShowCreate(false)}>
          <SopForm isPending={isPending} onSubmit={handleCreate} onClose={() => setShowCreate(false)} projectTypes={projectTypes} />
        </SopModal>
      )}

      {/* Edit modal */}
      {editingSop && (
        <SopModal title="Editar SOP" onClose={() => setEditingSop(null)}>
          <SopForm
            initial={editingSop}
            isPending={isPending}
            onSubmit={(e) => handleUpdate(editingSop.id, e)}
            onClose={() => setEditingSop(null)}
            projectTypes={projectTypes}
          />
        </SopModal>
      )}
    </div>
  )
}
