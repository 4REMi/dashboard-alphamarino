"use client"

import { useState } from "react"
import type { Pieza } from "@/components/share/client-portal-app"
import { MediaLightbox } from "@/components/share/media-lightbox"

const ICON: Record<Pieza["tipo"], { emoji: string; bg: string }> = {
  guion:  { emoji: "📝", bg: "#fffbeb" },
  video:  { emoji: "🎬", bg: "#f0f9ff" },
  imagen: { emoji: "🖼️", bg: "#f5f3ff" },
}

const PILL: Record<string, { label: string; bg: string; color: string }> = {
  pendiente: { label: "Pendiente", bg: "#fffbeb", color: "#b45309" },
  aprobada:  { label: "✓ Aprobada", bg: "#ecfdf5", color: "#047857" },
  cambios:   { label: "Cambios pedidos", bg: "#f0f9ff", color: "#0369a1" },
}

interface Props {
  pieza:            Pieza
  readonly:         boolean
  status:           "pendiente" | "aprobada" | "cambios"
  feedback:         string | null
  feedbackOpen:      boolean
  feedbackText:      string
  onFeedbackChange: (v: string) => void
  onPedirCambios:   () => void
  onCancelar:       () => void
  onEnviarCambios:  () => void
  onAprobar:        () => void
  dense?:           boolean
}

export function PiezaCard({
  pieza, readonly, status, feedback, feedbackOpen, feedbackText,
  onFeedbackChange, onPedirCambios, onCancelar, onEnviarCambios, onAprobar,
}: Props) {
  const icon = ICON[pieza.tipo]
  const pill = PILL[status]
  const pendiente = status === "pendiente"
  const border = pendiente && !readonly ? "1.5px solid #fde68a" : "1px solid #e2e8f0"
  const mostrarAcciones = pendiente && !feedbackOpen && !readonly
  const [lightboxOpen, setLightboxOpen] = useState(false)

  return (
    <div className="bg-white rounded-[18px] overflow-hidden shadow-[0_1px_3px_rgba(15,23,42,0.05)]" style={{ border }}>
      <div className="px-4.5 py-3.5 flex items-center gap-2.5 border-b border-slate-100">
        <span className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[15px] shrink-0" style={{ background: icon.bg }}>{icon.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-slate-900 truncate">{pieza.titulo}</div>
          <div className="text-[10px] text-slate-500 truncate">{pieza.sub}</div>
        </div>
        <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: pill.bg, color: pill.color }}>{pill.label}</span>
      </div>

      {pieza.tipo === "guion" && (
        <div className="px-4.5 py-3.5 flex flex-col gap-3 bg-[#f8fafc]">
          {pieza.guion?.map((l) => (
            <div key={l.n} className="flex gap-2.5 max-w-2xl">
              <span className="w-5 h-5 rounded-full bg-[#0f172a] text-white text-[10px] font-bold flex items-center justify-center shrink-0 tabular-nums">{l.n}</span>
              <p className="m-0 text-[12.5px] leading-relaxed text-slate-800">{l.t}</p>
            </div>
          ))}
        </div>
      )}

      {pieza.tipo === "video" && (
        pieza.mediaUrl ? (
          <div className="relative bg-black flex justify-center">
            <video src={pieza.mediaUrl} controls preload="metadata" className="max-w-full max-h-[220px]" />
            <button
              onClick={() => setLightboxOpen(true)}
              className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/60 hover:bg-black/80 flex items-center justify-center text-white text-xs"
              title="Ver en grande"
              aria-label="Ver en grande"
            >
              ⤢
            </button>
          </div>
        ) : (
          <div className="bg-[#0f172a] h-[120px] flex items-center justify-center">
            <span className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-white text-sm">▶</span>
          </div>
        )
      )}

      {pieza.tipo === "imagen" && (
        pieza.mediaUrl ? (
          <button onClick={() => setLightboxOpen(true)} className="block w-full cursor-zoom-in">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pieza.mediaUrl} alt={pieza.titulo} className="w-full max-h-[220px] object-contain bg-[#e8edf4]" />
          </button>
        ) : (
          <div className="bg-[#e8edf4] h-[110px] flex flex-col items-center justify-center gap-1 text-slate-400">
            <span className="text-[22px]">🖼️</span>
            <span className="text-[9.5px] font-medium">Vista previa</span>
          </div>
        )
      )}

      {lightboxOpen && pieza.mediaUrl && (pieza.tipo === "video" || pieza.tipo === "imagen") && (
        <MediaLightbox tipo={pieza.tipo} src={pieza.mediaUrl} titulo={pieza.titulo} onClose={() => setLightboxOpen(false)} />
      )}

      {status === "cambios" && feedback && (
        <div className="px-4.5 py-2.5 bg-[#f0f9ff] border-t border-[#e0f2fe] text-[11px] leading-relaxed text-[#0369a1]">
          <strong>Tu comentario:</strong> &quot;{feedback}&quot;
        </div>
      )}

      {feedbackOpen && (
        <div className="px-4.5 py-3.5 flex flex-col gap-2 border-t border-slate-100">
          <textarea
            value={feedbackText}
            onChange={(e) => onFeedbackChange(e.target.value)}
            placeholder="Describe los cambios que necesitas…"
            rows={3}
            autoFocus
            className="w-full text-xs border border-[#d1dce8] rounded-xl px-3 py-2.5 resize-none outline-none"
          />
          <div className="flex gap-2">
            <button onClick={onCancelar} className="flex-1 text-xs border border-[#d1dce8] rounded-xl py-2.5 text-slate-500">Cancelar</button>
            <button onClick={onEnviarCambios} disabled={!feedbackText.trim()} className="flex-[1.3] text-xs font-semibold text-white bg-[#f59e0b] rounded-xl py-2.5 disabled:opacity-40">Enviar cambios</button>
          </div>
        </div>
      )}

      {mostrarAcciones && (
        <div className="px-4.5 py-3.5 flex gap-2 border-t border-slate-100">
          <button onClick={onPedirCambios} className="flex-1 text-xs border border-[#d1dce8] rounded-xl py-2.5 text-slate-500">Pedir cambios</button>
          <button onClick={onAprobar} className="flex-[1.3] text-xs font-semibold text-white bg-[#10b981] rounded-xl py-2.5 shadow-[0_2px_8px_rgba(16,185,129,0.25)]">
            {pieza.tipo === "guion" ? "Aprobar guion ✓" : "Aprobar ✓"}
          </button>
        </div>
      )}
    </div>
  )
}
