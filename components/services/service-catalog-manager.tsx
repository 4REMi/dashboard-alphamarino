"use client"

import { useState, useTransition } from "react"
import type { ServiceOffer, ServiceAddon } from "@/lib/types"
import {
  createServiceOffer, updateServiceOffer, archiveServiceOffer, deleteServiceOffer, setOfferAddons,
  createServiceAddon, updateServiceAddon, archiveServiceAddon, deleteServiceAddon,
} from "@/lib/actions/services"
import { getProjectTypeIcon } from "@/lib/project-type-icons"
import { Plus, Pencil, Trash2, Archive, ArchiveRestore, X, Tag, Layers, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface ProjectTypeBadge {
  id: string
  name: string
  icon: string | null
  color: string | null
}

interface Props {
  initialOffers: ServiceOffer[]
  initialAddons: ServiceAddon[]
  projectTypes: ProjectTypeBadge[]
}

function money(n: number | null) {
  if (n === null) return null
  return n.toLocaleString("es-MX", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
}

// ── Offer form (create + edit) ────────────────────────────────────────────

function OfferForm({
  initial, prefillFrom, offers, categories, projectTypes, isPending, onSubmit, onClose,
}: {
  initial?: ServiceOffer
  prefillFrom?: ServiceOffer | null
  offers: ServiceOffer[]
  categories: string[]
  projectTypes: ProjectTypeBadge[]
  isPending: boolean
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onClose: () => void
}) {
  const base = initial ?? prefillFrom
  const [isBase, setIsBase] = useState(initial?.is_base ?? false)
  const [basedOn, setBasedOn] = useState(initial?.based_on_offer_id ?? prefillFrom?.id ?? "")

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">Categoría *</label>
          <input
            name="category" required list="service-categories"
            defaultValue={base?.category ?? ""}
            placeholder="Paid Media"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <datalist id="service-categories">
            {categories.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">Nombre *</label>
          <input
            name="name" required autoFocus
            defaultValue={initial?.name ?? (prefillFrom ? `${prefillFrom.name} — tropicalización` : "")}
            placeholder="Oferta base"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground block">Descripción</label>
        <textarea
          name="description" rows={2}
          defaultValue={initial?.description ?? prefillFrom?.description ?? ""}
          placeholder="La promesa / resumen de esta oferta…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground block">Entregables (uno por línea)</label>
        <textarea
          name="deliverables" rows={4}
          defaultValue={(initial?.deliverables ?? prefillFrom?.deliverables ?? []).join("\n")}
          placeholder={"Configuración de campañas\nReporte semanal\n..."}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none font-mono"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">Precio (USD)</label>
          <input
            name="price" type="number" step="0.01" min="0"
            defaultValue={initial?.price ?? prefillFrom?.price ?? ""}
            placeholder="1500"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">Nota de precio</label>
          <input
            name="price_note"
            defaultValue={initial?.price_note ?? prefillFrom?.price_note ?? ""}
            placeholder="Desde $X/mes, Cotización…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground block">
          Tipo de proyecto (Ops Lab) — solo referencia
        </label>
        <select
          name="default_project_type_id"
          defaultValue={initial?.default_project_type_id ?? ""}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Sin referencia</option>
          {projectTypes.map((pt) => (
            <option key={pt.id} value={pt.id}>{pt.name}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox" checked={isBase}
            onChange={(e) => { setIsBase(e.target.checked); if (e.target.checked) setBasedOn("") }}
            className="accent-primary"
          />
          Es la oferta base de su categoría
        </label>
        <input type="hidden" name="is_base" value={String(isBase)} />
      </div>

      {!isBase && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">Deriva de (opcional)</label>
          <select
            name="based_on_offer_id" value={basedOn} onChange={(e) => setBasedOn(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Ninguna — oferta independiente</option>
            {offers.filter((o) => o.id !== initial?.id).map((o) => (
              <option key={o.id} value={o.id}>{o.category} — {o.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={isPending} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {isPending ? "Guardando…" : initial ? "Actualizar oferta" : "Crear oferta"}
        </button>
      </div>
    </form>
  )
}

// ── Addon form ─────────────────────────────────────────────────────────────

function AddonForm({ initial, isPending, onSubmit, onClose }: {
  initial?: ServiceAddon
  isPending: boolean
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onClose: () => void
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground block">Nombre *</label>
        <input name="name" required autoFocus defaultValue={initial?.name}
          placeholder="Reporte avanzado de atribución"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground block">Descripción</label>
        <textarea name="description" rows={2} defaultValue={initial?.description ?? ""}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">Precio (USD)</label>
          <input name="price" type="number" step="0.01" min="0" defaultValue={initial?.price ?? ""}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">Nota de precio</label>
          <input name="price_note" defaultValue={initial?.price_note ?? ""}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors">Cancelar</button>
        <button type="submit" disabled={isPending} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {isPending ? "Guardando…" : initial ? "Actualizar addon" : "Crear addon"}
        </button>
      </div>
    </form>
  )
}

// ── Modal wrapper ────────────────────────────────────────────────────────

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

// ── Offer card ───────────────────────────────────────────────────────────

function OfferCard({
  offer, addons, projectTypes, nested, onEdit, onPickAddons,
}: {
  offer: ServiceOffer
  addons: ServiceAddon[]
  projectTypes: ProjectTypeBadge[]
  nested: boolean
  onEdit: () => void
  onPickAddons: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [archived, setArchived] = useState(offer.status === "archived")
  const projectType = projectTypes.find((pt) => pt.id === offer.default_project_type_id)
  const ProjectIcon = projectType ? getProjectTypeIcon(projectType.icon) : null
  const attachedAddons = (offer.addons ?? []).map((a) => addons.find((x) => x.id === a.id) ?? a)

  function toggleArchive() {
    const next = !archived
    setArchived(next)
    startTransition(async () => { await archiveServiceOffer(offer.id, next) })
  }

  function handleDelete() {
    if (!confirm(`¿Eliminar la oferta "${offer.name}"?`)) return
    startTransition(async () => { await deleteServiceOffer(offer.id) })
  }

  return (
    <div className={cn(
      "rounded-xl border bg-card p-4 space-y-3",
      nested ? "border-border/60 ml-6" : "border-border",
      archived && "opacity-50"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          {nested && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground mt-1 flex-shrink-0" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm">{offer.name}</p>
              {offer.is_base && (
                <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Base</span>
              )}
              {archived && (
                <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">Archivada</span>
              )}
            </div>
            {offer.description && <p className="text-xs text-muted-foreground mt-1">{offer.description}</p>}
            {offer.based_on_offer && (
              <p className="text-[11px] text-muted-foreground mt-1">Deriva de: <span className="font-medium">{offer.based_on_offer.name}</span></p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onEdit} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Editar">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={toggleArchive} disabled={isPending} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title={archived ? "Reactivar" : "Archivar"}>
            {archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
          </button>
          <button onClick={handleDelete} disabled={isPending} className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Eliminar">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {offer.deliverables.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-0.5 pl-1">
          {offer.deliverables.map((d, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="text-primary/60 mt-0.5">•</span> {d}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {(offer.price !== null || offer.price_note) && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
            {money(offer.price) ?? offer.price_note}
          </span>
        )}
        {projectType && ProjectIcon && (
          <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground" title="Tipo de proyecto en Ops Lab">
            <ProjectIcon className="w-3 h-3" /> {projectType.name}
          </span>
        )}
        {attachedAddons.map((a) => (
          <span key={a.id} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">
            <Tag className="w-2.5 h-2.5" /> {a.name}
          </span>
        ))}
        <button onClick={onPickAddons} className="text-[11px] text-primary hover:underline ml-auto">+ Addons</button>
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────

export function ServiceCatalogManager({ initialOffers, initialAddons, projectTypes }: Props) {
  const [offers, setOffers] = useState<ServiceOffer[]>(initialOffers)
  const [addons, setAddons] = useState<ServiceAddon[]>(initialAddons)
  const [tab, setTab] = useState<"offers" | "addons">("offers")
  const [isPending, startTransition] = useTransition()

  const [showNewOffer, setShowNewOffer] = useState(false)
  const [editingOffer, setEditingOffer] = useState<ServiceOffer | null>(null)
  const [prefillFrom, setPrefillFrom] = useState<ServiceOffer | null>(null)
  const [pickingAddonsFor, setPickingAddonsFor] = useState<ServiceOffer | null>(null)

  const [showNewAddon, setShowNewAddon] = useState(false)
  const [editingAddon, setEditingAddon] = useState<ServiceAddon | null>(null)

  const categories = Array.from(new Set(offers.map((o) => o.category))).sort()

  function run(fn: () => Promise<void>) {
    startTransition(async () => { try { await fn() } catch { /* ignore */ } })
  }

  // ── offer handlers ──
  function handleCreateOffer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    run(async () => {
      const created = await createServiceOffer(fd)
      setOffers((prev) => [...prev, created])
      setShowNewOffer(false)
      setPrefillFrom(null)
    })
  }

  function handleUpdateOffer(id: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    run(async () => {
      const updated = await updateServiceOffer(id, fd)
      setOffers((prev) => prev.map((o) => o.id === id ? { ...o, ...updated } : o))
      setEditingOffer(null)
    })
  }

  function handleSetAddons(offerId: string, addonIds: string[]) {
    run(async () => {
      await setOfferAddons(offerId, addonIds)
      setOffers((prev) => prev.map((o) => o.id === offerId ? { ...o, addons: addons.filter((a) => addonIds.includes(a.id)) } : o))
      setPickingAddonsFor(null)
    })
  }

  // ── addon handlers ──
  function handleCreateAddon(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    run(async () => {
      const created = await createServiceAddon(fd)
      setAddons((prev) => [...prev, created])
      setShowNewAddon(false)
    })
  }

  function handleUpdateAddon(id: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    run(async () => {
      const updated = await updateServiceAddon(id, fd)
      setAddons((prev) => prev.map((a) => a.id === id ? { ...a, ...updated } : a))
      setEditingAddon(null)
    })
  }

  function handleArchiveAddon(id: string, archived: boolean) {
    run(async () => {
      await archiveServiceAddon(id, archived)
      setAddons((prev) => prev.map((a) => a.id === id ? { ...a, status: archived ? "archived" : "active" } : a))
    })
  }

  function handleDeleteAddon(id: string) {
    if (!confirm("¿Eliminar este addon? Se quitará de todas las ofertas que lo tengan.")) return
    run(async () => {
      await deleteServiceAddon(id)
      setAddons((prev) => prev.filter((a) => a.id !== id))
      setOffers((prev) => prev.map((o) => ({ ...o, addons: (o.addons ?? []).filter((a) => a.id !== id) })))
    })
  }

  // ── grouping: category -> base + its children, then flat siblings ──
  const byCategory = categories.map((category) => {
    const inCat = offers.filter((o) => o.category === category)
    const bases = inCat.filter((o) => o.is_base)
    const flat = inCat.filter((o) => !o.is_base && !o.based_on_offer_id)
    const orphanChildren = inCat.filter((o) => !o.is_base && o.based_on_offer_id && !inCat.some((b) => b.id === o.based_on_offer_id))
    return { category, bases, flat: [...flat, ...orphanChildren] }
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTab("offers")}
          className={cn("px-3 py-1.5 rounded-full text-sm font-medium transition-colors", tab === "offers" ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/70")}
        >
          Ofertas
        </button>
        <button
          onClick={() => setTab("addons")}
          className={cn("px-3 py-1.5 rounded-full text-sm font-medium transition-colors", tab === "addons" ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/70")}
        >
          Addons ({addons.length})
        </button>
        <button
          onClick={() => tab === "offers" ? setShowNewOffer(true) : setShowNewAddon(true)}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> {tab === "offers" ? "Nueva oferta" : "Nuevo addon"}
        </button>
      </div>

      {tab === "offers" && (
        <div className="space-y-6">
          {byCategory.length === 0 && (
            <div className="border rounded-xl py-16 text-center bg-card">
              <Layers className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Sin ofertas todavía. Crea la primera.</p>
            </div>
          )}
          {byCategory.map(({ category, bases, flat }) => (
            <div key={category} className="space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{category}</p>
              {bases.map((base) => (
                <div key={base.id} className="space-y-2.5">
                  <OfferCard
                    offer={base} addons={addons} projectTypes={projectTypes} nested={false}
                    onEdit={() => setEditingOffer(base)}
                    onPickAddons={() => setPickingAddonsFor(base)}
                  />
                  {offers.filter((o) => o.based_on_offer_id === base.id).map((child) => (
                    <OfferCard
                      key={child.id} offer={child} addons={addons} projectTypes={projectTypes} nested
                      onEdit={() => setEditingOffer(child)}
                      onPickAddons={() => setPickingAddonsFor(child)}
                    />
                  ))}
                </div>
              ))}
              {flat.map((offer) => (
                <OfferCard
                  key={offer.id} offer={offer} addons={addons} projectTypes={projectTypes} nested={false}
                  onEdit={() => setEditingOffer(offer)}
                  onPickAddons={() => setPickingAddonsFor(offer)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {tab === "addons" && (
        <div className="space-y-2">
          {addons.length === 0 && (
            <div className="border rounded-xl py-16 text-center bg-card">
              <Tag className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Sin addons todavía. Crea el primero.</p>
            </div>
          )}
          {addons.map((addon) => (
            <div key={addon.id} className={cn("rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-3", addon.status === "archived" && "opacity-50")}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{addon.name}</p>
                  {(addon.price !== null || addon.price_note) && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                      {money(addon.price) ?? addon.price_note}
                    </span>
                  )}
                </div>
                {addon.description && <p className="text-xs text-muted-foreground mt-0.5">{addon.description}</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => setEditingAddon(addon)} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Editar">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleArchiveAddon(addon.id, addon.status !== "archived")} disabled={isPending} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title={addon.status === "archived" ? "Reactivar" : "Archivar"}>
                  {addon.status === "archived" ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => handleDeleteAddon(addon.id)} disabled={isPending} className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Eliminar">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showNewOffer && (
        <Modal title="Nueva oferta" onClose={() => { setShowNewOffer(false); setPrefillFrom(null) }}>
          <OfferForm
            offers={offers} categories={categories} projectTypes={projectTypes} isPending={isPending}
            prefillFrom={prefillFrom}
            onSubmit={handleCreateOffer}
            onClose={() => { setShowNewOffer(false); setPrefillFrom(null) }}
          />
        </Modal>
      )}
      {editingOffer && (
        <Modal title="Editar oferta" onClose={() => setEditingOffer(null)}>
          <OfferForm
            initial={editingOffer} offers={offers} categories={categories} projectTypes={projectTypes} isPending={isPending}
            onSubmit={(e) => handleUpdateOffer(editingOffer.id, e)}
            onClose={() => setEditingOffer(null)}
          />
        </Modal>
      )}
      {pickingAddonsFor && (
        <AddonPickerModal
          offer={pickingAddonsFor} addons={addons}
          onClose={() => setPickingAddonsFor(null)}
          onSave={(ids) => handleSetAddons(pickingAddonsFor.id, ids)}
          isPending={isPending}
        />
      )}
      {showNewAddon && (
        <Modal title="Nuevo addon" onClose={() => setShowNewAddon(false)}>
          <AddonForm isPending={isPending} onSubmit={handleCreateAddon} onClose={() => setShowNewAddon(false)} />
        </Modal>
      )}
      {editingAddon && (
        <Modal title="Editar addon" onClose={() => setEditingAddon(null)}>
          <AddonForm initial={editingAddon} isPending={isPending} onSubmit={(e) => handleUpdateAddon(editingAddon.id, e)} onClose={() => setEditingAddon(null)} />
        </Modal>
      )}
    </div>
  )
}

function AddonPickerModal({ offer, addons, onClose, onSave, isPending }: {
  offer: ServiceOffer
  addons: ServiceAddon[]
  onClose: () => void
  onSave: (ids: string[]) => void
  isPending: boolean
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set((offer.addons ?? []).map((a) => a.id)))
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  return (
    <Modal title={`Addons — ${offer.name}`} onClose={onClose}>
      <div className="space-y-1">
        {addons.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No hay addons en el catálogo todavía.</p>}
        {addons.map((a) => (
          <label key={a.id} className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/50 cursor-pointer select-none">
            <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} className="accent-primary" />
            <span className="text-sm flex-1">{a.name}</span>
            {(a.price !== null || a.price_note) && (
              <span className="text-xs text-muted-foreground">{money(a.price) ?? a.price_note}</span>
            )}
          </label>
        ))}
      </div>
      <div className="flex gap-2 justify-end pt-4">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors">Cancelar</button>
        <button type="button" disabled={isPending} onClick={() => onSave(Array.from(selected))} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {isPending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Modal>
  )
}
