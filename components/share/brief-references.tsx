"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateBriefScript, updateScriptTitle, deleteBriefReference, autoApproveBriefScripts } from "@/lib/actions/creatives"
import { CopyScriptButton } from "@/components/share/copy-script-button"
import { cn } from "@/lib/utils"
import { Pencil, Check, X, Trash2, BadgeCheck, ChevronLeft, ChevronRight } from "lucide-react"
import { AutoTextarea } from "@/components/ui/auto-textarea"
import type { AdCloneLine } from "@/lib/types"

interface Reference {
  id: string
  type: "video" | "image" | "text"
  name: string
  videoSrc?: string
  thumbSrc?: string
  script?: AdCloneLine[]
  clientStatus?: string | null
  clientFeedback?: string | null
}

// Mismo código de color del dashboard: verde aprobado, rojo cambios, ámbar pendiente.
const CLIENT_STATUS_STYLE: Record<string, { label: string; short: string; className: string; dot: string }> = {
  pending_review:    { label: "Pendiente de revisión", short: "Pendiente", className: "bg-amber-50 text-amber-700", dot: "bg-amber-400" },
  approved:          { label: "Aprobado por el cliente", short: "Aprobado", className: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  changes_requested: { label: "Cambios pedidos por el cliente", short: "Cambios pedidos", className: "bg-red-50 text-red-700", dot: "bg-red-500" },
}

interface Props {
  references: Reference[]
  briefId?: string
  projectId?: string | null
  editable?: boolean
}

// Vista maestro-detalle: una lista compacta de referencias (miniatura,
// estado con color, líneas) y UNA referencia en grande — video fijo a la
// izquierda, guion a todo lo ancho a la derecha. Antes: tarjetas de media
// columna con video gigante arriba y el guion en dos columnas angostas
// (~8,800 px de alto con 6 referencias). El original solo aparece en modo
// "Comparar".
export function BriefReferences({ references, briefId, projectId, editable = false }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(references[0]?.id ?? null)
  const [compare, setCompare] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const canEdit = editable && !!briefId && !!projectId

  const idx = Math.max(0, references.findIndex((r) => r.id === selectedId))
  const ref = references[idx]

  function saveRename(scriptKey: string, title: string) {
    if (!briefId || !projectId) return
    startTransition(async () => {
      await updateScriptTitle(briefId, projectId, scriptKey, title)
      setRenamingId(null)
      router.refresh()
    })
  }

  function confirmDelete(referenceKey: string) {
    if (!briefId || !projectId) return
    startTransition(async () => {
      await deleteBriefReference(briefId, projectId, referenceKey)
      setDeletingId(null)
      setSelectedId(references.find((r) => r.id !== referenceKey)?.id ?? null)
      router.refresh()
    })
  }

  function autoApproveAll() {
    if (!briefId || !projectId) return
    startTransition(async () => {
      await autoApproveBriefScripts(briefId, projectId)
      router.refresh()
    })
  }

  const counts = {
    approved: references.filter((r) => r.clientStatus === "approved").length,
    changes: references.filter((r) => r.clientStatus === "changes_requested").length,
    pending: references.filter((r) => r.script?.length && r.clientStatus !== "approved" && r.clientStatus !== "changes_requested").length,
  }

  if (!ref) return null
  const isVideo = ref.type === "video"
  const isText = ref.type === "text"
  const hasScript = (isVideo || isText) && !!ref.script?.length
  const hasOriginal = !!ref.script?.some((l) => l.original?.trim())

  return (
    <div className="space-y-3">
      {/* Resumen + acciones */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 mr-2">Referencias ({references.length})</p>
        {counts.approved > 0 && <StatusPill status="approved" text={`${counts.approved} aprobada${counts.approved === 1 ? "" : "s"}`} />}
        {counts.changes > 0 && <StatusPill status="changes_requested" text={`${counts.changes} con cambios`} />}
        {counts.pending > 0 && <StatusPill status="pending_review" text={`${counts.pending} pendiente${counts.pending === 1 ? "" : "s"}`} />}
        {canEdit && references.some((r) => r.script?.length) && (
          <button type="button" disabled={isPending} onClick={autoApproveAll}
            title="Marca todos los guiones como aprobados sin pasar por el cliente — para proyectos sin enlace de cliente"
            className="ml-auto flex items-center gap-1.5 font-medium px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
            <BadgeCheck className="w-3.5 h-3.5" /> Aprobar automáticamente
          </button>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-4 lg:items-start">
        {/* Lista de referencias (horizontal en móvil) */}
        <nav className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 lg:sticky lg:top-[88px] mb-3 lg:mb-0">
          {references.map((r, i) => {
            const active = r.id === ref.id
            const st = r.clientStatus ? CLIENT_STATUS_STYLE[r.clientStatus] : null
            return (
              <button key={r.id} type="button" onClick={() => { setSelectedId(r.id); setDeletingId(null); setRenamingId(null) }}
                className={cn("flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all flex-shrink-0 w-[220px] lg:w-auto",
                  active ? "bg-white border-gray-900 shadow-sm" : "bg-white/60 border-gray-200 hover:bg-white hover:border-gray-300")}>
                <span className="relative w-10 h-14 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                  {r.thumbSrc
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={r.thumbSrc} alt="" className="w-full h-full object-cover" />
                    : <span className="w-full h-full flex items-center justify-center text-[10px] font-bold text-gray-400">{r.type === "text" ? "TXT" : "IMG"}</span>}
                  {st && <span className={cn("absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full ring-2 ring-white", st.dot)} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] text-gray-400">{i + 1} · {r.type === "video" ? "Video" : r.type === "text" ? "Guion" : "Imagen"}</span>
                  <span className="block text-xs font-semibold text-gray-900 truncate">{r.name}</span>
                  <span className="block text-[10px] text-gray-500 truncate">
                    {r.script?.length ? `${r.script.length} líneas` : "Sin guion"}{st ? ` · ${st.short}` : ""}
                  </span>
                </span>
              </button>
            )
          })}
        </nav>

        {/* Referencia elegida */}
        <article className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)] min-w-0">
          <header className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              {canEdit && renamingId === ref.id ? (
                <RenameField initial={ref.name} isPending={isPending} onCancel={() => setRenamingId(null)} onSave={(t) => saveRename(ref.id, t)} />
              ) : (
                <div className="flex items-center gap-1.5 group/name">
                  <h2 className="text-base font-semibold text-gray-900 truncate">{ref.name}</h2>
                  {canEdit && (isVideo || isText) && (
                    <button type="button" onClick={() => setRenamingId(ref.id)} title="Renombrar"
                      className="opacity-0 group-hover/name:opacity-100 text-gray-400 hover:text-gray-600"><Pencil className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
                <span>{idx + 1} de {references.length}</span>
                {hasScript && <span>· {ref.script!.length} líneas</span>}
                {ref.clientStatus && CLIENT_STATUS_STYLE[ref.clientStatus] && <StatusPill status={ref.clientStatus} />}
              </div>
            </div>
            {hasScript && hasOriginal && (
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5 text-xs">
                <button type="button" onClick={() => setCompare(false)} className={cn("px-2.5 py-1 rounded-md font-medium", !compare ? "bg-white shadow-sm text-gray-900" : "text-gray-500")}>Guion</button>
                <button type="button" onClick={() => setCompare(true)} className={cn("px-2.5 py-1 rounded-md font-medium", compare ? "bg-white shadow-sm text-gray-900" : "text-gray-500")}>Comparar con original</button>
              </div>
            )}
            <div className="flex items-center gap-1">
              <button type="button" disabled={idx === 0} onClick={() => setSelectedId(references[idx - 1].id)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30" title="Anterior"><ChevronLeft className="w-4 h-4" /></button>
              <button type="button" disabled={idx === references.length - 1} onClick={() => setSelectedId(references[idx + 1].id)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30" title="Siguiente"><ChevronRight className="w-4 h-4" /></button>
            </div>
            {canEdit && (deletingId === ref.id ? (
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-gray-500">¿Eliminar?</span>
                <button type="button" disabled={isPending} onClick={() => confirmDelete(ref.id)} className="p-1 rounded text-red-600 hover:bg-red-50"><Check className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => setDeletingId(null)} className="p-1 rounded text-gray-400 hover:bg-gray-100"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <button type="button" onClick={() => setDeletingId(ref.id)} className="p-1.5 text-gray-300 hover:text-red-600" title="Eliminar esta referencia del brief"><Trash2 className="w-3.5 h-3.5" /></button>
            ))}
          </header>

          {ref.clientStatus === "changes_requested" && ref.clientFeedback && (
            <div className="px-5 py-3 bg-red-50 border-b border-red-100">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-red-600 mb-1">Cambios pedidos por el cliente</p>
              <p className="text-sm text-red-900 leading-relaxed whitespace-pre-wrap">&quot;{ref.clientFeedback}&quot;</p>
            </div>
          )}

          <div className={cn(!isText && (ref.videoSrc || ref.thumbSrc) && "md:grid md:grid-cols-[minmax(220px,300px)_1fr]")}>
            {/* Media fija mientras se lee el guion */}
            {!isText && (ref.videoSrc || ref.thumbSrc) && (
              <div className="bg-gray-950 md:border-r border-gray-100">
                <div className="md:sticky md:top-[88px] p-3 flex justify-center">
                  {isVideo && ref.videoSrc ? (
                    <video key={ref.id} controls preload="metadata" poster={ref.thumbSrc} className="w-full max-h-[70vh] rounded-lg object-contain bg-black">
                      <source src={ref.videoSrc} />
                    </video>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ref.thumbSrc} alt={ref.name} className="w-full max-h-[70vh] rounded-lg object-contain" />
                  )}
                </div>
              </div>
            )}

            <div className="min-w-0">
              {hasScript ? (
                canEdit ? (
                  <EditableScript key={ref.id} briefId={briefId!} adId={ref.id} initialLines={ref.script!} hadClientFeedback={ref.clientStatus === "changes_requested"} compare={compare} />
                ) : (
                  <ReadOnlyScript key={ref.id} lines={ref.script!} compare={compare} />
                )
              ) : (
                <p className="px-5 py-10 text-sm text-gray-400 text-center">{isVideo ? "Este video no tiene guion adaptado." : "Referencia visual — sin guion."}</p>
              )}
            </div>
          </div>
        </article>
      </div>
    </div>
  )
}

function StatusPill({ status, text }: { status: string; text?: string }) {
  const st = CLIENT_STATUS_STYLE[status]
  if (!st) return null
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full", st.className)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", st.dot)} />{text ?? st.label}
    </span>
  )
}

// Una línea del guion. Modo normal: número + texto adaptado a todo lo
// ancho. Comparar: original (gris, sin tachar para que se lea) | adaptado.
function ScriptLine({ i, line, compare, children }: { i: number; line: AdCloneLine; compare: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("grid gap-x-5 px-5 py-3", compare ? "md:grid-cols-2" : "grid-cols-[28px_1fr]")}>
      {!compare && <span className="w-6 h-6 mt-0.5 rounded-full bg-gray-100 text-gray-500 text-[11px] font-bold flex items-center justify-center">{i + 1}</span>}
      {compare && (
        <div className="mb-2 md:mb-0">
          <span className="text-[10px] font-bold text-gray-400 mr-1.5">{i + 1}</span>
          {line.speaker && <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mr-1.5">{line.speaker}</span>}
          <span className="text-sm text-gray-500 leading-relaxed">{line.original}</span>
        </div>
      )}
      <div className="min-w-0">
        {!compare && line.speaker && <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">{line.speaker}</p>}
        {children}
      </div>
    </div>
  )
}

function ScriptHeader({ lines, compare, children }: { lines: AdCloneLine[]; compare: boolean; children?: React.ReactNode }) {
  const hasOriginal = lines.some((l) => l.original?.trim())
  const words = lines.reduce((n, l) => n + (l.adapted?.trim().split(/\s+/).filter(Boolean).length ?? 0), 0)
  return (
    <div className="px-5 py-2.5 bg-gray-50/80 border-b border-gray-100 flex items-center gap-3 flex-wrap md:sticky md:top-[73px] z-10">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">
        {compare ? "Original → Tropicalizado" : hasOriginal ? "Guion tropicalizado" : "Guion"}
      </p>
      {/* ~2.5 palabras por segundo hablado */}
      <span className="text-[11px] text-gray-400">{words} palabras · ~{Math.max(1, Math.round(words / 2.5))} s</span>
      <div className="ml-auto flex items-center gap-2">{children}<CopyScriptButton lines={lines} brandName={null} /></div>
    </div>
  )
}

function ReadOnlyScript({ lines, compare }: { lines: AdCloneLine[]; compare: boolean }) {
  return (
    <div>
      <ScriptHeader lines={lines} compare={compare} />
      <div className="divide-y divide-gray-100">
        {lines.map((line, i) => (
          <ScriptLine key={i} i={i} line={line} compare={compare}>
            <p className="text-[15px] text-gray-900 leading-relaxed whitespace-pre-wrap">{line.adapted}</p>
          </ScriptLine>
        ))}
      </div>
    </div>
  )
}

function EditableScript({ briefId, adId, initialLines, hadClientFeedback, compare }: { briefId: string; adId: string; initialLines: AdCloneLine[]; hadClientFeedback?: boolean; compare: boolean }) {
  const router = useRouter()
  const [lines, setLines] = useState<AdCloneLine[]>(initialLines)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const hasChanges = JSON.stringify(lines) !== JSON.stringify(initialLines)

  function updateLine(index: number, adapted: string) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, adapted } : l)))
    setSaved(false)
  }

  function handleSave() {
    startTransition(async () => {
      await updateBriefScript(briefId, adId, lines)
      setSaved(true)
      // Guardar regresa el guion a "pendiente" del cliente — refrescar para verlo.
      router.refresh()
    })
  }

  return (
    <div>
      <ScriptHeader lines={lines} compare={compare}>
        {saved && !hasChanges && <span className="text-[11px] font-medium text-emerald-600">✓ Guardado{hadClientFeedback ? " — vuelve a pendiente del cliente" : ""}</span>}
        {hasChanges && (
          <button type="button" onClick={handleSave} disabled={isPending}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {isPending ? "Guardando…" : "Guardar cambios"}
          </button>
        )}
      </ScriptHeader>
      <div className="divide-y divide-gray-100">
        {lines.map((line, i) => (
          <ScriptLine key={i} i={i} line={line} compare={compare}>
            <AutoTextarea
              value={line.adapted}
              onChange={(e) => updateLine(i, e.target.value)}
              rows={1}
              className="w-full resize-none bg-transparent border border-transparent hover:border-indigo-200 focus:border-indigo-400 rounded-lg -mx-2 px-2 py-0.5 text-[15px] leading-relaxed text-gray-900 focus:outline-none transition-colors"
            />
          </ScriptLine>
        ))}
      </div>
    </div>
  )
}

function RenameField({ initial, isPending, onSave, onCancel }: {
  initial: string
  isPending: boolean
  onSave: (title: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); onSave(value) }
          if (e.key === "Escape") onCancel()
        }}
        className="flex-1 min-w-0 text-sm font-semibold text-gray-900 bg-white border border-indigo-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
      <button
        type="button"
        disabled={isPending}
        onClick={() => onSave(value)}
        className="flex-shrink-0 p-1 rounded text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="flex-shrink-0 p-1 rounded text-gray-400 hover:bg-gray-100"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
