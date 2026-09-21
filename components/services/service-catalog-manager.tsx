"use client"

import { useState, useEffect, useRef, useTransition } from "react"
import type { ServiceOffer, ServiceAddon, Currency, ServiceDeliverable, DeliverableCadence } from "@/lib/types"
import {
  createServiceOffer, updateServiceOffer, archiveServiceOffer, deleteServiceOffer, setOfferAddons,
  createServiceAddon, updateServiceAddon, archiveServiceAddon, deleteServiceAddon, suggestServiceOffer,
  exportServiceOffers, importServiceOffers,
} from "@/lib/actions/services"
import { getProjectTypeIcon } from "@/lib/project-type-icons"
import { categoryColor } from "@/components/services/category-colors"
import { Plus, Pencil, Trash2, Archive, ArchiveRestore, X, Tag, Layers, ChevronRight, ChevronDown, ChevronLeft, LayoutGrid, Sparkles, Upload, Download, Check, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

const ALL_CATEGORIES_KEY = "__todas__"

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

function money(n: number | null, currency: Currency) {
  if (n === null) return null
  return currency === "MXN"
    ? n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
}

function CurrencySwitch({ value, onChange }: { value: Currency; onChange: (c: Currency) => void }) {
  return (
    <div className="inline-flex items-center rounded-md border border-input bg-background p-0.5 flex-shrink-0">
      {(["MXN", "USD"] as Currency[]).map((c) => (
        <button
          key={c} type="button" onClick={() => onChange(c)}
          className={cn(
            "px-2.5 py-1.5 text-xs font-medium rounded transition-colors",
            value === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {c}
        </button>
      ))}
    </div>
  )
}

const CADENCE_LABEL: Record<DeliverableCadence, string> = {
  once: "Una vez",
  monthly: "Mensual",
  quarterly: "Trimestral",
  biannual: "Semestral",
}
const CADENCE_OPTIONS = Object.keys(CADENCE_LABEL) as DeliverableCadence[]

// Structured entregables editor — one row per deliverable (text + cadence),
// serialized to a hidden JSON field on submit instead of relying on the
// user pressing Enter in a textarea to separate items.
function DeliverablesEditor({ value, onChange }: { value: ServiceDeliverable[]; onChange: (v: ServiceDeliverable[]) => void }) {
  function update(i: number, patch: Partial<ServiceDeliverable>) {
    onChange(value.map((d, idx) => idx === i ? { ...d, ...patch } : d))
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i))
  }
  function add() {
    onChange([...value, { id: crypto.randomUUID(), text: "", cadence: "once", quantity: null }])
  }

  return (
    <div className="space-y-1.5">
      <input type="hidden" name="deliverables_json" value={JSON.stringify(value)} />
      {value.map((d, i) => (
        <div key={d.id} className="flex items-center gap-1.5">
          <input
            value={d.text}
            onChange={(e) => update(i, { text: e.target.value })}
            placeholder="Reporte semanal de resultados"
            className="flex-1 min-w-0 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <input
            type="number"
            min="0"
            value={d.quantity ?? ""}
            onChange={(e) => update(i, { quantity: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="Cant."
            title="Cantidad esperada por periodo (ej. 4 videos/mes) — opcional"
            className="w-16 flex-shrink-0 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <select
            value={d.cadence}
            onChange={(e) => update(i, { cadence: e.target.value as DeliverableCadence })}
            className="flex-shrink-0 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {CADENCE_OPTIONS.map((c) => <option key={c} value={c}>{CADENCE_LABEL[c]}</option>)}
          </select>
          <button
            type="button"
            onClick={() => remove(i)}
            className="flex-shrink-0 p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <Plus className="w-3 h-3" /> Agregar entregable
      </button>
    </div>
  )
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
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? prefillFrom?.currency ?? "MXN")

  // Controlled only where the AI autofill needs to write into them —
  // everything else stays uncontrolled (defaultValue) like before.
  const [category, setCategory] = useState(base?.category ?? "")
  const [name, setName] = useState(initial?.name ?? (prefillFrom ? `${prefillFrom.name} — tropicalización` : ""))
  const [description, setDescription] = useState(initial?.description ?? prefillFrom?.description ?? "")
  // Lines saved before `id`/`quantity` existed get them backfilled here on
  // load — no migration needed, deliverables live as a flexible JSONB array.
  const [deliverables, setDeliverables] = useState<ServiceDeliverable[]>(
    (initial?.deliverables ?? prefillFrom?.deliverables ?? []).map((d) => ({
      id: d.id || crypto.randomUUID(),
      text: d.text,
      cadence: d.cadence,
      quantity: d.quantity ?? null,
    }))
  )
  const [projectTypeId, setProjectTypeId] = useState(initial?.default_project_type_id ?? "")
  const [aiHint, setAiHint] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  function handleAutofill() {
    if (!category.trim() || !name.trim()) {
      setAiError("Escribe categoría y nombre antes de autorrellenar")
      return
    }
    setAiError(null)
    setAiLoading(true)
    suggestServiceOffer({ category, name, hint: aiHint, projectTypes })
      .then((result) => {
        setDescription(result.description)
        setDeliverables(result.deliverables)
        if (result.project_type_id) setProjectTypeId(result.project_type_id)
      })
      .catch((err) => setAiError(err instanceof Error ? err.message : "No se pudo autorrellenar"))
      .finally(() => setAiLoading(false))
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">Categoría *</label>
          <input
            name="category" required list="service-categories"
            value={category} onChange={(e) => setCategory(e.target.value)}
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
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Oferta base"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* AI autofill — one shot, on demand. Fills description + deliverables
          (and suggests a project type below) from what's already typed above;
          never touches price/is_base/based_on. */}
      <div className="rounded-lg border border-dashed border-primary/30 bg-primary/[0.03] p-3 space-y-2">
        <div className="flex items-center gap-2">
          <input
            value={aiHint}
            onChange={(e) => setAiHint(e.target.value)}
            placeholder="Opcional: contexto extra para la IA (ej. incluye A/B testing semanal)"
            className="flex-1 min-w-0 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            onClick={handleAutofill}
            disabled={aiLoading}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 disabled:opacity-50 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {aiLoading ? "Pensando…" : "Autorrellenar con IA"}
          </button>
        </div>
        {aiError && <p className="text-[11px] text-destructive">{aiError}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground block">Descripción</label>
        <textarea
          name="description" rows={2}
          value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="La promesa / resumen de esta oferta…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground block">Entregables</label>
        <DeliverablesEditor value={deliverables} onChange={setDeliverables} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">Precio</label>
          <div className="flex gap-1.5">
            <input
              name="price" type="number" step="0.01" min="0"
              defaultValue={initial?.price ?? prefillFrom?.price ?? ""}
              placeholder="1500"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <CurrencySwitch value={currency} onChange={setCurrency} />
            <input type="hidden" name="currency" value={currency} />
          </div>
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
          value={projectTypeId} onChange={(e) => setProjectTypeId(e.target.value)}
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
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? "MXN")
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
          <label className="text-xs font-medium text-muted-foreground block">Precio</label>
          <div className="flex gap-1.5">
            <input name="price" type="number" step="0.01" min="0" defaultValue={initial?.price ?? ""}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            <CurrencySwitch value={currency} onChange={setCurrency} />
            <input type="hidden" name="currency" value={currency} />
          </div>
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

// Guards against the classic "clicked outside by accident, lost everything
// I typed" — tracks (via native input/change events, no per-form wiring
// needed) whether anything inside the modal actually changed, and only
// then confirms before closing on a backdrop click or the X button. The
// explicit "Cancelar" button inside each form is a deliberate action, not
// an accident, so it stays an immediate close — this only guards the two
// accidental-close paths.
function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const dirtyRef = useRef(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const markDirty = () => { dirtyRef.current = true }
    el.addEventListener("input", markDirty)
    el.addEventListener("change", markDirty)
    return () => {
      el.removeEventListener("input", markDirty)
      el.removeEventListener("change", markDirty)
    }
  }, [])

  function handleClose() {
    if (dirtyRef.current && !confirm("Se perderá lo que llevas escrito o seleccionado aquí. ¿Cerrar de todas formas?")) return
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={handleClose}>
      <div ref={contentRef} className={cn("bg-card border border-border rounded-xl shadow-xl w-full max-h-[90vh] flex flex-col", wide ? "max-w-4xl" : "max-w-lg")} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={handleClose} className="p-1 rounded text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

// ── Export / Import JSON — lets an offer catalog be generated by an AI
// outside this dashboard (no Anthropic tokens spent on this project's own
// autofill) and pasted back in, or the current catalog copied out to hand
// to one. ────────────────────────────────────────────────────────────────

function ExportOffersModal({ onClose }: { onClose: () => void }) {
  const [json, setJson] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => { exportServiceOffers().then(setJson) }, [])

  function handleCopy() {
    if (!json) return
    navigator.clipboard.writeText(json)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Modal title="Exportar ofertas" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Copia este JSON y pásaselo a cualquier IA para que genere ofertas nuevas en el mismo formato — luego pégalas de vuelta con "Importar JSON".
        </p>
        {json === null ? (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5 py-4"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generando…</p>
        ) : (
          <textarea
            readOnly
            value={json}
            rows={16}
            className="w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-xs font-mono focus:outline-none resize-none"
          />
        )}
        <button
          type="button"
          onClick={handleCopy}
          disabled={!json}
          className="flex items-center gap-1.5 text-sm text-primary hover:underline disabled:opacity-50"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
          {copied ? "Copiado" : "Copiar al portapapeles"}
        </button>
      </div>
    </Modal>
  )
}

function ImportOffersModal({ onClose, onImported }: { onClose: () => void; onImported: (created: ServiceOffer[]) => void }) {
  const [text, setText] = useState("")
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null)

  function handleImport() {
    startTransition(async () => {
      try {
        const res = await importServiceOffers(text)
        setResult({ imported: res.offers.length, errors: res.errors })
        if (res.offers.length > 0) onImported(res.offers)
      } catch (e) {
        setResult({ imported: 0, errors: [e instanceof Error ? e.message : "No se pudo importar"] })
      }
    })
  }

  return (
    <Modal title="Importar ofertas desde JSON" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Pega aquí el JSON generado por una IA externa (mismo formato que "Exportar ofertas"). Cada oferta se crea como nueva — nunca sobreescribe una existente.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder='{"offers": [...]}'
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
        {result && (
          <div className="text-xs space-y-1">
            <p className="text-emerald-600 font-medium">{result.imported} oferta{result.imported !== 1 ? "s" : ""} creada{result.imported !== 1 ? "s" : ""}.</p>
            {result.errors.length > 0 && (
              <ul className="text-destructive list-disc pl-4 space-y-0.5">
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors">
            Cerrar
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!text.trim() || isPending}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Importar
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Offer card ───────────────────────────────────────────────────────────

// Cuántos deliverables se muestran antes de colapsar — el problema real
// que esto resuelve: paquetes con 15-20 entregables hacían el card
// crecer sin límite, volviendo la lista de ofertas un scroll interminable
// para comparar unas con otras. Colapsado, siempre se ve un resumen
// (total + cuántos son recurrentes) para no perder la idea general.
const COLLAPSED_DELIVERABLES_COUNT = 4
// A partir de este tamaño, la lista expandida se acomoda en 2 columnas en
// vez de una sola — reduce la altura a la mitad sin ocultar nada.
const TWO_COLUMN_THRESHOLD = 8

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
  const [showAllDeliverables, setShowAllDeliverables] = useState(false)
  const projectType = projectTypes.find((pt) => pt.id === offer.default_project_type_id)
  const ProjectIcon = projectType ? getProjectTypeIcon(projectType.icon) : null
  const attachedAddons = (offer.addons ?? []).map((a) => addons.find((x) => x.id === a.id) ?? a)
  const color = categoryColor(offer.category)

  const totalDeliverables = offer.deliverables.length
  const recurringCount = offer.deliverables.filter((d) => d.cadence !== "once").length
  const isLong = totalDeliverables > COLLAPSED_DELIVERABLES_COUNT
  const visibleDeliverables = showAllDeliverables ? offer.deliverables : offer.deliverables.slice(0, COLLAPSED_DELIVERABLES_COUNT)

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
    <div
      className={cn(
        "rounded-xl border bg-card p-4 space-y-3 border-l-4",
        nested ? "border-border/60 ml-6" : "border-border",
        archived && "opacity-50"
      )}
      style={{ borderLeftColor: color }}
    >
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

      {totalDeliverables > 0 && (
        <div className="space-y-1.5">
          <ul className={cn(
            "text-xs text-muted-foreground gap-x-4 gap-y-0.5 pl-1",
            showAllDeliverables && totalDeliverables > TWO_COLUMN_THRESHOLD
              ? "grid grid-cols-1 sm:grid-cols-2"
              : "space-y-0.5"
          )}>
            {visibleDeliverables.map((d, i) => (
              <li key={d.id ?? i} className="flex items-start gap-1.5">
                <span className="mt-0.5" style={{ color: `${color}99` }}>•</span>
                <span className="flex-1">{d.text}{d.quantity != null && ` — ${d.quantity}`}</span>
                {d.cadence !== "once" && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 flex-shrink-0">
                    {CADENCE_LABEL[d.cadence]}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {isLong && (
            <button
              onClick={() => setShowAllDeliverables((v) => !v)}
              className="flex items-center gap-1 text-[11px] font-medium hover:underline"
              style={{ color }}
            >
              {showAllDeliverables ? <ChevronDown className="w-3 h-3 rotate-180" /> : <ChevronDown className="w-3 h-3" />}
              {showAllDeliverables
                ? "Ver menos"
                : `Ver los ${totalDeliverables} entregables completos${recurringCount > 0 ? ` · ${recurringCount} recurrentes` : ""}`}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {(offer.price !== null || offer.price_note) && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
            {money(offer.price, offer.currency) ?? offer.price_note}
          </span>
        )}
        <span
          className="text-[11px] font-medium px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${color}1a`, color }}
        >
          {offer.category}
        </span>
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

// ── Categories screen — mismo patrón que SOPs (components/sops/sops-client.tsx):
// primero una pantalla de categorías (tiles), luego se entra a una para ver
// sus ofertas. Category es texto libre en service_offers, sin tabla ni
// enum propio como en SOPs (esas sí están ligadas a project_types) — el
// color por categoría sale de categoryColor (hash determinístico), no de
// datos guardados, pero es el mismo color en todo el catálogo (tiles,
// acento de cada tarjeta) para que se lea consistente.
function CategoriesScreen({
  categoryNames,
  categoryCounts,
  totalCount,
  onSelect,
}: {
  categoryNames: string[]
  categoryCounts: Map<string, number>
  totalCount: number
  onSelect: (category: string) => void
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      <CategoryTile
        label="Todas"
        count={totalCount}
        icon={<LayoutGrid className="w-5 h-5" />}
        color={null}
        onClick={() => onSelect(ALL_CATEGORIES_KEY)}
      />
      {categoryNames.map((name) => (
        <CategoryTile
          key={name}
          label={name}
          count={categoryCounts.get(name) ?? 0}
          icon={<Layers className="w-5 h-5" />}
          color={categoryColor(name)}
          onClick={() => onSelect(name)}
        />
      ))}
    </div>
  )
}

function CategoryTile({
  label,
  count,
  icon,
  color,
  onClick,
}: {
  label: string
  count: number
  icon: React.ReactNode
  color: string | null
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-3 p-5 rounded-xl border border-border bg-card hover:shadow-sm transition-all text-left"
      style={{ borderColor: color ? `${color}40` : undefined }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: color ? `${color}1a` : "hsl(var(--muted))", color: color ?? "hsl(var(--muted-foreground))" }}
      >
        {icon}
      </div>
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{count} oferta{count !== 1 ? "s" : ""}</p>
      </div>
    </button>
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

  const [showExport, setShowExport] = useState(false)
  const [showImport, setShowImport] = useState(false)

  // null = pantalla de categorías; ALL_CATEGORIES_KEY = todas juntas; o el
  // nombre exacto de una categoría. Estado local puro, sin URL param —
  // mismo criterio que sops-client.tsx (la página es dinámica, un param
  // forzaría un refetch en vez de solo cambiar la vista).
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const categories = Array.from(new Set(offers.map((o) => o.category))).sort()
  const categoryCounts = new Map(categories.map((c) => [c, offers.filter((o) => o.category === c).length]))

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
        {tab === "offers" && selectedCategory !== null && (
          <button
            onClick={() => setSelectedCategory(null)}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-4 h-4" /> Categorías
          </button>
        )}
        {tab === "offers" && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              title="Importar ofertas desde JSON — pensado para generarlas con una IA externa sin gastar tokens de este proyecto"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" /> Importar JSON
            </button>
            <button
              onClick={() => setShowExport(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Exportar JSON
            </button>
          </div>
        )}
        <button
          onClick={() => tab === "offers" ? setShowNewOffer(true) : setShowNewAddon(true)}
          className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors", tab === "addons" && "ml-auto")}
        >
          <Plus className="w-4 h-4" /> {tab === "offers" ? "Nueva oferta" : "Nuevo addon"}
        </button>
      </div>

      {tab === "offers" && selectedCategory === null && (
        offers.length === 0 ? (
          <div className="border rounded-xl py-16 text-center bg-card">
            <Layers className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Sin ofertas todavía. Crea la primera.</p>
          </div>
        ) : (
          <CategoriesScreen
            categoryNames={categories}
            categoryCounts={categoryCounts}
            totalCount={offers.length}
            onSelect={setSelectedCategory}
          />
        )
      )}

      {tab === "offers" && selectedCategory !== null && (
        <div className="space-y-6">
          {byCategory
            .filter(({ category }) => selectedCategory === ALL_CATEGORIES_KEY || category === selectedCategory)
            .map(({ category, bases, flat }) => (
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
                      {money(addon.price, addon.currency) ?? addon.price_note}
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
        <Modal title="Nueva oferta" onClose={() => { setShowNewOffer(false); setPrefillFrom(null) }} wide>
          <OfferForm
            offers={offers} categories={categories} projectTypes={projectTypes} isPending={isPending}
            prefillFrom={prefillFrom}
            onSubmit={handleCreateOffer}
            onClose={() => { setShowNewOffer(false); setPrefillFrom(null) }}
          />
        </Modal>
      )}
      {editingOffer && (
        <Modal title="Editar oferta" onClose={() => setEditingOffer(null)} wide>
          <OfferForm
            initial={editingOffer} offers={offers} categories={categories} projectTypes={projectTypes} isPending={isPending}
            onSubmit={(e) => handleUpdateOffer(editingOffer.id, e)}
            onClose={() => setEditingOffer(null)}
          />
        </Modal>
      )}
      {showExport && (
        <ExportOffersModal onClose={() => setShowExport(false)} />
      )}
      {showImport && (
        <ImportOffersModal
          onClose={() => setShowImport(false)}
          onImported={(created) => { setOffers((prev) => [...prev, ...created]); setShowImport(false) }}
        />
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
              <span className="text-xs text-muted-foreground">{money(a.price, a.currency) ?? a.price_note}</span>
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
