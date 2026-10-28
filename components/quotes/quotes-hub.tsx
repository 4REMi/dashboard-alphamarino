"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Loader2, FileText, ExternalLink, Sparkles, Trash2, X, Presentation } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { AutoTextarea } from "@/components/ui/auto-textarea"
import { createQuoteLead, updateQuoteLead, generateQuoteProposal, deleteQuoteLead, type QuotePatch } from "@/lib/actions/quotes"
import { QUOTE_STATUS, PROPOSAL_TYPES, hasTemplate, type QuoteLead, type QuoteStatus } from "@/lib/quotes/core"
import { cn } from "@/lib/utils"

const TONE: Record<QuoteStatus, string> = {
  nuevo: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
  lista: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
  generando: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  generada: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  enviada: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
  ganada: "bg-emerald-600 text-white",
  perdida: "bg-muted text-muted-foreground",
  error: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
}
const SOURCE: Record<string, string> = { ghl: "GHL", manual: "Manual", atajo: "Atajo" }
const OPEN: QuoteStatus[] = ["nuevo", "lista", "generando", "generada", "error"]
const money = (n: number | null) => (n == null ? "—" : `$${n.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`)
const ago = (d: string) => { const days = Math.floor((Date.now() - Date.parse(d)) / 86_400_000); return days <= 0 ? "hoy" : days === 1 ? "ayer" : `hace ${days} d` }
const typeLabel = (t: string | null) => !t ? "Sin tipo" : PROPOSAL_TYPES.find((p) => p.key === t)?.label ?? `${t.replace(/^otra:/, "")} · sin plantilla`

export function QuotesHub({ initialLeads }: { initialLeads: QuoteLead[] }) {
  const router = useRouter()
  const [leads, setLeads] = useState(initialLeads)
  const [filter, setFilter] = useState<"abiertas" | QuoteStatus | "todas">("abiertas")
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const counts = useMemo(() => Object.fromEntries(QUOTE_STATUS.map((s) => [s.key, leads.filter((l) => l.status === s.key).length])), [leads])
  const shown = leads.filter((l) => filter === "todas" || (filter === "abiertas" ? OPEN.includes(l.status) : l.status === filter))
  const open = leads.find((l) => l.id === openId) ?? null
  const patchLocal = (id: string, p: Partial<QuoteLead>) => setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)))

  const chips: { key: typeof filter; label: string; n: number }[] = [
    { key: "abiertas", label: "Abiertas", n: leads.filter((l) => OPEN.includes(l.status)).length },
    ...QUOTE_STATUS.filter((s) => counts[s.key] > 0 && !["nuevo", "lista", "generando", "generada", "error"].includes(s.key)).map((s) => ({ key: s.key, label: s.label, n: counts[s.key] })),
    { key: "todas", label: "Todas", n: leads.length },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <button key={c.key} type="button" onClick={() => setFilter(c.key)}
            className={cn("h-8 px-3 rounded-full border text-sm transition-colors", filter === c.key ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/30")}>
            {c.label} <span className="opacity-60 tabular-nums">{c.n}</span>
          </button>
        ))}
        <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}><Plus className="w-4 h-4" />Nuevo lead</Button>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          {leads.length ? "Nada en este filtro." : "Todavía no hay leads. Llegarán de GHL al pasar a Proposal Pending, del atajo, o créalos a mano."}
        </div>
      ) : (
        <ul className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {shown.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => setOpenId(l.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{l.company || l.name}{l.company && l.name !== l.company ? <span className="text-muted-foreground font-normal"> · {l.name}</span> : null}</span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {typeLabel(l.proposal_type)} · {money(l.price)}{l.giro ? ` · ${l.giro}` : ""} · {SOURCE[l.source] ?? l.source} · {ago(l.created_at)}
                  </span>
                </span>
                {l.proposal_pdf_url && <FileText className="w-4 h-4 text-emerald-600 shrink-0" />}
                <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0", TONE[l.status])}>{QUOTE_STATUS.find((s) => s.key === l.status)?.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && <LeadDialog lead={open} onClose={() => { setOpenId(null); router.refresh() }} onLocal={(p) => patchLocal(open.id, p)} onDeleted={() => { setLeads((ls) => ls.filter((l) => l.id !== open.id)); setOpenId(null) }} />}
      {creating && <NewLeadDialog onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); router.refresh(); setOpenId(id) }} />}
    </div>
  )
}

function LeadDialog({ lead, onClose, onLocal, onDeleted }: { lead: QuoteLead; onClose: () => void; onLocal: (p: Partial<QuoteLead>) => void; onDeleted: () => void }) {
  const [draft, setDraft] = useState<QuoteLead>(lead)
  const [error, setError] = useState<string | null>(null)
  const [saving, startSave] = useTransition()
  const [generating, startGen] = useTransition()
  const dirty = JSON.stringify(draft) !== JSON.stringify(lead)
  const set = <K extends keyof QuoteLead>(k: K, v: QuoteLead[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const input = "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
  const typeIsOther = !!draft.proposal_type && !hasTemplate(draft.proposal_type)

  function save(extra: QuotePatch = {}) {
    setError(null)
    const patch: QuotePatch = { ...draft, ...extra }
    startSave(async () => {
      try { await updateQuoteLead(lead.id, patch); onLocal(patch as Partial<QuoteLead>) } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    })
  }
  function generate() {
    setError(null)
    startGen(async () => {
      try {
        if (dirty) await updateQuoteLead(lead.id, draft)
        await generateQuoteProposal(lead.id)
        onLocal({ ...draft, status: "generando" }); set("status", "generando")
      } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    })
  }

  // Función (no componente): así los inputs no se recrean en cada tecla.
  const field = (label: string, k: keyof QuoteLead, area?: boolean) => (
    <label key={k} className="block space-y-1 min-w-0">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {area
        ? <AutoTextarea rows={2} value={(draft[k] as string) ?? ""} onChange={(e) => set(k, e.target.value as never)} className={cn(input, "resize-none")} />
        : <input value={(draft[k] as string) ?? ""} onChange={(e) => set(k, e.target.value as never)} className={input} />}
    </label>
  )

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-[min(820px,96vw)] w-[96vw] max-h-[92vh] overflow-y-auto overflow-x-hidden p-0 gap-0 grid-cols-1">
        <div className="px-6 pt-5 pb-4 border-b border-border pr-12">
          <DialogTitle className="text-xl font-semibold truncate">{draft.company || draft.name}</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{SOURCE[lead.source] ?? lead.source} · {ago(lead.created_at)}{lead.phone ? ` · ${lead.phone}` : ""}{lead.email ? ` · ${lead.email}` : ""}</p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {QUOTE_STATUS.map((s) => (
              <button key={s.key} type="button" onClick={() => { set("status", s.key); save({ status: s.key }) }}
                className={cn("h-7 px-2.5 rounded-full text-xs font-medium border transition-colors", draft.status === s.key ? cn(TONE[s.key], "border-transparent") : "border-border text-muted-foreground hover:text-foreground")}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Propuesta */}
          <section className="rounded-xl border border-border p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-3 [&>*]:min-w-0">
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">Tipo de propuesta</span>
                <select value={hasTemplate(draft.proposal_type) ? draft.proposal_type! : typeIsOther ? "otra" : ""}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === "otra") set("proposal_type", `otra:${draft.offer ?? ""}`)
                    else {
                      set("proposal_type", v || null)
                      const t = PROPOSAL_TYPES.find((p) => p.key === v)
                      if (t && draft.price == null) set("price", t.defaultPrice)
                    }
                  }} className={input}>
                  <option value="">Elegir…</option>
                  {PROPOSAL_TYPES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                  <option value="otra">Otra oferta (sin plantilla todavía)</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">Precio (MXN)</span>
                <input type="number" min={0} value={draft.price ?? ""} onChange={(e) => set("price", e.target.value === "" ? null : Number(e.target.value))} className={cn(input, "tabular-nums")} />
              </label>
            </div>
            {typeIsOther && (
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">¿Qué oferta?</span>
                <input value={draft.proposal_type!.replace(/^otra:/, "")} onChange={(e) => set("proposal_type", `otra:${e.target.value}`)} className={input} placeholder="Ej. Paid Media, Agente de IA…" />
                <span className="block text-[11px] text-muted-foreground">Todavía no hay plantilla de Slides para esta oferta: se cotiza a mano por ahora.</span>
              </label>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={generate} disabled={generating || !hasTemplate(draft.proposal_type)}>
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {draft.proposal_pdf_url ? "Generar de nuevo" : "Generar propuesta"}
              </Button>
              {draft.status === "generando" && <span className="text-xs text-amber-700 dark:text-amber-400">Generándose en Make… tarda 1–3 min y te llega por correo.</span>}
              {draft.proposal_pdf_url && <a href={draft.proposal_pdf_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><FileText className="w-4 h-4" />PDF<ExternalLink className="w-3 h-3" /></a>}
              {draft.proposal_slides_url && <a href={draft.proposal_slides_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><Presentation className="w-4 h-4" />Slides<ExternalLink className="w-3 h-3" /></a>}
            </div>
            {lead.last_error && <p className="text-xs text-red-600">Último error de Make: {lead.last_error}</p>}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Pegar link del PDF / Slides a mano</summary>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 [&>*]:min-w-0">
                <input value={draft.proposal_pdf_url ?? ""} onChange={(e) => set("proposal_pdf_url", e.target.value)} placeholder="Link del PDF" className={input} />
                <input value={draft.proposal_slides_url ?? ""} onChange={(e) => set("proposal_slides_url", e.target.value)} placeholder="Link de Slides" className={input} />
              </div>
            </details>
          </section>

          {/* Contexto para cotizar */}
          <section className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Contexto para la propuesta</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 [&>*]:min-w-0">
              {field("Negocio", "company")}
              {field("Contacto", "name")}
              {field("Giro", "giro")}
              {field("Sitio web actual", "website")}
              {field("Redes sociales", "socials")}
              {field("Inversión que contempla", "investment")}
            </div>
            {field("Problema a resolver", "problem", true)}
            {field("Resumen de calificación (IA de GHL)", "ai_summary", true)}
            {field("Notas", "notes", true)}
            {lead.form_answers && (
              <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Respuestas del formulario</summary><p className="mt-1 whitespace-pre-line">{lead.form_answers}</p></details>
            )}
          </section>
        </div>

        <div className="px-6 py-3 border-t border-border bg-background flex items-center gap-3 sticky bottom-0">
          <button type="button" onClick={() => { if (confirm("¿Eliminar este lead del hub? (No toca GHL)")) deleteQuoteLead(lead.id).then(onDeleted) }} className="text-muted-foreground hover:text-destructive" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
          <span className={cn("text-xs flex-1 truncate", error ? "text-red-600" : "text-muted-foreground")}>{error ?? (dirty ? "Cambios sin guardar" : "")}</span>
          <button type="button" onClick={onClose} className="h-9 px-3 text-sm text-muted-foreground hover:text-foreground">Cerrar</button>
          <Button size="sm" onClick={() => save()} disabled={!dirty || saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function NewLeadDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [f, setF] = useState({ name: "", company: "", phone: "", email: "", notes: "" })
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const input = "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] grid-cols-1 [&>*]:min-w-0">
        <DialogTitle>Nuevo lead</DialogTitle>
        <div className="space-y-2">
          {([["name", "Nombre del contacto *"], ["company", "Negocio"], ["phone", "Teléfono"], ["email", "Correo"]] as const).map(([k, l]) => (
            <input key={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={l} className={input} />
          ))}
          <AutoTextarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Notas / contexto" className={cn(input, "resize-none")} />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3 text-sm text-muted-foreground"><X className="w-4 h-4 inline" /> Cancelar</button>
          <Button size="sm" disabled={pending || !f.name.trim()} onClick={() => start(async () => { try { onCreated(await createQuoteLead(f)) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } })}>
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}Crear
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
