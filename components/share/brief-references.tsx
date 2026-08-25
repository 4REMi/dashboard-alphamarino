"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateBriefScript, updateScriptTitle } from "@/lib/actions/creatives"
import { CopyScriptButton } from "@/components/share/copy-script-button"
import { cn } from "@/lib/utils"
import { Pencil, Check, X } from "lucide-react"
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

const CLIENT_STATUS_STYLE: Record<string, { label: string; className: string }> = {
  pending_review:    { label: "Pendiente de revisión", className: "bg-amber-50 text-amber-700" },
  approved:          { label: "✓ Aprobado por el cliente", className: "bg-emerald-50 text-emerald-700" },
  changes_requested: { label: "Cambios pedidos por el cliente", className: "bg-sky-50 text-sky-700" },
}

interface Props {
  references: Reference[]
  briefId?: string
  projectId?: string | null
  editable?: boolean
}

export function BriefReferences({ references, briefId, projectId, editable = false }: Props) {
  // Independently toggleable, open by default — a designer/editor needs to
  // compare multiple references at once on desktop, not click through an
  // accordion one at a time. Collapsing one just hides that one panel.
  const [closedIds, setClosedIds] = useState<Set<string>>(new Set())
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function toggle(id: string) {
    setClosedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function saveRename(scriptKey: string, title: string) {
    if (!briefId || !projectId) return
    startTransition(async () => {
      await updateScriptTitle(briefId, projectId, scriptKey, title)
      setRenamingId(null)
      router.refresh()
    })
  }

  // Wide desktops have room to compare references side by side instead of
  // scrolling through one long column — grid kicks in only with 2+ refs.
  return (
    <div className={cn(
      "flex flex-col gap-3",
      references.length > 1 && "xl:grid xl:grid-cols-2 xl:items-start"
    )}>
      {references.map((ref) => {
        const isOpen = !closedIds.has(ref.id)
        const isVideo = ref.type === "video"
        const isText = ref.type === "text"

        return (
          <div
            key={ref.id}
            className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-md"
          >
            {/* ── Collapsed header ── */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggle(ref.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(ref.id) } }}
              className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50/60 cursor-pointer"
            >
              {/* Thumbnail */}
              <div className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                {ref.thumbSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ref.thumbSrc}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    {isVideo ? (
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    ) : isText ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
                        <path d="M8 4h6l4 4v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
                        <path d="M9.5 12h5M9.5 15.5h5M9.5 8.5h2" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                      </svg>
                    )}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                {editable && briefId && projectId && renamingId === ref.id ? (
                  <RenameField
                    initial={ref.name}
                    isPending={isPending}
                    onCancel={() => setRenamingId(null)}
                    onSave={(title) => saveRename(ref.id, title)}
                  />
                ) : (
                  <div className="flex items-center gap-1.5 group/name">
                    <p className="text-sm font-semibold text-gray-900 truncate">{ref.name}</p>
                    {editable && briefId && projectId && (isVideo || isText) && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setRenamingId(ref.id) }}
                        className="opacity-0 group-hover/name:opacity-100 flex-shrink-0 text-gray-400 hover:text-gray-600 transition-opacity"
                        title="Renombrar"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                    isVideo ? "bg-indigo-50 text-indigo-600" : isText ? "bg-violet-50 text-violet-600" : "bg-amber-50 text-amber-600"
                  }`}>
                    {isVideo ? "Video" : isText ? "Guión" : "Imagen"}
                  </span>
                  {(isVideo || isText) && ref.script && ref.script.length > 0 && (
                    <span className="text-[10px] text-gray-400">
                      · {ref.script.length} líneas de guión
                    </span>
                  )}
                  {ref.clientStatus && CLIENT_STATUS_STYLE[ref.clientStatus] && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${CLIENT_STATUS_STYLE[ref.clientStatus].className}`}>
                      {CLIENT_STATUS_STYLE[ref.clientStatus].label}
                    </span>
                  )}
                </div>
              </div>

              {/* Chevron */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>

            {/* ── Expanded content ── */}
            {isOpen && (
              <div className="border-t border-gray-100">
                {/* Media */}
                {isVideo && ref.videoSrc ? (
                  <div className="bg-black">
                    <video
                      controls
                      preload="metadata"
                      poster={ref.thumbSrc}
                      className="w-full max-h-[500px] object-contain"
                      style={{ display: "block" }}
                    >
                      <source src={ref.videoSrc} />
                    </video>
                  </div>
                ) : ref.thumbSrc ? (
                  <div className="bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ref.thumbSrc}
                      alt={ref.name}
                      className="w-full max-h-[500px] object-contain"
                    />
                  </div>
                ) : null}

                {/* Client feedback */}
                {ref.clientStatus === "changes_requested" && ref.clientFeedback && (
                  <div className="px-5 py-3 bg-sky-50 border-t border-sky-100">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-600 mb-1">
                      Cambios pedidos por el cliente
                    </p>
                    <p className="text-sm text-sky-900 leading-relaxed">&quot;{ref.clientFeedback}&quot;</p>
                  </div>
                )}

                {/* Script */}
                {(isVideo || isText) && ref.script && ref.script.length > 0 && (
                  editable && briefId ? (
                    <EditableScript
                      briefId={briefId}
                      adId={ref.id}
                      initialLines={ref.script}
                      hadClientFeedback={ref.clientStatus === "changes_requested"}
                    />
                  ) : (
                    <ReadOnlyScript lines={ref.script} />
                  )
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ReadOnlyScript({ lines }: { lines: AdCloneLine[] }) {
  // Scripts with no source to adapt from (Quick Create AI drafts, manual
  // pastes) never populate `original` — showing an empty strikethrough
  // column next to them just wastes space, so collapse to one column.
  const hasOriginal = lines.some((l) => l.original?.trim())

  return (
    <div>
      <div className="px-5 py-3 bg-gray-50/80 border-t border-b border-gray-100 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">
          {hasOriginal ? "Guión tropicalizado" : "Guión"}
        </p>
        <CopyScriptButton lines={lines} brandName={null} />
      </div>
      <div className="divide-y divide-gray-100">
        {lines.map((line, i) => (
          <div key={i} className={cn("grid", hasOriginal && "sm:grid-cols-2")}>
            {hasOriginal && (
              <div className="px-5 py-3.5 sm:border-r border-gray-100">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  {line.speaker && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      {line.speaker}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400 line-through leading-relaxed">
                  {line.original}
                </p>
              </div>
            )}
            <div className="px-5 py-3.5 bg-indigo-50/30">
              {!hasOriginal && (
                <span className="w-5 h-5 rounded-full bg-white/60 text-gray-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mb-1.5">
                  {i + 1}
                </span>
              )}
              <p className="text-sm text-gray-900 font-medium leading-relaxed whitespace-pre-wrap">
                {line.adapted}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EditableScript({ briefId, adId, initialLines, hadClientFeedback }: { briefId: string; adId: string; initialLines: AdCloneLine[]; hadClientFeedback?: boolean }) {
  const router = useRouter()
  const [lines, setLines] = useState<AdCloneLine[]>(initialLines)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  const hasChanges = JSON.stringify(lines) !== JSON.stringify(initialLines)
  const hasOriginal = lines.some((l) => l.original?.trim())

  function updateLine(index: number, adapted: string) {
    setLines((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], adapted }
      return next
    })
    setSaved(false)
  }

  function handleSave() {
    startTransition(async () => {
      await updateBriefScript(briefId, adId, lines)
      setSaved(true)
      // Saving resets this script's client_status back to pending_review —
      // refresh so the status badge above and the rest of the page reflect
      // that immediately instead of still showing the old "cambios pedidos".
      router.refresh()
    })
  }

  return (
    <div>
      <div className="px-5 py-3 bg-gray-50/80 border-t border-b border-gray-100 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">
          {hasOriginal ? "Guión tropicalizado" : "Guión"}
        </p>
        <div className="flex items-center gap-2">
          <CopyScriptButton lines={lines} brandName={null} />
          {saved && !hasChanges && (
            <span className="text-[10px] font-medium text-emerald-600">
              ✓ Guardado{hadClientFeedback ? " — vuelve a pendiente de aprobación del cliente" : ""}
            </span>
          )}
          {hasChanges && (
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Guardando…" : "Guardar cambios"}
            </button>
          )}
        </div>
      </div>
      <div className="divide-y divide-gray-100">
        {lines.map((line, i) => (
          <div key={i} className={cn("grid", hasOriginal && "sm:grid-cols-2")}>
            {hasOriginal && (
              <div className="px-5 py-3.5 sm:border-r border-gray-100">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  {line.speaker && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      {line.speaker}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400 line-through leading-relaxed">
                  {line.original}
                </p>
              </div>
            )}
            <div className="px-5 py-3.5 bg-indigo-50/30">
              {!hasOriginal && (
                <span className="w-5 h-5 rounded-full bg-white/60 text-gray-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mb-1.5">
                  {i + 1}
                </span>
              )}
              <AutoTextarea
                value={line.adapted}
                onChange={(e) => updateLine(i, e.target.value)}
                rows={2}
                className="w-full resize-none bg-transparent border border-transparent hover:border-indigo-200 focus:border-indigo-400 rounded-lg px-2 py-1 text-sm font-medium leading-relaxed text-gray-900 focus:outline-none transition-colors"
              />
            </div>
          </div>
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
