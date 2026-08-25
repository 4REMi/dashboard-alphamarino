"use client"

import { useState, useTransition } from "react"
import type { TrackedBrand } from "@/lib/types"
import {
  addTrackedBrand,
  updateTrackedBrand,
  deleteTrackedBrand,
} from "@/lib/actions/ad-lab"
import { Radio, Plus, X, Pencil, ExternalLink } from "lucide-react"

interface Props {
  initialBrands: TrackedBrand[]
}

export function TrackedBrandsManager({ initialBrands }: Props) {
  const [brands, setBrands]       = useState<TrackedBrand[]>(initialBrands)
  const [showAdd, setShowAdd]     = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (!(fd.get("name") as string).trim()) return
    startTransition(async () => {
      const brand = await addTrackedBrand(fd)
      setBrands((prev) => [brand, ...prev])
      setShowAdd(false)
    })
  }

  function handleUpdate(id: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await updateTrackedBrand(id, fd)
      setBrands((prev) => prev.map((b) => b.id === id ? {
        ...b,
        name:             fd.get("name") as string,
        meta_page_id:     (fd.get("meta_page_id") as string) || null,
        instagram_handle: (fd.get("instagram_handle") as string)?.replace(/^@/, "") || null,
        page_url:         (fd.get("page_url") as string) || null,
        notes:            (fd.get("notes") as string) || null,
      } : b))
      setEditingId(null)
    })
  }

  function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta marca?")) return
    startTransition(async () => {
      await deleteTrackedBrand(id)
      setBrands((prev) => prev.filter((b) => b.id !== id))
    })
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {brands.length} marca{brands.length !== 1 ? "s" : ""} trackeada{brands.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Agregar marca
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <AddBrandForm
          onSubmit={handleAdd}
          onCancel={() => setShowAdd(false)}
          isPending={isPending}
        />
      )}

      {/* Empty state */}
      {brands.length === 0 && !showAdd && (
        <div className="rounded-xl border border-dashed border-border py-16 flex flex-col items-center gap-3 text-center">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <Radio className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Sin marcas trackeadas</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Agrega competidores para buscarlos rápidamente en Discovery.
            </p>
          </div>
        </div>
      )}

      {/* Flat brand list */}
      {brands.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/50">
          {brands.map((brand) => (
            <BrandRow
              key={brand.id}
              brand={brand}
              editing={editingId === brand.id}
              isPending={isPending}
              onEdit={() => setEditingId(brand.id)}
              onCancelEdit={() => setEditingId(null)}
              onUpdate={(e) => handleUpdate(brand.id, e)}
              onDelete={() => handleDelete(brand.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Add Brand Form ────────────────────────────────────────────────

function AddBrandForm({
  onSubmit,
  onCancel,
  isPending,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onCancel: () => void
  isPending: boolean
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3"
    >
      <p className="text-sm font-semibold">Nueva marca</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {/* Name */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Nombre de la marca *</label>
          <input
            name="name"
            required
            autoFocus
            placeholder="ej. Nike Mexico"
            className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {/* Meta Page ID */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Meta Page ID</label>
          <input
            name="meta_page_id"
            placeholder="ej. 123456789"
            className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
          />
        </div>

        {/* Instagram handle */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Usuario de Instagram</label>
          <input
            name="instagram_handle"
            placeholder="ej. nike"
            className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
          />
        </div>

        {/* Page URL */}
        <div className="sm:col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">URL de la página</label>
          <input
            name="page_url"
            type="url"
            placeholder="https://facebook.com/..."
            className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {/* Notes */}
        <div className="sm:col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">Notas</label>
          <input
            name="notes"
            placeholder="Observaciones opcionales…"
            className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="text-sm px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          Agregar
        </button>
      </div>
    </form>
  )
}

// ── Brand Row ─────────────────────────────────────────────────────

function BrandRow({
  brand,
  editing,
  isPending,
  onEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
}: {
  brand: TrackedBrand
  editing: boolean
  isPending: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onUpdate: (e: React.FormEvent<HTMLFormElement>) => void
  onDelete: () => void
}) {
  if (editing) {
    return (
      <form onSubmit={onUpdate} className="p-4 space-y-3 bg-muted/20">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Nombre *</label>
            <input
              name="name"
              defaultValue={brand.name}
              required
              autoFocus
              className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Meta Page ID</label>
            <input
              name="meta_page_id"
              defaultValue={brand.meta_page_id ?? ""}
              className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Usuario de Instagram</label>
            <input
              name="instagram_handle"
              defaultValue={brand.instagram_handle ?? ""}
              className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">URL de la página</label>
            <input
              name="page_url"
              defaultValue={brand.page_url ?? ""}
              type="url"
              className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">Notas</label>
            <input
              name="notes"
              defaultValue={brand.notes ?? ""}
              className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancelEdit}
            className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            Guardar
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0 text-xs font-bold text-muted-foreground">
        {brand.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{brand.name}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {brand.meta_page_id && (
            <span className="text-[11px] font-mono text-muted-foreground">
              ID: {brand.meta_page_id}
            </span>
          )}
          {brand.instagram_handle && (
            <span className="text-[11px] font-mono text-muted-foreground">
              @{brand.instagram_handle}
            </span>
          )}
          {brand.notes && (
            <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">
              {brand.notes}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {brand.page_url && (
          <a
            href={brand.page_url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Ver página"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        <button
          onClick={onEdit}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Editar"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Eliminar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
