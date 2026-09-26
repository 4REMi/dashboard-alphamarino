"use client"

import { useState } from "react"
import type { PortalData, Servicio, Concepto, Pieza } from "@/components/share/client-portal-app"
import { PiezaCard } from "@/components/share/pieza-card"
import { MediaLightbox } from "@/components/share/media-lightbox"

// Piezas del rediseño del portal del cliente: portada con resumen del ciclo
// (métricas + qué te toca / qué ajusta el equipo / qué está aprobado),
// archivo por ciclo, y la vista del concepto por estado (pendiente arriba,
// en ajustes y aprobado colapsados). Mismo código de color del dashboard:
// ámbar = te toca, rojo = cambios pedidos (en ajustes), verde = aprobado.

type Status = "pendiente" | "aprobada" | "cambios"
type Entry = { pieza: Pieza; servicio: Servicio; concepto: Concepto }

export const TONE = {
  pendiente: { label: "Te toca revisar", dot: "#f59e0b", bg: "#fffbeb", border: "#fde68a", fg: "#92400e" },
  cambios: { label: "El equipo está ajustando", dot: "#ef4444", bg: "#fef2f2", border: "#fecaca", fg: "#991b1b" },
  aprobada: { label: "Aprobado", dot: "#10b981", bg: "#ecfdf5", border: "#a7f3d0", fg: "#065f46" },
} as const

const SINGULAR: Record<string, string> = { Conversaciones: "conversación", Leads: "lead", Compras: "compra", Clics: "clic", Registros: "registro", Resultados: "resultado" }

const money = (v: number, cur: string | null) =>
  `${cur && cur !== "USD" && cur !== "MXN" ? "" : "$"}${v.toLocaleString("en-US", { maximumFractionDigits: v < 100 ? 2 : 0 })}${cur ? ` ${cur}` : ""}`

export function Thumb({ pieza, className = "" }: { pieza: Pieza; className?: string }) {
  if (pieza.tipo === "guion") {
    return <span className={`flex items-center justify-center bg-[#fffbeb] text-lg ${className}`}>📝</span>
  }
  // Un video sin miniatura no se puede mostrar como <img>.
  const src = pieza.thumbUrl ?? (pieza.tipo === "imagen" ? pieza.mediaUrl : null)
  return (
    <span className={`relative block bg-slate-700 overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" /> : null}
      {pieza.tipo === "video" && <span className="absolute inset-0 flex items-center justify-center text-white text-xs drop-shadow">▶</span>}
    </span>
  )
}

function Clamp({ text, lines = 2 }: { text: string; lines?: number }) {
  const [open, setOpen] = useState(false)
  const long = text.length > lines * 70
  return (
    <span className="block">
      <span className="block" style={open || !long ? undefined : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{text}</span>
      {long && (
        // span, no button: Clamp vive dentro de filas que ya son botones.
        <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setOpen((v) => !v) } }}
          className="inline-block cursor-pointer text-[10.5px] font-semibold opacity-70 hover:opacity-100 mt-0.5">
          {open ? "Ver menos" : "Ver completo"}
        </span>
      )}
    </span>
  )
}

// ── Portada ─────────────────────────────────────────────────────────
export function HomeView({ data, entries, getStatus, getFeedback, abrirConcepto, irQuick }: {
  data: PortalData
  entries: Entry[]
  getStatus: (p: Pieza) => Status
  getFeedback: (p: Pieza) => string | null
  abrirConcepto: (s: Servicio, c: Concepto) => void
  irQuick: () => void
}) {
  const by = (st: Status) => entries.filter((e) => getStatus(e.pieza) === st)
  const pend = by("pendiente"), cam = by("cambios"), apr = by("aprobada")
  const total = entries.length
  const m = data.metricas

  const activos = data.servicios.flatMap((s) => s.conceptos.filter((c) => c.vigencia !== "archivado").map((c) => ({ s, c })))

  return (
    <div className="flex flex-col gap-6 max-w-[1400px]">
      <div className="flex items-end gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 mb-1">Resumen del ciclo</div>
          <div className="text-[22px] font-semibold tracking-tight text-slate-900" style={{ fontFamily: "'Unbounded', sans-serif" }}>
            {data.cicloActualLabel ?? "Tu publicidad"}
          </div>
          {data.diasRestantes !== null && <div className="text-xs text-slate-500 mt-1">{data.diasRestantes === 0 ? "Último día del ciclo" : `Faltan ${data.diasRestantes} día${data.diasRestantes === 1 ? "" : "s"}`}</div>}
        </div>
        {total > 0 && (
          <div className="min-w-[240px]">
            <div className="flex justify-between text-[11px] text-slate-500 mb-1"><span>Piezas aprobadas</span><span className="font-semibold text-slate-900 tabular-nums">{apr.length}/{total}</span></div>
            <div className="h-2 rounded-full bg-[#e8edf4] overflow-hidden flex">
              <div style={{ width: `${(apr.length / total) * 100}%`, background: TONE.aprobada.dot }} />
              <div style={{ width: `${(cam.length / total) * 100}%`, background: TONE.cambios.dot }} />
              <div style={{ width: `${(pend.length / total) * 100}%`, background: TONE.pendiente.dot }} />
            </div>
          </div>
        )}
      </div>

      {m && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            ["Inversión", money(m.inversion, m.moneda)],
            [m.resultadoLabel, m.resultados.toLocaleString("en-US", { maximumFractionDigits: 0 })],
            [`Costo por ${SINGULAR[m.resultadoLabel] ?? "resultado"}`, m.costoPorResultado !== null ? money(m.costoPorResultado, m.moneda) : "—"],
            ["Impresiones", m.impresiones.toLocaleString("en-US")],
            ["Clics al enlace", m.clics.toLocaleString("en-US")],
          ].map(([label, value]) => (
            <div key={label} className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
              <div className="text-[10.5px] text-slate-500">{label}</div>
              <div className="text-lg font-bold text-slate-900 tabular-nums">{value}</div>
            </div>
          ))}
          <p className="col-span-full text-[10.5px] text-slate-400 -mt-1">Datos de Meta Ads en lo que va del ciclo.</p>
        </div>
      )}

      {total > 0 && (
        <div className="grid md:grid-cols-3 gap-4 items-start">
          <StatusColumn st="pendiente" items={pend} getFeedback={getFeedback} abrirConcepto={abrirConcepto}
            empty="✓ Nada pendiente. ¡Gracias!" action={pend.length > 1 ? { label: `Revisar las ${pend.length} de corrido →`, onClick: irQuick } : undefined} />
          <StatusColumn st="cambios" items={cam} getFeedback={getFeedback} abrirConcepto={abrirConcepto} empty="Sin ajustes en curso." showFeedback />
          <StatusColumn st="aprobada" items={apr} getFeedback={getFeedback} abrirConcepto={abrirConcepto} empty="Aún no hay piezas aprobadas." gallery />
        </div>
      )}

      {activos.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-700">Conceptos del ciclo</span>
            <span className="flex-1 h-px bg-slate-200" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {activos.map(({ s, c }) => <ConceptCard key={c.id} s={s} c={c} getStatus={getStatus} onOpen={() => abrirConcepto(s, c)} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function StatusColumn({ st, items, getFeedback, abrirConcepto, empty, action, showFeedback, gallery }: {
  st: Status
  items: Entry[]
  getFeedback: (p: Pieza) => string | null
  abrirConcepto: (s: Servicio, c: Concepto) => void
  empty: string
  action?: { label: string; onClick: () => void }
  showFeedback?: boolean
  gallery?: boolean
}) {
  const [all, setAll] = useState(false)
  const t = TONE[st]
  const shown = all ? items : items.slice(0, gallery ? 8 : 4)
  return (
    <div className="rounded-2xl border overflow-hidden bg-white" style={{ borderColor: t.border }}>
      <div className="px-4 py-3 flex items-center gap-2" style={{ background: t.bg }}>
        <span className="w-2 h-2 rounded-full" style={{ background: t.dot }} />
        <span className="text-[12.5px] font-bold" style={{ color: t.fg }}>{t.label}</span>
        <span className="ml-auto text-[12px] font-bold tabular-nums" style={{ color: t.fg }}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-5 text-[11.5px] text-slate-400 text-center">{empty}</p>
      ) : gallery ? (
        <div className="p-3 grid grid-cols-4 gap-1.5">
          {shown.map((e) => (
            <button key={e.pieza.id} onClick={() => abrirConcepto(e.servicio, e.concepto)} title={`${e.concepto.nombre} · ${e.pieza.titulo}`} className="rounded-lg overflow-hidden hover:ring-2 hover:ring-emerald-300">
              <Thumb pieza={e.pieza} className="w-full aspect-[4/5]" />
            </button>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {shown.map((e) => {
            const fb = showFeedback ? getFeedback(e.pieza) : null
            return (
              <button key={e.pieza.id} onClick={() => abrirConcepto(e.servicio, e.concepto)} className="w-full px-3 py-2.5 flex gap-2.5 text-left hover:bg-slate-50">
                <Thumb pieza={e.pieza} className="w-10 h-12 rounded-md shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[11.5px] font-semibold text-slate-900 truncate">{e.concepto.nombre}</span>
                  <span className="block text-[10.5px] text-slate-500 truncate">{e.pieza.titulo}</span>
                  {fb && <span className="block text-[10.5px] mt-0.5" style={{ color: t.fg }}><Clamp text={`Tu comentario: "${fb}"`} /></span>}
                </span>
              </button>
            )
          })}
        </div>
      )}
      {(items.length > shown.length || action) && (
        <div className="px-4 py-2 border-t border-slate-100 flex items-center gap-3 text-[11px] font-semibold">
          {items.length > shown.length && <button onClick={() => setAll(true)} className="text-slate-500 hover:text-slate-900">Ver las {items.length}</button>}
          {action && <button onClick={action.onClick} className="ml-auto" style={{ color: t.fg }}>{action.label}</button>}
        </div>
      )}
    </div>
  )
}

function ConceptCard({ s, c, getStatus, onOpen }: { s: Servicio; c: Concepto; getStatus: (p: Pieza) => Status; onOpen: () => void }) {
  const k = { pend: 0, cam: 0, apr: 0 }
  for (const p of c.piezas) { const st = getStatus(p); if (st === "pendiente") k.pend++; else if (st === "cambios") k.cam++; else k.apr++ }
  const cover = c.piezas.find((p) => p.tipo !== "guion" && (p.thumbUrl || p.mediaUrl))
  const n = c.piezas.length || 1
  return (
    <button onClick={onOpen} className="bg-white border border-slate-200 rounded-2xl overflow-hidden text-left hover:shadow-md transition-shadow flex">
      {cover ? <Thumb pieza={cover} className="w-20 shrink-0" /> : <span className="w-20 shrink-0 bg-slate-100 flex items-center justify-center text-xl">💡</span>}
      <span className="flex-1 min-w-0 p-3.5 flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-[10px] text-slate-500"><span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color ?? "#94a3b8" }} />{s.nombre}{c.vigencia === "evergreen" && " · ⭐ Validado"}</span>
        <span className="text-[13.5px] font-bold text-slate-900 leading-snug">{c.nombre || "Concepto"}</span>
        <span className="h-1.5 rounded-full bg-[#e8edf4] overflow-hidden flex mt-auto">
          <span style={{ width: `${(k.apr / n) * 100}%`, background: TONE.aprobada.dot }} />
          <span style={{ width: `${(k.cam / n) * 100}%`, background: TONE.cambios.dot }} />
          <span style={{ width: `${(k.pend / n) * 100}%`, background: TONE.pendiente.dot }} />
        </span>
        <span className="text-[10.5px] text-slate-500">
          {k.pend > 0 ? <strong style={{ color: TONE.pendiente.fg }}>{k.pend} por revisar · </strong> : null}
          {k.cam > 0 ? `${k.cam} en ajustes · ` : ""}{k.apr}/{c.piezas.length} aprobadas
        </span>
      </span>
    </button>
  )
}

// ── Archivo por ciclo ───────────────────────────────────────────────
export function Archive({ data, abrirConcepto, selectedId }: { data: PortalData; abrirConcepto: (s: Servicio, c: Concepto) => void; selectedId?: string | null }) {
  const [openLabel, setOpenLabel] = useState<string | null>(null)
  const byCycle = new Map<string, { s: Servicio; c: Concepto }[]>()
  for (const s of data.servicios) for (const c of s.conceptos.filter((x) => x.vigencia === "archivado")) {
    const k = c.mes ?? "Sin fecha"
    if (!byCycle.has(k)) byCycle.set(k, [])
    byCycle.get(k)!.push({ s, c })
  }
  if (byCycle.size === 0) return null
  const ordered = [...byCycle.entries()].sort((a, b) => ((data.ciclosResumen[a[0]]?.inicio ?? "") < (data.ciclosResumen[b[0]]?.inicio ?? "") ? 1 : -1))
  return (
    <div className="flex flex-col gap-1">
      <div className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">🗂️ Ciclos anteriores</div>
      {ordered.map(([label, list]) => {
        const r = data.ciclosResumen[label]
        const open = openLabel === label
        return (
          <div key={label}>
            <button onClick={() => setOpenLabel(open ? null : label)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-[9px] text-left hover:bg-slate-50">
              <span className="flex-1 min-w-0">
                <span className="block text-[11.5px] font-semibold text-slate-700">{label}</span>
                <span className="block text-[10px] text-slate-400">
                  {list.length} concepto{list.length === 1 ? "" : "s"}
                  {r?.inversion != null ? ` · $${r.inversion.toLocaleString("en-US", { maximumFractionDigits: 0 })} invertidos` : ""}
                  {r?.resultados != null ? ` · ${r.resultados.toLocaleString("en-US")} resultados` : ""}
                </span>
              </span>
              <span className="text-[10px] text-slate-400">{open ? "⌃" : "⌄"}</span>
            </button>
            {open && list.map(({ s, c }) => (
              <button key={c.id} onClick={() => abrirConcepto(s, c)} className={`w-full flex items-center gap-2 pl-5 pr-2.5 py-1.5 rounded-[9px] text-left ${selectedId === c.id ? "bg-[#0f172a] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color ?? "#94a3b8" }} />
                <span className="flex-1 min-w-0 text-[11px] truncate">{c.nombre}</span>
                <span className="text-[9px] opacity-60">solo lectura</span>
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ── Vista del concepto: por estado ──────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ConceptPieces(props: any) {
  const { concepto, getStatus, getFeedback, feedbackFor, setFeedbackFor, feedbackText, setFeedbackText, aprobar, enviarCambios } = props
  const piezas: Pieza[] = concepto.piezas
  const readonly = concepto.vigencia === "archivado"
  const by = (st: Status) => piezas.filter((p) => getStatus(p) === st)
  const pend = by("pendiente"), cam = by("cambios"), apr = by("aprobada")
  const guiones = piezas.filter((p) => p.tipo === "guion"), media = piezas.filter((p) => p.tipo !== "guion")
  const okG = guiones.filter((p) => getStatus(p) === "aprobada").length
  const okM = media.filter((p) => getStatus(p) === "aprobada").length
  const camM = media.filter((p) => getStatus(p) === "cambios").length

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const card = (p: Pieza, extra: any = {}) => (
    <PiezaCard
      key={p.id} pieza={p} readonly={readonly}
      status={getStatus(p)} feedback={getFeedback(p)}
      feedbackOpen={feedbackFor === p.id} feedbackText={feedbackText}
      onFeedbackChange={setFeedbackText}
      onPedirCambios={() => { setFeedbackFor(p.id); setFeedbackText("") }}
      onCancelar={() => { setFeedbackFor(null); setFeedbackText("") }}
      onEnviarCambios={() => enviarCambios(p, feedbackText)}
      onAprobar={() => aprobar(p)}
      dense
      {...extra}
    />
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Flujo: guion → pieza producida */}
      <div className="flex items-center gap-2 flex-wrap text-[11.5px]">
        <Step label="Guiones" done={okG} total={guiones.length} />
        <span className="text-slate-300">→</span>
        <Step label="Piezas" done={okM} total={media.length} extra={camM ? `${camM} en ajustes` : undefined} />
        <span className="text-[10.5px] text-slate-400 ml-1">Al aprobar un guion, producimos su pieza.</span>
      </div>

      {pend.length > 0 && (
        <Section st="pendiente" count={pend.length}>
          <div className="flex flex-col gap-4">{pend.map((p) => card(p))}</div>
        </Section>
      )}

      {cam.length > 0 && (
        <Section st="cambios" count={cam.length} hint="Ya recibimos tus comentarios; te avisamos cuando esté la nueva versión.">
          <div className="flex flex-col gap-2">{cam.map((p) => <CompactRow key={p.id} pieza={p} st="cambios" feedback={getFeedback(p)} full={card(p)} />)}</div>
        </Section>
      )}

      {apr.length > 0 && (
        <Section st="aprobada" count={apr.length} collapsible defaultOpen={pend.length === 0 && cam.length === 0}>
          <ApprovedGrid piezas={apr} full={(p: Pieza) => card(p)} />
        </Section>
      )}
    </div>
  )
}

function Step({ label, done, total, extra }: { label: string; done: number; total: number; extra?: string }) {
  if (!total) return <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-400">{label} · aún no</span>
  const ok = done === total
  return (
    <span className="px-2.5 py-1 rounded-full font-semibold" style={{ background: ok ? TONE.aprobada.bg : "#f1f5f9", color: ok ? TONE.aprobada.fg : "#334155" }}>
      {ok ? "✓ " : ""}{label} {done}/{total}{extra ? <span style={{ color: TONE.cambios.fg }}> · {extra}</span> : null}
    </span>
  )
}

function Section({ st, count, hint, collapsible, defaultOpen = true, children }: { st: Status; count: number; hint?: string; collapsible?: boolean; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  const t = TONE[st]
  const Header = collapsible ? "button" : "div"
  return (
    <section>
      <Header onClick={collapsible ? () => setOpen((v) => !v) : undefined} className="w-full flex items-center gap-2 mb-2.5 text-left">
        <span className="w-2 h-2 rounded-full" style={{ background: t.dot }} />
        <span className="text-[12px] font-bold" style={{ color: t.fg }}>{t.label}</span>
        <span className="text-[11px] font-bold tabular-nums" style={{ color: t.fg }}>{count}</span>
        {hint && <span className="text-[10.5px] text-slate-400 ml-1">{hint}</span>}
        <span className="flex-1 h-px bg-slate-200 ml-1" />
        {collapsible && <span className="text-[10.5px] text-slate-400">{open ? "Ocultar ⌃" : "Ver ⌄"}</span>}
      </Header>
      {open && children}
    </section>
  )
}

function CompactRow({ pieza, st, feedback, full }: { pieza: Pieza; st: Status; feedback: string | null; full: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const t = TONE[st]
  if (open) {
    return (
      <div>
        <button onClick={() => setOpen(false)} className="text-[10.5px] font-semibold text-slate-500 hover:text-slate-900 mb-1.5">⌃ Contraer</button>
        {full}
      </div>
    )
  }
  return (
    <button onClick={() => setOpen(true)} className="w-full bg-white border rounded-2xl px-3 py-2.5 flex items-start gap-3 text-left hover:shadow-sm" style={{ borderColor: t.border }}>
      <Thumb pieza={pieza} className="w-11 h-14 rounded-lg shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block text-[12.5px] font-semibold text-slate-900">{pieza.titulo}{pieza.nuevaVersion && <span className="ml-1.5 text-[10px] font-semibold text-sky-700">nueva versión</span>}</span>
        {feedback && <span className="block text-[11px] mt-0.5" style={{ color: t.fg }}><Clamp text={`Tu comentario: "${feedback}"`} /></span>}
      </span>
      <span className="text-[10.5px] text-slate-400 shrink-0 mt-0.5">Ver ⌄</span>
    </button>
  )
}

function ApprovedGrid({ piezas, full }: { piezas: Pieza[]; full: (p: Pieza) => React.ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<Pieza | null>(null)
  const media = piezas.filter((p) => p.tipo !== "guion")
  const guiones = piezas.filter((p) => p.tipo === "guion")
  return (
    <div className="flex flex-col gap-3">
      {media.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {media.map((p) => (
            <button key={p.id} onClick={() => p.mediaUrl && setLightbox(p)} className="group relative rounded-xl overflow-hidden border border-emerald-200 bg-white text-left">
              <Thumb pieza={p} className="w-full aspect-[9/16]" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6 text-[10px] font-medium text-white truncate">{p.titulo}</span>
              <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] flex items-center justify-center">✓</span>
            </button>
          ))}
        </div>
      )}
      {guiones.map((p) => openId === p.id ? (
        <div key={p.id}>
          <button onClick={() => setOpenId(null)} className="text-[10.5px] font-semibold text-slate-500 hover:text-slate-900 mb-1.5">⌃ Contraer</button>
          {full(p)}
        </div>
      ) : (
        <button key={p.id} onClick={() => setOpenId(p.id)} className="w-full bg-white border border-emerald-200 rounded-2xl px-3.5 py-2.5 flex items-center gap-3 text-left hover:shadow-sm">
          <span className="text-base">📝</span>
          <span className="flex-1 min-w-0">
            <span className="block text-[12.5px] font-semibold text-slate-900">{p.titulo}</span>
            <span className="block text-[11px] text-slate-500 truncate">{p.guion?.[0]?.t}</span>
          </span>
          <span className="text-[10.5px] text-slate-400 shrink-0">{p.guion?.length ?? 0} líneas · Ver ⌄</span>
        </button>
      ))}
      {lightbox?.mediaUrl && <MediaLightbox tipo={lightbox.tipo === "video" ? "video" : "imagen"} src={lightbox.mediaUrl} titulo={lightbox.titulo} onClose={() => setLightbox(null)} />}
    </div>
  )
}
