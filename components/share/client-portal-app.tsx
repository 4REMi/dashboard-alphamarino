"use client"

import { useMemo, useState, useTransition } from "react"
import { submitClientReview, submitBriefClientReview } from "@/lib/actions/client-review"
import { PiezaCard } from "@/components/share/pieza-card"
import { EstrategiaPanel } from "@/components/share/estrategia-panel"
import { MediaLightbox } from "@/components/share/media-lightbox"

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface Pieza {
  id:              string
  tipo:            "guion" | "video" | "imagen"
  titulo:          string
  sub:             string
  guion?:          { n: number; t: string }[]
  mediaUrl?:       string | null
  assetId?:        string
  briefId?:        string
  scriptKey?:      string
  client_status:   string | null
  client_feedback: string | null
}

export interface Concepto {
  id:         string
  nombre:     string | null
  angulo:     string | null
  angleEmoji: string | null
  funnelCode: string | null
  funnel:     string | null
  vigencia:   "actual" | "evergreen" | "archivado"
  mes:        string | null
  estrategia: {
    principio:       string | null
    quien:           string
    awareness:       string | null
    teoriaGuiding:   string | null
    teoriaMecanismo: string | null
    porque:          string | null
    problema:        string | null
    objecion:        string | null
    transformacion:  string | null
  }
  piezas: Pieza[]
}

export interface Servicio {
  id:        string
  nombre:    string
  color:     string | null
  conceptos: Concepto[]
}

export interface PortalData {
  clienteNombre:    string
  logoUrl:          string | null
  cicloActualLabel: string | null
  servicios:        Servicio[]
}

type Status = "pendiente" | "aprobada" | "cambios"

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function statusOf(clientStatus: string | null): Status {
  if (clientStatus === "approved") return "aprobada"
  if (clientStatus === "changes_requested") return "cambios"
  return "pendiente"
}

function counts(piezas: Pieza[], overrides: Record<string, Status>) {
  let pend = 0, apr = 0, cam = 0
  for (const p of piezas) {
    const st = overrides[p.id] ?? statusOf(p.client_status)
    if (st === "aprobada") apr++
    else if (st === "cambios") cam++
    else pend++
  }
  return { pend, apr, cam, total: piezas.length }
}

const ICON: Record<Pieza["tipo"], { emoji: string; bg: string }> = {
  guion:  { emoji: "📝", bg: "#fffbeb" },
  video:  { emoji: "🎬", bg: "#f0f9ff" },
  imagen: { emoji: "🖼️", bg: "#f5f3ff" },
}

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────

export function ClientPortalApp({ data }: { data: PortalData }) {
  const [isPending, startTransition] = useTransition()

  // Optimistic overrides layered on top of server-provided status
  const [overrides, setOverrides] = useState<Record<string, Status>>({})
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({})

  // Navigation state (mobile screen-stack; desktop uses servicioId/conceptoId directly)
  const [screen, setScreen]           = useState<"servicios" | "servicio" | "concepto" | "quick">("servicios")
  const [servicioId, setServicioId]   = useState<string | null>(data.servicios[0]?.id ?? null)
  const [conceptoId, setConceptoId]   = useState<string | null>(null)
  const [tabEstrategia, setTab]       = useState<"id" | "teoria" | "mec">("id")
  const [estrategiaOpen, setEstrategiaOpen] = useState(false)
  const [archivoOpenIds, setArchivoOpenIds] = useState<Set<string>>(new Set())
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState("")
  const [quickModalOpen, setQuickModalOpen] = useState(false)
  const [quickQueue, setQuickQueue]   = useState<string[]>([])
  const [quickIdx, setQuickIdx]       = useState(0)

  const getStatus = (p: Pieza): Status => overrides[p.id] ?? statusOf(p.client_status)
  const getFeedback = (p: Pieza): string | null => feedbacks[p.id] ?? p.client_feedback

  // ── All pending pieces across non-archived concepts ──
  const allPending = useMemo(() => {
    const out: { pieza: Pieza; servicio: Servicio; concepto: Concepto }[] = []
    for (const s of data.servicios)
      for (const c of s.conceptos.filter((x) => x.vigencia !== "archivado"))
        for (const p of c.piezas)
          if (getStatus(p) === "pendiente") out.push({ pieza: p, servicio: s, concepto: c })
    return out
  }, [data, overrides])

  function findPieza(id: string) {
    for (const s of data.servicios)
      for (const c of s.conceptos)
        for (const p of c.piezas)
          if (p.id === id) return { pieza: p, servicio: s, concepto: c }
    return null
  }

  // ── Actions ──
  function aprobar(p: Pieza, onDone?: () => void) {
    setOverrides((o) => ({ ...o, [p.id]: "aprobada" }))
    startTransition(async () => {
      if (p.tipo === "guion") await submitBriefClientReview(p.briefId!, p.scriptKey!, "approved", null)
      else await submitClientReview(p.assetId!, "approved", null)
      onDone?.()
    })
  }
  function enviarCambios(p: Pieza, text: string, onDone?: () => void) {
    if (!text.trim()) return
    setOverrides((o) => ({ ...o, [p.id]: "cambios" }))
    setFeedbacks((f) => ({ ...f, [p.id]: text.trim() }))
    startTransition(async () => {
      if (p.tipo === "guion") await submitBriefClientReview(p.briefId!, p.scriptKey!, "changes_requested", text.trim())
      else await submitClientReview(p.assetId!, "changes_requested", text.trim())
      onDone?.()
    })
    setFeedbackFor(null)
    setFeedbackText("")
  }

  // ── Global progress (non-archived) ──
  const activasTodo = data.servicios.flatMap((s) => s.conceptos.filter((c) => c.vigencia !== "archivado")).flatMap((c) => c.piezas)
  const gk = counts(activasTodo, overrides)
  const progresoPct = gk.total ? Math.round(((gk.apr + gk.cam) / gk.total) * 100) : 0

  // ── Quick review ──
  function irQuick() {
    setQuickQueue(allPending.map((e) => e.pieza.id))
    setQuickIdx(0)
    setFeedbackFor(null)
    setFeedbackText("")
    setScreen("quick")
    setQuickModalOpen(true)
  }
  function cerrarQuick() {
    setScreen("servicios")
    setQuickModalOpen(false)
  }
  function quickNext() {
    setQuickIdx((i) => i + 1)
    setFeedbackFor(null)
    setFeedbackText("")
  }

  const servicio = data.servicios.find((s) => s.id === servicioId) ?? data.servicios[0] ?? null
  const concepto = servicio?.conceptos.find((c) => c.id === conceptoId) ?? null

  function abrirConcepto(s: Servicio, c: Concepto) {
    setServicioId(s.id)
    setConceptoId(c.id)
    setTab("id")
    setEstrategiaOpen(false)
    setFeedbackFor(null)
    setFeedbackText("")
    setScreen("concepto")
  }

  return (
    <div className="min-h-screen bg-[#f5f6fa]" style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}>
      {/* ── Mobile ── */}
      <div className="md:hidden">
        <MobileApp
          data={data} screen={screen} setScreen={setScreen}
          servicio={servicio} concepto={concepto}
          servicioId={servicioId} setServicioId={setServicioId}
          abrirConcepto={abrirConcepto}
          tabEstrategia={tabEstrategia} setTab={setTab}
          estrategiaOpen={estrategiaOpen} setEstrategiaOpen={setEstrategiaOpen}
          archivoOpenIds={archivoOpenIds} setArchivoOpenIds={setArchivoOpenIds}
          getStatus={getStatus} getFeedback={getFeedback}
          feedbackFor={feedbackFor} setFeedbackFor={setFeedbackFor}
          feedbackText={feedbackText} setFeedbackText={setFeedbackText}
          aprobar={aprobar} enviarCambios={enviarCambios}
          allPending={allPending} irQuick={irQuick}
          quickQueue={quickQueue} quickIdx={quickIdx} quickNext={quickNext}
          findPieza={findPieza} isPending={isPending}
        />
      </div>

      {/* ── Desktop ── */}
      <div className="hidden md:block">
        <DesktopApp
          data={data} servicio={servicio} concepto={concepto}
          setServicioId={setServicioId}
          abrirConcepto={abrirConcepto}
          tabEstrategia={tabEstrategia} setTab={setTab}
          archivoOpenIds={archivoOpenIds} setArchivoOpenIds={setArchivoOpenIds}
          getStatus={getStatus} getFeedback={getFeedback}
          feedbackFor={feedbackFor} setFeedbackFor={setFeedbackFor}
          feedbackText={feedbackText} setFeedbackText={setFeedbackText}
          aprobar={aprobar} enviarCambios={enviarCambios}
          allPending={allPending} irQuick={irQuick}
          progresoPct={progresoPct} gk={gk}
          quickModalOpen={quickModalOpen} cerrarQuick={cerrarQuick}
          quickQueue={quickQueue} quickIdx={quickIdx} quickNext={quickNext}
          findPieza={findPieza} isPending={isPending}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────────

function BadgeRow({ concepto }: { concepto: Concepto }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {concepto.angulo && (
        <span className="text-[10px] font-semibold bg-[#0f172a] text-white px-2 py-0.5 rounded-md">
          {concepto.angleEmoji ? `${concepto.angleEmoji} ` : ""}{concepto.angulo}
        </span>
      )}
      {concepto.funnel && (
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md" style={{ background: FUNNEL_BG[concepto.funnelCode ?? ""] ?? "#f1f5f9", color: FUNNEL_FG[concepto.funnelCode ?? ""] ?? "#475569" }}>
          {concepto.funnel}
        </span>
      )}
      {concepto.vigencia === "evergreen" && (
        <span className="text-[10px] font-medium bg-[#fffbeb] text-[#b45309] px-2 py-0.5 rounded-md">⭐ Validado</span>
      )}
    </div>
  )
}

const FUNNEL_BG: Record<string, string> = { TOF: "#f0f9ff", MOF: "#f5f3ff", BOF: "#ecfdf5" }
const FUNNEL_FG: Record<string, string> = { TOF: "#0369a1", MOF: "#6d28d9", BOF: "#047857" }

function VigenciaBanner({ concepto }: { concepto: Concepto }) {
  if (concepto.vigencia === "archivado") {
    return (
      <div className="bg-[#f1f5f9] border border-[#e2e8f0] rounded-[14px] px-4 py-3 flex items-center gap-2.5">
        <span className="text-[15px]">🗂️</span>
        <div className="text-[11px] leading-relaxed text-[#475569]">
          <strong>Campaña de {concepto.mes}</strong> — archivo de solo lectura. Estas piezas ya circularon.
        </div>
      </div>
    )
  }
  if (concepto.vigencia === "evergreen") {
    return (
      <div className="bg-[#fffbeb] border border-[#fde68a] rounded-[14px] px-4 py-3 flex items-center gap-2.5">
        <span className="text-[15px]">♾️</span>
        <div className="text-[11px] leading-relaxed text-[#78350f]">
          <strong>Concepto Evergreen</strong> — validado con resultados; se mantiene activo mes a mes.
        </div>
      </div>
    )
  }
  return null
}

// ─────────────────────────────────────────────────────────────────
// Mobile app
// ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MobileApp(props: any) {
  const { data, screen, setScreen, servicio, concepto, setServicioId, abrirConcepto,
    tabEstrategia, setTab, estrategiaOpen, setEstrategiaOpen, archivoOpenIds, setArchivoOpenIds,
    getStatus, getFeedback, feedbackFor, setFeedbackFor, feedbackText, setFeedbackText,
    aprobar, enviarCambios, allPending, irQuick, quickQueue, quickIdx, quickNext, findPieza } = props

  if (screen === "quick") {
    return <QuickScreen {...props} onClose={() => setScreen("servicios")} />
  }

  if (screen === "concepto" && concepto) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="px-5 py-3 flex items-center gap-3 border-b border-slate-200/60 bg-white/85 backdrop-blur-sm sticky top-0 z-10">
          <button onClick={() => setScreen("servicio")} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-[15px]">‹</button>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-500">{servicio?.nombre} /</div>
            <div className="text-sm font-bold text-slate-900 truncate">{concepto.nombre || "Concepto"}</div>
          </div>
        </div>
        <div className="flex-1 px-5 py-4 flex flex-col gap-3">
          <VigenciaBanner concepto={concepto} />
          <div className="bg-white border border-dashed border-[#d1dce8] rounded-[14px] overflow-hidden">
            <button onClick={() => setEstrategiaOpen((v: boolean) => !v)} className="w-full px-4 py-3 flex items-center justify-between text-left">
              <span className="text-[11.5px] text-slate-500">{concepto.angleEmoji} {concepto.angulo} — ¿Por qué este concepto?</span>
              <span className="text-xs text-slate-400">{estrategiaOpen ? "⌃" : "⌄"}</span>
            </button>
            {estrategiaOpen && (
              <EstrategiaPanel concepto={concepto} tab={tabEstrategia} setTab={setTab} compact />
            )}
          </div>
          {concepto.piezas.map((p: Pieza) => (
            <PiezaCard
              key={p.id} pieza={p} readonly={concepto.vigencia === "archivado"}
              status={getStatus(p)} feedback={getFeedback(p)}
              feedbackOpen={feedbackFor === p.id} feedbackText={feedbackText}
              onFeedbackChange={setFeedbackText}
              onPedirCambios={() => { setFeedbackFor(p.id); setFeedbackText("") }}
              onCancelar={() => { setFeedbackFor(null); setFeedbackText("") }}
              onEnviarCambios={() => enviarCambios(p, feedbackText)}
              onAprobar={() => aprobar(p)}
            />
          ))}
        </div>
      </div>
    )
  }

  if (screen === "servicio" && servicio) {
    const actuales   = servicio.conceptos.filter((c: Concepto) => c.vigencia === "actual")
    const evergreens = servicio.conceptos.filter((c: Concepto) => c.vigencia === "evergreen")
    const archivados = servicio.conceptos.filter((c: Concepto) => c.vigencia === "archivado")
    const mesesMap = new Map<string, Concepto[]>()
    for (const c of archivados) {
      const key = c.mes ?? ""
      if (!mesesMap.has(key)) mesesMap.set(key, [])
      mesesMap.get(key)!.push(c)
    }
    const archivoOpen = archivoOpenIds.has(servicio.id)
    return (
      <div className="min-h-screen flex flex-col">
        <div className="px-5 py-3 flex items-center gap-3 border-b border-slate-200/60 bg-white/85 backdrop-blur-sm sticky top-0 z-10">
          <button onClick={() => setScreen("servicios")} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-[15px]">‹</button>
          <div>
            <div className="text-[10px] text-slate-500">Servicios /</div>
            <div className="text-sm font-bold text-slate-900">{servicio.nombre}</div>
          </div>
        </div>
        <div className="flex-1 px-5 py-5 flex flex-col gap-3.5">
          <p className="text-[11.5px] leading-relaxed text-slate-500">
            Cada <strong className="text-slate-900">concepto</strong> es una idea publicitaria distinta que estamos probando para este servicio.
          </p>
          {actuales.length > 0 && (
            <ConceptoGroup label={`En curso · ${data.cicloActualLabel ?? "actual"}`} conceptos={actuales} abrirConcepto={(c: Concepto) => abrirConcepto(servicio, c)} getStatus={getStatus} />
          )}
          {evergreens.length > 0 && (
            <ConceptoGroup label="♾️ Siempre activos · Evergreen" conceptos={evergreens} abrirConcepto={(c: Concepto) => abrirConcepto(servicio, c)} getStatus={getStatus} />
          )}
          {archivados.length > 0 && (
            <div className="bg-white/65 border border-[#e8edf4] rounded-[18px] overflow-hidden mt-1">
              <button
                onClick={() => setArchivoOpenIds((s: Set<string>) => { const n = new Set(s); n.has(servicio.id) ? n.delete(servicio.id) : n.add(servicio.id); return n })}
                className="w-full px-4.5 py-3.5 flex items-center gap-2.5 text-left"
              >
                <span className="text-[15px]">🗂️</span>
                <div className="flex-1">
                  <div className="text-[12.5px] font-semibold text-slate-700">Conceptos de meses anteriores</div>
                  <div className="text-[10px] text-slate-400">{archivados.length} concepto{archivados.length !== 1 ? "s" : ""} de campañas pasadas</div>
                </div>
                <span className="text-xs text-slate-400">{archivoOpen ? "⌃" : "⌄"}</span>
              </button>
              {archivoOpen && (
                <div className="border-t border-[#e8edf4] px-4.5 pb-3.5 flex flex-col gap-1">
                  {[...mesesMap.entries()].map(([mes, cs]) => (
                    <div key={mes}>
                      <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mt-2.5">{mes}</div>
                      {cs.map((c) => (
                        <button key={c.id} onClick={() => abrirConcepto(servicio, c)} className="w-full flex items-center gap-2.5 py-2.5 border-b border-slate-100 last:border-0 text-left">
                          <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md shrink-0">{c.angleEmoji} {c.angulo}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-700 truncate">{c.nombre}</div>
                            <div className="text-[9.5px] text-slate-400">{c.piezas.length} pieza{c.piezas.length !== 1 ? "s" : ""} · campaña finalizada</div>
                          </div>
                          <span className="text-[10.5px] font-semibold text-blue-600 shrink-0">Ver ›</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // servicios (home)
  return (
    <div className="min-h-screen flex flex-col">
      <div className="px-5 py-3.5 flex items-center gap-2.5 border-b border-slate-200/60 bg-white/85 backdrop-blur-sm sticky top-0 z-10">
        <Mark logoUrl={data.logoUrl} />
        <span className="text-[13px] font-semibold text-slate-900">Alpha Marino</span>
        <span className="ml-auto text-[10.5px] text-slate-500">{data.clienteNombre}</span>
      </div>
      <div className="flex-1 px-5 py-5.5 flex flex-col gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-1.5">Tu publicidad, por servicio</div>
          <div className="text-[20px] font-semibold text-slate-900 leading-tight" style={{ fontFamily: "'Unbounded', sans-serif" }}>¿Qué servicio quieres revisar?</div>
        </div>
        {data.servicios.map((s: Servicio) => {
          const activos = s.conceptos.filter((c) => c.vigencia !== "archivado")
          const piezas = activos.flatMap((c) => c.piezas)
          const kReal = { pend: piezas.filter((p: Pieza) => getStatus(p) === "pendiente").length, apr: piezas.filter((p: Pieza) => getStatus(p) === "aprobada").length, total: piezas.length }
          const pct = kReal.total ? Math.round((kReal.apr / kReal.total) * 100) : 0
          return (
            <button key={s.id} onClick={() => { setServicioId(s.id); setScreen("servicio") }} className="relative bg-white border border-slate-200 rounded-[20px] p-4.5 shadow-[0_1px_3px_rgba(15,23,42,0.05)] flex flex-col gap-3 text-left">
              {kReal.pend > 0 ? (
                <span className="absolute top-4.5 right-4 text-[10px] font-bold text-[#b45309] bg-[#fffbeb] border border-[#fde68a] px-2.5 py-0.5 rounded-full">{kReal.pend} por revisar</span>
              ) : (
                <span className="absolute top-4.5 right-4 text-[10px] font-bold text-[#047857] bg-[#ecfdf5] px-2.5 py-0.5 rounded-full">✓ Al día</span>
              )}
              <span className="w-11 h-11 rounded-[13px] flex items-center justify-center text-xl" style={{ background: s.color ? `${s.color}1a` : "#f1f5f9" }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color ?? "#94a3b8" }} />
              </span>
              <div>
                <div className="text-[15px] font-bold tracking-tight text-slate-900">{s.nombre}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{activos.length} concepto{activos.length !== 1 ? "s" : ""} activo{activos.length !== 1 ? "s" : ""} · {kReal.total} piezas</div>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="flex-1 h-[5px] rounded-full bg-[#e8edf4] overflow-hidden">
                  <div className="h-full rounded-full bg-[#10b981] transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10.5px] text-slate-500 tabular-nums">{kReal.apr}/{kReal.total} aprobadas</span>
              </div>
            </button>
          )
        })}
        {allPending.length > 0 && (
          <button onClick={irQuick} className="border border-dashed border-[#d1dce8] rounded-[16px] px-4 py-3.5 flex items-center gap-3 text-left">
            <span className="text-base">⚡</span>
            <div className="flex-1 text-[11.5px] leading-relaxed text-slate-500">
              ¿Poco tiempo? Revisa las <strong className="text-slate-900">{allPending.length} piezas pendientes</strong> de corrido.
            </div>
            <span className="text-[11px] font-semibold text-blue-600 shrink-0">Revisar →</span>
          </button>
        )}
      </div>
    </div>
  )
}

function ConceptoGroup({ label, conceptos, abrirConcepto, getStatus }: {
  label: string
  conceptos: Concepto[]
  abrirConcepto: (c: Concepto) => void
  getStatus: (p: Pieza) => Status
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-700">{label}</span>
        <span className="flex-1 h-px bg-slate-200" />
      </div>
      {conceptos.map((c) => {
        const k = { pend: c.piezas.filter((p) => getStatus(p) === "pendiente").length, apr: c.piezas.filter((p) => getStatus(p) === "aprobada").length, cam: c.piezas.filter((p) => getStatus(p) === "cambios").length }
        return (
          <div key={c.id} className="bg-white border border-slate-200 rounded-[18px] overflow-hidden shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
            <div className="px-4.5 pt-4 pb-3">
              <BadgeRow concepto={c} />
              <div className="text-[14.5px] font-bold text-slate-900 mt-2">{c.nombre || "Concepto"}</div>
            </div>
            <div className="px-4.5 pb-3.5 flex gap-2">
              <MiniStat label="Por revisar" value={k.pend} color="#b45309" />
              <MiniStat label="Aprobadas" value={k.apr} color="#047857" />
              <MiniStat label="Cambios" value={k.cam} color="#0369a1" />
            </div>
            {k.pend > 0 ? (
              <button onClick={() => abrirConcepto(c)} className="w-full px-4.5 py-3 bg-[#fffbeb] border-t border-[#fde68a] flex items-center justify-between">
                <span className="text-[11.5px] font-semibold text-[#78350f]">Piezas esperan tu revisión</span>
                <span className="text-[11px] font-semibold text-[#b45309]">Abrir ›</span>
              </button>
            ) : (
              <button onClick={() => abrirConcepto(c)} className="w-full px-4.5 py-3 bg-[#ecfdf5] border-t border-[#d1fae5] flex items-center justify-between">
                <span className="text-[11.5px] font-semibold text-[#065f46]">✓ Todo revisado</span>
                <span className="text-[11px] font-semibold text-[#047857]">Ver ›</span>
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex-1 bg-[#f8fafc] border border-[#e8edf4] rounded-[10px] py-2 text-center">
      <div className="text-[15px] font-bold tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  )
}

function Mark({ logoUrl }: { logoUrl: string | null }) {
  return (
    <span className="w-[30px] h-[30px] rounded-[9px] bg-[#0f172a] text-white flex items-center justify-center text-xs font-bold overflow-hidden shrink-0">
      {logoUrl ? <img src={logoUrl} alt="" className="w-full h-full object-contain" /> : "A"}
    </span>
  )
}

// Video/imagen preview used in the quick-review flow — same expand-to-lightbox
// behavior as PiezaCard, sized larger since this is the focused single-piece view.
function QuickMedia({ pieza, maxH }: { pieza: Pieza; maxH: number }) {
  const [open, setOpen] = useState(false)
  if (pieza.tipo === "video") {
    return pieza.mediaUrl ? (
      <div className="relative">
        <video src={pieza.mediaUrl} controls className="rounded-2xl w-full bg-black" style={{ maxHeight: maxH }} />
        <button onClick={() => setOpen(true)} className="absolute top-2.5 right-2.5 w-7 h-7 rounded-lg bg-black/60 hover:bg-black/80 flex items-center justify-center text-white text-xs" title="Ver en grande" aria-label="Ver en grande">⤢</button>
        {open && <MediaLightbox tipo="video" src={pieza.mediaUrl} titulo={pieza.titulo} onClose={() => setOpen(false)} />}
      </div>
    ) : (
      <div className="bg-[#0f172a] rounded-2xl flex items-center justify-center" style={{ height: maxH }}>
        <span className="w-[52px] h-[52px] rounded-full bg-white/15 flex items-center justify-center text-white text-lg">▶</span>
      </div>
    )
  }
  return pieza.mediaUrl ? (
    <>
      <button onClick={() => setOpen(true)} className="block w-full cursor-zoom-in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pieza.mediaUrl} alt="" className="rounded-2xl w-full object-contain bg-[#e8edf4]" style={{ maxHeight: maxH }} />
      </button>
      {open && <MediaLightbox tipo="imagen" src={pieza.mediaUrl} titulo={pieza.titulo} onClose={() => setOpen(false)} />}
    </>
  ) : (
    <div className="bg-[#e8edf4] rounded-2xl flex flex-col items-center justify-center gap-1.5 text-slate-400" style={{ height: maxH }}>
      <span className="text-3xl">🖼️</span>
      <span className="text-[10.5px] font-medium">Vista previa de la imagen</span>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function QuickScreen(props: any) {
  const { onClose, quickQueue, quickIdx, findPieza, getStatus, getFeedback,
    feedbackFor, setFeedbackFor, feedbackText, setFeedbackText,
    aprobar, enviarCambios, quickNext } = props

  const idx = Math.min(quickIdx, quickQueue.length)
  const currentId = quickQueue[idx]
  const current = currentId ? findPieza(currentId) : null
  const done = !current
  const pct = quickQueue.length ? Math.round(((done ? quickQueue.length : idx) / quickQueue.length) * 100) : 0
  const nextEntry = quickQueue[idx + 1] ? findPieza(quickQueue[idx + 1]) : null

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="px-5 py-3 flex items-center gap-3 border-b border-slate-100">
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-[15px]">✕</button>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-slate-900">Revisión rápida</div>
          <div className="text-[10px] text-slate-500 truncate">{current ? `${current.servicio.nombre} · ${current.concepto.nombre}` : "Listo"}</div>
        </div>
        {current && <span className="text-[10.5px] font-semibold text-slate-500 tabular-nums">{idx + 1} de {quickQueue.length}</span>}
      </div>
      <div className="h-[3px] bg-[#e8edf4] shrink-0"><div className="h-full bg-[#0f172a] transition-all" style={{ width: `${pct}%` }} /></div>

      {done ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3.5 px-9 text-center">
          <span className="w-16 h-16 rounded-full bg-[#ecfdf5] flex items-center justify-center text-2xl">🎉</span>
          <div className="text-lg font-semibold text-slate-900" style={{ fontFamily: "'Unbounded', sans-serif" }}>¡Todo revisado!</div>
          <p className="text-xs leading-relaxed text-slate-500">Gracias. El equipo de Alpha Marino ya recibió tus respuestas y se pone en marcha.</p>
          <button onClick={onClose} className="mt-1.5 text-[12.5px] font-semibold text-white bg-[#0f172a] rounded-[14px] px-6.5 py-3">Volver al inicio</button>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5">
              <span className="w-[42px] h-[42px] rounded-xl flex items-center justify-center text-lg" style={{ background: ICON[current.pieza.tipo as Pieza["tipo"]].bg }}>{ICON[current.pieza.tipo as Pieza["tipo"]].emoji}</span>
              <div>
                <div className="text-[14.5px] font-bold text-slate-900">{current.pieza.titulo}</div>
                <div className="text-[10.5px] text-slate-500">{current.pieza.sub}</div>
              </div>
            </div>
            {current.pieza.tipo === "guion" && (
              <>
                <div className="bg-white border border-[#e8edf4] rounded-2xl p-4.5 flex flex-col gap-3.5">
                  {current.pieza.guion?.map((l: { n: number; t: string }) => (
                    <div key={l.n} className="flex gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-[#0f172a] text-white text-[10px] font-bold flex items-center justify-center shrink-0 tabular-nums">{l.n}</span>
                      <p className="m-0 text-[13px] leading-relaxed text-slate-800">{l.t}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] leading-relaxed text-slate-400 text-center">📝 Este texto es la voz en off. Al aprobarlo pasamos a producir el video.</p>
              </>
            )}
            {(current.pieza.tipo === "video" || current.pieza.tipo === "imagen") && (
              <QuickMedia pieza={current.pieza} maxH={280} />
            )}
          </div>
          <div className="bg-white border-t border-slate-200 px-5 pt-3.5 pb-2.5 flex flex-col gap-2.5">
            {feedbackFor === current.pieza.id ? (
              <>
                <textarea value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} placeholder="Describe los cambios que necesitas…" rows={3}
                  className="w-full text-xs border border-[#d1dce8] rounded-xl px-3 py-2.5 resize-none outline-none" />
                <div className="flex gap-2.5">
                  <button onClick={() => { setFeedbackFor(null); setFeedbackText("") }} className="flex-1 text-[13px] border border-[#d1dce8] rounded-[14px] py-3 text-slate-500">Cancelar</button>
                  <button onClick={() => enviarCambios(current.pieza, feedbackText, quickNext)} className="flex-[1.4] text-[13px] font-semibold text-white bg-[#f59e0b] rounded-[14px] py-3">Enviar cambios</button>
                </div>
              </>
            ) : (
              <>
                <div className="flex gap-2.5">
                  <button onClick={() => { setFeedbackFor(current.pieza.id); setFeedbackText("") }} className="flex-1 text-[13px] font-medium border border-[#d1dce8] rounded-[14px] py-3 text-[#475569]">Pedir cambios</button>
                  <button onClick={() => aprobar(current.pieza, quickNext)} className="flex-[1.4] text-[13px] font-semibold text-white bg-[#10b981] rounded-[14px] py-3 shadow-[0_2px_8px_rgba(16,185,129,0.3)]">
                    {current.pieza.tipo === "guion" ? "Aprobar guion ✓" : "Aprobar ✓"}
                  </button>
                </div>
                <div className="text-center text-[10.5px] text-slate-400">{nextEntry ? `Después de esta: ${nextEntry.pieza.titulo} →` : "Esta es la última pieza"}</div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Desktop app
// ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DesktopApp(props: any) {
  const { data, servicio, concepto, setServicioId, abrirConcepto,
    tabEstrategia, setTab, archivoOpenIds, setArchivoOpenIds,
    getStatus, getFeedback, feedbackFor, setFeedbackFor, feedbackText, setFeedbackText,
    aprobar, enviarCambios, allPending, irQuick, progresoPct, gk,
    quickModalOpen, cerrarQuick, quickQueue, quickIdx, quickNext, findPieza } = props

  return (
    <div className="min-h-screen flex flex-col relative">
      {/* Header */}
      <div className="h-14 shrink-0 bg-white/92 backdrop-blur-sm border-b border-slate-200/70 flex items-center gap-3 px-6">
        <Mark logoUrl={data.logoUrl} />
        <span className="text-sm font-semibold tracking-tight text-slate-900">Alpha Marino</span>
        <span className="text-slate-300">·</span>
        <span className="text-xs text-slate-500">{data.clienteNombre} — Portal del cliente</span>
        <div className="ml-auto flex items-center gap-3.5">
          <div className="flex items-center gap-2">
            <div className="w-[120px] h-[5px] rounded-full bg-[#e8edf4] overflow-hidden">
              <div className="h-full rounded-full bg-[#10b981] transition-all" style={{ width: `${progresoPct}%` }} />
            </div>
            <span className="text-[11px] text-slate-500 tabular-nums">{gk.apr + gk.cam}/{gk.total} revisadas</span>
          </div>
          {allPending.length > 0 && (
            <button onClick={irQuick} className="text-xs font-semibold border border-[#fde68a] rounded-[10px] px-3.5 py-2 bg-[#fffbeb] text-[#78350f] flex items-center gap-1.5">
              ⚡ Revisión rápida ({allPending.length})
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 grid" style={{ gridTemplateColumns: "280px 1fr" }}>
        {/* Sidebar */}
        <div className="border-r border-slate-200/80 bg-white overflow-y-auto py-5 px-3.5 flex flex-col gap-5">
          {data.servicios.map((s: Servicio) => {
            const activos = s.conceptos.filter((c) => c.vigencia !== "archivado")
            const archivados = s.conceptos.filter((c) => c.vigencia === "archivado")
            const pend = activos.flatMap((c) => c.piezas).filter((p) => getStatus(p) === "pendiente").length
            const archivoOpen = archivoOpenIds.has(s.id)
            const mesesMap = new Map<string, Concepto[]>()
            for (const c of archivados) {
              const key = c.mes ?? ""
              if (!mesesMap.has(key)) mesesMap.set(key, [])
              mesesMap.get(key)!.push(c)
            }
            return (
              <div key={s.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2 px-2.5 pb-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color ?? "#94a3b8" }} />
                  <span className="text-xs font-bold text-slate-900 flex-1">{s.nombre}</span>
                  {pend > 0 ? (
                    <span className="text-[9.5px] font-bold text-[#b45309] bg-[#fffbeb] border border-[#fde68a] px-1.5 py-0.5 rounded-full">{pend}</span>
                  ) : (
                    <span className="text-[10px] text-[#047857]">✓</span>
                  )}
                </div>
                {activos.map((c: Concepto) => {
                  const selected = concepto?.id === c.id
                  const hasPend = c.piezas.some((p) => getStatus(p) === "pendiente")
                  return (
                    <button key={c.id} onClick={() => abrirConcepto(s, c)} className={`flex items-center gap-2 px-2.5 py-2 rounded-[9px] text-left ${selected ? "bg-[#0f172a] text-white" : "text-slate-700 hover:bg-slate-100"}`}>
                      <span className="text-[11px] shrink-0">{c.vigencia === "evergreen" ? "♾️" : "•"}</span>
                      <span className="flex-1 min-w-0 text-[11.5px] font-medium truncate">{c.nombre}</span>
                      {hasPend && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                    </button>
                  )
                })}
                {archivados.length > 0 && (
                  <>
                    <button
                      onClick={() => setArchivoOpenIds((set: Set<string>) => { const n = new Set(set); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n })}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-[9px] text-slate-400 hover:bg-slate-50 text-left"
                    >
                      <span className="text-[11px]">🗂️</span>
                      <span className="flex-1 text-[11px] font-medium">Meses anteriores</span>
                      <span className="text-[10px]">{archivoOpen ? "⌃" : "⌄"}</span>
                    </button>
                    {archivoOpen && [...mesesMap.entries()].map(([mes, cs]) => (
                      <div key={mes}>
                        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-300 px-2.5 pt-1.5 pb-0.5">{mes}</div>
                        {cs.map((c) => {
                          const selected = concepto?.id === c.id
                          return (
                            <button key={c.id} onClick={() => abrirConcepto(s, c)} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-[9px] text-left w-full ${selected ? "bg-[#0f172a] text-white" : "text-slate-700 hover:bg-slate-100"}`}>
                              <span className="flex-1 min-w-0 text-[11px] truncate">{c.nombre}</span>
                              <span className="text-[9px] opacity-60">solo lectura</span>
                            </button>
                          )
                        })}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* Main */}
        <div className="overflow-y-auto py-7 px-8">
          {concepto ? (
            <div className="w-full max-w-[1600px] flex flex-col gap-4.5">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 mb-1.5">{servicio.nombre}</div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[22px] font-semibold tracking-tight text-slate-900" style={{ fontFamily: "'Unbounded', sans-serif" }}>{concepto.nombre}</span>
                  {concepto.angulo && <span className="text-[11px] font-semibold bg-[#0f172a] text-white px-2.5 py-1 rounded-md">{concepto.angleEmoji} {concepto.angulo}</span>}
                  {concepto.funnel && <span className="text-[11px] font-medium px-2.5 py-1 rounded-md" style={{ background: FUNNEL_BG[concepto.funnelCode ?? ""] ?? "#f1f5f9", color: FUNNEL_FG[concepto.funnelCode ?? ""] ?? "#475569" }}>{concepto.funnel}</span>}
                </div>
              </div>
              <VigenciaBanner concepto={concepto} />

              <div className="grid gap-6 items-start" style={{ gridTemplateColumns: "minmax(0,1fr) 360px" }}>
                <div className="flex flex-col gap-4 min-w-0">
                  {concepto.piezas.map((p: Pieza) => (
                    <PiezaCard
                      key={p.id} pieza={p} readonly={concepto.vigencia === "archivado"}
                      status={getStatus(p)} feedback={getFeedback(p)}
                      feedbackOpen={feedbackFor === p.id} feedbackText={feedbackText}
                      onFeedbackChange={setFeedbackText}
                      onPedirCambios={() => { setFeedbackFor(p.id); setFeedbackText("") }}
                      onCancelar={() => { setFeedbackFor(null); setFeedbackText("") }}
                      onEnviarCambios={() => enviarCambios(p, feedbackText)}
                      onAprobar={() => aprobar(p)}
                      dense
                    />
                  ))}
                </div>

                <div className="sticky top-0">
                  <EstrategiaPanel concepto={concepto} tab={tabEstrategia} setTab={setTab} />
                </div>
              </div>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-sm text-slate-400">Selecciona un concepto</div>
          )}
        </div>
      </div>

      {/* Quick review modal */}
      {quickModalOpen && (
        <div className="absolute inset-0 bg-[rgba(15,23,42,0.5)] backdrop-blur-[3px] flex items-center justify-center z-30">
          <div className="w-[620px] max-h-[88%] bg-white rounded-[20px] overflow-hidden flex flex-col shadow-[0_24px_60px_rgba(15,23,42,0.35)]">
            <QuickModalContent
              cerrarQuick={cerrarQuick} quickQueue={quickQueue} quickIdx={quickIdx} findPieza={findPieza}
              feedbackFor={feedbackFor} setFeedbackFor={setFeedbackFor} feedbackText={feedbackText} setFeedbackText={setFeedbackText}
              aprobar={aprobar} enviarCambios={enviarCambios} quickNext={quickNext}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function QuickModalContent(props: any) {
  const { cerrarQuick, quickQueue, quickIdx, findPieza, feedbackFor, setFeedbackFor, feedbackText, setFeedbackText, aprobar, enviarCambios, quickNext } = props
  const idx = Math.min(quickIdx, quickQueue.length)
  const currentId = quickQueue[idx]
  const current = currentId ? findPieza(currentId) : null
  const done = !current
  const pct = quickQueue.length ? Math.round(((done ? quickQueue.length : idx) / quickQueue.length) * 100) : 0
  const nextEntry = quickQueue[idx + 1] ? findPieza(quickQueue[idx + 1]) : null

  return (
    <>
      <div className="px-6 py-4 flex items-center gap-3.5 border-b border-slate-100">
        <button onClick={cerrarQuick} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-sm">✕</button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900">Revisión rápida</div>
          <div className="text-[10.5px] text-slate-500 truncate">{current ? `${current.servicio.nombre} · ${current.concepto.nombre}` : "Listo"}</div>
        </div>
        {current && <span className="text-[11px] font-semibold text-slate-500 tabular-nums">{idx + 1} de {quickQueue.length}</span>}
      </div>
      <div className="h-[3px] bg-[#e8edf4] shrink-0"><div className="h-full bg-[#0f172a] transition-all" style={{ width: `${pct}%` }} /></div>
      {done ? (
        <div className="px-14 py-14 flex flex-col items-center gap-3.5 text-center">
          <span className="w-16 h-16 rounded-full bg-[#ecfdf5] flex items-center justify-center text-2xl">🎉</span>
          <div className="text-lg font-semibold text-slate-900" style={{ fontFamily: "'Unbounded', sans-serif" }}>¡Todo revisado!</div>
          <p className="text-xs leading-relaxed text-slate-500">Gracias. El equipo de Alpha Marino ya recibió tus respuestas y se pone en marcha.</p>
          <button onClick={cerrarQuick} className="mt-1.5 text-[13px] font-semibold text-white bg-[#0f172a] rounded-[13px] px-7 py-3">Cerrar</button>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-6 py-5.5 flex flex-col gap-3.5">
            <div className="flex items-center gap-3">
              <span className="w-[42px] h-[42px] rounded-xl flex items-center justify-center text-lg" style={{ background: ICON[current.pieza.tipo as Pieza["tipo"]].bg }}>{ICON[current.pieza.tipo as Pieza["tipo"]].emoji}</span>
              <div>
                <div className="text-[15px] font-bold text-slate-900">{current.pieza.titulo}</div>
                <div className="text-[11px] text-slate-500">{current.pieza.sub}</div>
              </div>
            </div>
            {current.pieza.tipo === "guion" && (
              <>
                <div className="bg-[#f8fafc] border border-[#e8edf4] rounded-[14px] px-5 py-4.5 flex flex-col gap-3.5">
                  {current.pieza.guion?.map((l: { n: number; t: string }) => (
                    <div key={l.n} className="flex gap-3">
                      <span className="w-[22px] h-[22px] rounded-full bg-[#0f172a] text-white text-[10px] font-bold flex items-center justify-center shrink-0 tabular-nums">{l.n}</span>
                      <p className="m-0 text-[13.5px] leading-relaxed text-slate-800">{l.t}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 text-center">📝 Este texto es la voz en off. Al aprobarlo pasamos a producir el video.</p>
              </>
            )}
            {(current.pieza.tipo === "video" || current.pieza.tipo === "imagen") && (
              <QuickMedia pieza={current.pieza} maxH={240} />
            )}
          </div>
          <div className="border-t border-slate-200 px-6 py-4 flex flex-col gap-2.5">
            {feedbackFor === current.pieza.id ? (
              <>
                <textarea value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} placeholder="Describe los cambios que necesitas…" rows={3}
                  className="w-full text-[13px] border border-[#d1dce8] rounded-xl px-3.5 py-3 resize-none outline-none" />
                <div className="flex gap-2.5 justify-end">
                  <button onClick={() => { setFeedbackFor(null); setFeedbackText("") }} className="text-[12.5px] border border-[#d1dce8] rounded-[11px] px-5 py-2.5 text-slate-500">Cancelar</button>
                  <button onClick={() => enviarCambios(current.pieza, feedbackText, quickNext)} className="text-[12.5px] font-semibold text-white bg-[#f59e0b] rounded-[11px] px-5.5 py-2.5">Enviar cambios</button>
                </div>
              </>
            ) : (
              <>
                <div className="flex gap-2.5">
                  <button onClick={() => { setFeedbackFor(current.pieza.id); setFeedbackText("") }} className="flex-1 text-[13px] font-medium border border-[#d1dce8] rounded-[13px] py-3 text-[#475569]">Pedir cambios</button>
                  <button onClick={() => aprobar(current.pieza, quickNext)} className="flex-[1.4] text-[13px] font-semibold text-white bg-[#10b981] rounded-[13px] py-3 shadow-[0_2px_8px_rgba(16,185,129,0.3)]">
                    {current.pieza.tipo === "guion" ? "Aprobar guion ✓" : "Aprobar ✓"}
                  </button>
                </div>
                <div className="text-center text-[10.5px] text-slate-400">{nextEntry ? `Después de esta: ${nextEntry.pieza.titulo} →` : "Esta es la última pieza"}</div>
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}
