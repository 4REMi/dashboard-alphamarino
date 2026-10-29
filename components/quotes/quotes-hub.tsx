"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core"
import { Plus, Loader2, FileText, ExternalLink, Sparkles, Trash2, X, Presentation, Phone, Mail, MessageCircle, LayoutGrid, List, Search, Pencil, AlertTriangle, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { AutoTextarea } from "@/components/ui/auto-textarea"
import { createQuoteLead, updateQuoteLead, generateQuoteProposal, deleteQuoteLead } from "@/lib/actions/quotes"
import type { QuotePatch } from "@/lib/quotes/server"
import { QUOTE_STATUS, PROPOSAL_TYPES, STAGES, hasTemplate, needsFollowUp, missingInfo, daysSince, quoteKpis, type QuoteLead, type QuoteStatus } from "@/lib/quotes/core"
import { cn } from "@/lib/utils"

// Hub de cotizaciones: números arriba, tablero por etapa (arrastrar para
// cambiar de etapa) o lista, y el detalle en un panel lateral para pasar de
// un lead a otro sin cerrar nada.

const SOURCE: Record<string, string> = { ghl: "GHL", manual: "Manual", atajo: "Atajo" }
const money = (n: number | null | undefined) => (n == null ? "—" : `$${n.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`)
const short = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : money(n))
const ago = (d: string | null) => { if (!d) return ""; const n = daysSince(d); return n <= 0 ? "hoy" : n === 1 ? "ayer" : `hace ${n} d` }
const dateFmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : null)
const typeLabel = (t: string | null) => !t ? null : PROPOSAL_TYPES.find((p) => p.key === t)?.label ?? `${t.replace(/^otra:/, "") || "Otra oferta"}`
const statusLabel = (s: QuoteStatus) => QUOTE_STATUS.find((x) => x.key === s)?.label ?? s
const STAGE_DOT: Record<string, string> = { por_cotizar: "bg-sky-500", generando: "bg-amber-500", generada: "bg-violet-500", enviada: "bg-blue-500", cerradas: "bg-emerald-500" }
const isOpen = (l: QuoteLead) => l.status !== "ganada" && l.status !== "perdida"

export function QuotesHub({ initialLeads }: { initialLeads: QuoteLead[] }) {
  const router = useRouter()
  const [leads, setLeads] = useState(initialLeads)
  useEffect(() => setLeads(initialLeads), [initialLeads])
  const [view, setView] = useState<"tablero" | "lista">("tablero")
  const [q, setQ] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const kpi = useMemo(() => quoteKpis(leads), [leads])
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  const filtered = leads.filter((l) => !q.trim() || norm(`${l.company ?? ""} ${l.name} ${l.giro ?? ""} ${l.phone ?? ""}`).includes(norm(q)))
  const selected = leads.find((l) => l.id === selectedId) ?? null
  const patchLocal = (id: string, p: Partial<QuoteLead>) => setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)))

  function moveTo(id: string, status: QuoteStatus) {
    const lead = leads.find((l) => l.id === id)
    if (!lead || lead.status === status) return
    const prev = lead.status
    const now = new Date().toISOString()
    patchLocal(id, { status, ...(status === "enviada" ? { sent_at: now } : {}), ...(status === "ganada" || status === "perdida" ? { closed_at: now } : {}) })
    setError(null)
    updateQuoteLead(id, { status }).catch((e) => { patchLocal(id, { status: prev }); setError(e instanceof Error ? e.message : String(e)) })
  }
  function onDragEnd(e: DragEndEvent) {
    if (!e.over) return
    moveTo(String(e.active.id), String(e.over.id) as QuoteStatus)
  }

  const tiles = [
    { label: "Abiertas", value: String(kpi.abiertas) },
    { label: "Por cotizar", value: String(kpi.porCotizar), tone: kpi.porCotizar ? "text-sky-600" : undefined },
    { label: "Cotizado este mes", value: money(kpi.cotizadoMes) },
    { label: "Enviadas sin respuesta (7+ d)", value: String(kpi.sinRespuesta), tone: kpi.sinRespuesta ? "text-amber-600" : undefined },
    { label: "Cierre últimos 30 días", value: kpi.cerradas30 ? `${kpi.ganadas30}/${kpi.cerradas30}` : "—" },
  ]

  return (
    <div className={cn("space-y-4 transition-[padding]", selected && "lg:pr-[580px]")}>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-border bg-card px-4 py-3 min-w-0">
            <p className="text-[11px] text-muted-foreground truncate">{t.label}</p>
            <p className={cn("text-xl font-semibold tabular-nums", t.tone)}>{t.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
          {([["tablero", LayoutGrid, "Tablero"], ["lista", List, "Lista"]] as const).map(([k, Icon, label]) => (
            <button key={k} type="button" onClick={() => setView(k)}
              className={cn("h-8 px-3 rounded-md text-sm inline-flex items-center gap-1.5", view === k ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-background flex-1 min-w-[180px] max-w-sm">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar negocio, contacto, giro…" className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none" />
        </label>
        {error && <span className="text-xs text-red-600">{error}</span>}
        <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}><Plus className="w-4 h-4" />Nuevo lead</Button>
      </div>

      {leads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-20 text-center text-sm text-muted-foreground">
          Todavía no hay leads. Llegan de GHL al pasar a <b>Proposal Pending</b>, del atajo del iPhone, o créalos a mano.
        </div>
      ) : view === "tablero" ? (
        <DndContext id="quotes-board" sensors={sensors} onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1 snap-x">
            {STAGES.map((st) => {
              const items = filtered.filter((l) => (st.statuses as readonly QuoteStatus[]).includes(l.status))
              return (
                <Column key={st.key} stage={st} count={items.length}>
                  {items.map((l) => <Card key={l.id} lead={l} active={l.id === selectedId} onOpen={() => setSelectedId(l.id)} />)}
                  {!items.length && st.key !== "cerradas" && <p className="text-xs text-muted-foreground text-center py-6">Arrastra aquí</p>}
                </Column>
              )
            })}
          </div>
        </DndContext>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>{["Negocio", "Tipo", "Precio", "Etapa", "Origen", "Llegó"].map((h) => <th key={h} className="text-left font-medium px-4 py-2.5">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((l) => (
                <tr key={l.id} onClick={() => setSelectedId(l.id)} className={cn("cursor-pointer hover:bg-muted/40", l.id === selectedId && "bg-primary/5")}>
                  <td className="px-4 py-2.5"><span className="font-medium">{l.company || l.name}</span>{l.company && <span className="text-muted-foreground"> · {l.name}</span>}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{typeLabel(l.proposal_type) ?? "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums">{money(l.price)}</td>
                  <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1.5">{statusLabel(l.status)}{needsFollowUp(l) && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}</span></td>
                  <td className="px-4 py-2.5 text-muted-foreground">{SOURCE[l.source] ?? l.source}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{ago(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <LeadPanel key={selected.id} lead={selected} onClose={() => setSelectedId(null)}
          onLocal={(p) => patchLocal(selected.id, p)} onMove={(s) => moveTo(selected.id, s)}
          onDeleted={() => { setLeads((ls) => ls.filter((l) => l.id !== selected.id)); setSelectedId(null) }} />
      )}
      {creating && <NewLeadDialog onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); router.refresh(); setSelectedId(id) }} />}
    </div>
  )
}

function Column({ stage, count, children }: { stage: (typeof STAGES)[number]; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.dropStatus ?? `none-${stage.key}`, disabled: !stage.dropStatus })
  return (
    <section className="w-[280px] shrink-0 snap-start flex flex-col rounded-xl bg-muted/40 border border-border/60">
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span className={cn("w-2 h-2 rounded-full", STAGE_DOT[stage.key])} />
        <span className="text-sm font-semibold">{stage.label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      </header>
      {stage.key === "cerradas" ? (
        <div className="px-2 pb-2 space-y-2">
          <DropZone status="ganada" label="Ganada" />
          <DropZone status="perdida" label="Perdida" />
          <div className="space-y-2 pt-1">{children}</div>
        </div>
      ) : (
        <div ref={setNodeRef} className={cn("flex-1 px-2 pb-2 space-y-2 min-h-[120px] rounded-b-xl transition-colors", isOver && "bg-primary/10")}>{children}</div>
      )}
    </section>
  )
}

function DropZone({ status, label }: { status: QuoteStatus; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div ref={setNodeRef} className={cn("rounded-lg border border-dashed px-3 py-2 text-xs text-center text-muted-foreground transition-colors",
      isOver && (status === "ganada" ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40" : "border-foreground/40 bg-muted"))}>
      Soltar como <b>{label}</b>
    </div>
  )
}

function Card({ lead: l, active, onOpen }: { lead: QuoteLead; active: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: l.id })
  const follow = needsFollowUp(l)
  return (
    <button ref={setNodeRef} type="button" {...attributes} {...listeners} onClick={onOpen}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cn("w-full text-left rounded-lg border bg-card p-3 space-y-1.5 shadow-sm hover:border-foreground/30 transition-colors touch-none",
        active ? "border-primary ring-1 ring-primary" : "border-border", isDragging && "relative z-50 shadow-lg opacity-90")}>
      <div className="flex items-start gap-2">
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium leading-tight truncate">{l.company || l.name}</span>
          {l.company && <span className="block text-[11px] text-muted-foreground truncate">{l.name}</span>}
        </span>
        {l.status === "ganada" && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
        {l.status === "perdida" && <X className="w-4 h-4 text-muted-foreground shrink-0" />}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {typeLabel(l.proposal_type) && <span className={cn("px-1.5 py-0.5 rounded", hasTemplate(l.proposal_type) ? "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300" : "bg-muted text-muted-foreground")}>{typeLabel(l.proposal_type)}</span>}
        {l.price != null && <span className="font-semibold tabular-nums">{short(l.price)}</span>}
        {l.proposal_pdf_url && <FileText className="w-3.5 h-3.5 text-emerald-600" />}
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>{SOURCE[l.source] ?? l.source}</span><span>·</span>
        <span>{l.status === "enviada" ? `enviada ${ago(l.sent_at ?? l.updated_at)}` : ago(l.created_at)}</span>
        {follow && <span className="ml-auto inline-flex items-center gap-0.5 text-amber-600 font-medium"><AlertTriangle className="w-3 h-3" />seguimiento</span>}
        {!follow && (l.status === "nuevo" || l.status === "lista") && missingInfo(l) && <span className="ml-auto text-sky-600">falta info</span>}
        {l.status === "error" && <span className="ml-auto text-red-600 font-medium">error</span>}
        {l.status === "generando" && <Loader2 className="ml-auto w-3 h-3 animate-spin text-amber-600" />}
      </div>
    </button>
  )
}

const CONTEXT_FIELDS: [keyof QuoteLead, string, boolean?][] = [
  ["company", "Negocio"], ["name", "Contacto"], ["phone", "Teléfono"], ["email", "Correo"], ["giro", "Giro"], ["website", "Sitio web actual"],
  ["socials", "Redes sociales"], ["investment", "Inversión que contempla"], ["business_size", "Tamaño"], ["offer", "Oferta de interés"],
  ["problem", "Problema a resolver", true], ["ai_summary", "Resumen de calificación (IA de GHL)", true],
]

function LeadPanel({ lead, onClose, onLocal, onMove, onDeleted }: { lead: QuoteLead; onClose: () => void; onLocal: (p: Partial<QuoteLead>) => void; onMove: (s: QuoteStatus) => void; onDeleted: () => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<QuoteLead>(lead)
  const [notes, setNotes] = useState(lead.notes ?? "")
  const [error, setError] = useState<string | null>(null)
  const [saving, startSave] = useTransition()
  const [generating, startGen] = useTransition()
  const [sent, setSent] = useState(false)
  useEffect(() => { if (!editing) setDraft(lead) }, [lead, editing])
  const input = "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
  const typeIsOther = !!lead.proposal_type && !hasTemplate(lead.proposal_type)
  const digits = (lead.phone ?? "").replace(/\D/g, "")

  function save(patch: QuotePatch) {
    setError(null)
    onLocal(patch as Partial<QuoteLead>)
    startSave(async () => { try { await updateQuoteLead(lead.id, patch) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } })
  }
  function generate() {
    setError(null)
    startGen(async () => {
      try { await generateQuoteProposal(lead.id); onLocal({ status: "generada", last_error: null, proposal_generated_at: new Date().toISOString() }); setSent(true) }
      catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    })
  }

  const stageButtons: [QuoteStatus, string][] = [["lista", "Por cotizar"], ["generada", "Propuesta lista"], ["enviada", "Enviada"], ["ganada", "Ganada"], ["perdida", "Perdida"]]
  const current = lead.status === "nuevo" ? "lista" : lead.status
  const history = [
    ["Llegó", lead.created_at], ["Propuesta generada", lead.proposal_generated_at], ["Enviada", lead.sent_at], [lead.status === "ganada" ? "Ganada" : "Perdida", lead.closed_at],
  ].filter(([, d]) => d) as [string, string][]

  return (
    <aside className="fixed inset-0 lg:inset-auto lg:right-0 lg:top-0 lg:bottom-0 lg:w-[560px] z-40 bg-background border-l border-border shadow-2xl flex flex-col">
      <header className="px-5 pt-4 pb-3 border-b border-border space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold leading-tight truncate">{lead.company || lead.name}</h2>
            <p className="text-xs text-muted-foreground truncate">{lead.company ? `${lead.name} · ` : ""}{SOURCE[lead.source] ?? lead.source} · llegó {ago(lead.created_at)}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {lead.phone && <a href={`tel:${lead.phone}`} className="h-8 px-2.5 rounded-md border border-border text-xs inline-flex items-center gap-1.5 hover:bg-muted"><Phone className="w-3.5 h-3.5" />{lead.phone}</a>}
          {digits && <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer" className="h-8 px-2.5 rounded-md border border-border text-xs inline-flex items-center gap-1.5 hover:bg-muted"><MessageCircle className="w-3.5 h-3.5" />WhatsApp</a>}
          {lead.email && <a href={`mailto:${lead.email}`} className="h-8 px-2.5 rounded-md border border-border text-xs inline-flex items-center gap-1.5 hover:bg-muted min-w-0"><Mail className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{lead.email}</span></a>}
        </div>
        <div className="flex flex-wrap gap-1">
          {stageButtons.map(([s, label]) => (
            <button key={s} type="button" onClick={() => onMove(s)}
              className={cn("h-7 px-2.5 rounded-full text-xs font-medium border transition-colors", current === s ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
          {(lead.status === "generando" || lead.status === "error") && <span className="h-7 px-2.5 rounded-full text-xs font-medium inline-flex items-center bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">{statusLabel(lead.status)}</span>}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Propuesta */}
        <section className="rounded-xl border border-border p-4 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Propuesta</p>
          <div className="grid grid-cols-[1fr_140px] gap-2 [&>*]:min-w-0">
            <select value={hasTemplate(lead.proposal_type) ? lead.proposal_type! : typeIsOther ? "otra" : ""}
              onChange={(e) => {
                const v = e.target.value
                if (v === "otra") return save({ proposal_type: `otra:${lead.offer ?? ""}` })
                const t = PROPOSAL_TYPES.find((p) => p.key === v)
                save({ proposal_type: v || null, ...(t && lead.price == null ? { price: t.defaultPrice } : {}) })
              }} className={input}>
              <option value="">Tipo de propuesta…</option>
              {PROPOSAL_TYPES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              <option value="otra">Otra oferta (sin plantilla)</option>
            </select>
            <input type="number" min={0} defaultValue={lead.price ?? ""} key={`p-${lead.price}`} placeholder="Precio MXN"
              onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== lead.price) save({ price: v }) }} className={cn(input, "tabular-nums")} />
          </div>
          {typeIsOther && (
            <input defaultValue={lead.proposal_type!.replace(/^otra:/, "")} placeholder="¿Qué oferta? (Paid Media, Agente de IA…)"
              onBlur={(e) => save({ proposal_type: `otra:${e.target.value}` })} className={input} />
          )}
          {typeIsOther ? (
            <p className="text-xs text-muted-foreground">Esta oferta aún no tiene plantilla de Slides. Pídele a Claude (MCP) que arme la propuesta y pega aquí el link.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={generate} disabled={generating || !hasTemplate(lead.proposal_type) || lead.status === "generando"}>
                {generating || lead.status === "generando" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {lead.status === "generando" ? "Generando en Make…" : lead.proposal_pdf_url ? "Generar de nuevo" : "Generar propuesta"}
              </Button>
              {(sent || (lead.status === "generada" && !lead.proposal_pdf_url)) && <span className="text-xs text-muted-foreground">{sent ? "Enviada a Make: " : ""}el PDF llega a tu correo en 1–3 min. Si quieres, pega aquí su link.</span>}
            </div>
          )}
          {(lead.proposal_pdf_url || lead.proposal_slides_url) && (
            <div className="grid grid-cols-2 gap-2">
              {lead.proposal_pdf_url && <a href={lead.proposal_pdf_url} target="_blank" rel="noreferrer" className="rounded-lg border border-border px-3 py-2.5 flex items-center gap-2 hover:bg-muted text-sm"><FileText className="w-4 h-4 text-red-500" />PDF<ExternalLink className="w-3 h-3 ml-auto text-muted-foreground" /></a>}
              {lead.proposal_slides_url && <a href={lead.proposal_slides_url} target="_blank" rel="noreferrer" className="rounded-lg border border-border px-3 py-2.5 flex items-center gap-2 hover:bg-muted text-sm"><Presentation className="w-4 h-4 text-amber-500" />Slides<ExternalLink className="w-3 h-3 ml-auto text-muted-foreground" /></a>}
            </div>
          )}
          {lead.last_error && <p className="text-xs text-red-600">Último error: {lead.last_error}</p>}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Pegar links a mano</summary>
            <div className="space-y-2 mt-2">
              <input defaultValue={lead.proposal_pdf_url ?? ""} placeholder="Link del PDF" onBlur={(e) => e.target.value !== (lead.proposal_pdf_url ?? "") && save({ proposal_pdf_url: e.target.value })} className={input} />
              <input defaultValue={lead.proposal_slides_url ?? ""} placeholder="Link de Slides / presentación" onBlur={(e) => e.target.value !== (lead.proposal_slides_url ?? "") && save({ proposal_slides_url: e.target.value })} className={input} />
            </div>
          </details>
        </section>

        {/* Contexto */}
        <section className="space-y-2">
          <div className="flex items-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex-1">Contexto</p>
            {editing ? (
              <span className="flex gap-2">
                <button type="button" onClick={() => { setDraft(lead); setEditing(false) }} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
                <button type="button" onClick={() => { const p: QuotePatch = {}; for (const [k] of CONTEXT_FIELDS) (p as Record<string, unknown>)[k] = draft[k]; save(p); setEditing(false) }} className="text-xs font-semibold text-primary">Guardar</button>
              </span>
            ) : (
              <button type="button" onClick={() => setEditing(true)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><Pencil className="w-3 h-3" />Editar</button>
            )}
          </div>
          {editing ? (
            <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
              {CONTEXT_FIELDS.map(([k, label, area]) => (
                <label key={k} className={cn("block space-y-0.5", area && "col-span-2")}>
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                  {area
                    ? <AutoTextarea rows={2} value={(draft[k] as string) ?? ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className={cn(input, "resize-none")} />
                    : <input value={(draft[k] as string) ?? ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className={input} />}
                </label>
              ))}
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {CONTEXT_FIELDS.filter(([k]) => lead[k]).map(([k, label, area]) => (
                <div key={k} className={cn("min-w-0", area && "col-span-2")}>
                  <dt className="text-[11px] text-muted-foreground">{label}</dt>
                  <dd className={cn("break-words", area ? "whitespace-pre-line" : "truncate")}>{String(lead[k])}</dd>
                </div>
              ))}
              {!CONTEXT_FIELDS.some(([k]) => lead[k]) && <p className="col-span-2 text-xs text-muted-foreground">Sin contexto todavía. Usa “Editar” o pídeselo a Claude.</p>}
            </dl>
          )}
          {lead.form_answers && (
            <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Respuestas del formulario</summary><p className="mt-1 whitespace-pre-line">{lead.form_answers}</p></details>
          )}
        </section>

        {/* Notas */}
        <section className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notas</p>
          <AutoTextarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (lead.notes ?? "") && save({ notes })}
            placeholder="Lo que platicaste, objeciones, siguientes pasos…" className={cn(input, "resize-none")} />
        </section>

        {/* Historial */}
        <section className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Historial</p>
          <ol className="space-y-1 text-xs">
            {history.map(([label, d]) => <li key={label} className="flex gap-2"><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 mt-1.5" /><span className="flex-1">{label}</span><span className="text-muted-foreground">{dateFmt(d)}</span></li>)}
          </ol>
        </section>
      </div>

      <footer className="px-5 py-3 border-t border-border flex items-center gap-3">
        <button type="button" onClick={() => { if (confirm("¿Eliminar este lead del hub? (No toca GHL)")) deleteQuoteLead(lead.id).then(onDeleted) }} className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" />Eliminar</button>
        <span className={cn("text-xs ml-auto", error ? "text-red-600" : "text-muted-foreground")}>{error ?? (saving ? "Guardando…" : "")}</span>
      </footer>
    </aside>
  )
}

function NewLeadDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [f, setF] = useState({ name: "", company: "", phone: "", email: "", notes: "" })
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const input = "w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] grid-cols-1 [&>*]:min-w-0">
        <DialogTitle>Nuevo lead</DialogTitle>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
            <input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} placeholder="Negocio" className={input} autoFocus />
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Contacto *" className={input} />
            <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Teléfono" className={input} />
            <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Correo" className={input} />
          </div>
          <AutoTextarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Qué necesita, de dónde viene, contexto…" className={cn(input, "resize-none")} />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
          <Button size="sm" disabled={pending || !f.name.trim()} onClick={() => start(async () => { try { onCreated(await createQuoteLead(f)) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } })}>
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}Crear lead
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
