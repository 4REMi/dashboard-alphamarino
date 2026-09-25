"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConceptModal } from "./concept-modal"
import { AssetModal } from "./asset-modal"
import { generateCreativeConcepts, confirmAIDrafts, promoteConcept, demoteConcept, deleteConcept, bulkDeleteConcepts, deleteBrief, deleteAsset, toggleClientVisible, updateBriefTitle, setAssetBrief } from "@/lib/actions/creatives"
import { CONCEPT_STATUS_COLORS, AWARENESS_LABELS, ANGLE_GUIDE, PRODUCTION_STATUS_COLORS, VERDICT_COLORS } from "@/lib/constants/creatives"
import type { CreativeConcept, CreativeAsset, CreativeBrief, BrandLine, AdCloneLine } from "@/lib/types"
import type { AIDraftConcept } from "@/lib/actions/creatives"
import type { AssetMetaLinkStatus } from "@/lib/actions/paid-media-performance"
import { BriefCreator } from "./brief-creator"
import { AssetCopyBank } from "./asset-copy-bank"
import { QuickScriptModal } from "./quick-script-modal"
import { Plus, Sparkles, Check, X, Loader2, Star, ArrowUpRight, Pencil, Trash2, Link2, FileText, Upload, ChevronDown, Film, ImageIcon, Eye, EyeOff, MessageSquare, Clock, Radio, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

function fmt$(v: number) {
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
}

// Rollup a nivel concepto — no todo asset tiene por qué estar corriendo
// (la mayoría son candidatos para revisión del cliente), así que esto
// solo suma los que SÍ tienen link real a un ad de Meta.
function conceptLiveRollup(conceptAssetIds: string[], assetLinkStatus: Record<string, AssetMetaLinkStatus>) {
  let anyActive = false
  let totalSpend = 0
  for (const id of conceptAssetIds) {
    const s = assetLinkStatus[id]
    if (!s) continue
    anyActive = anyActive || s.anyActive
    totalSpend += s.totalSpend
  }
  return { anyActive, totalSpend }
}

// One entry per script inside a brief's adapted_script — mirrors the
// normalization used on the client portal, so admin and client agree on
// what counts as "a script" and what its status/feedback is.
interface ScriptReviewEntry {
  key: string
  label: string
  status: "pending_review" | "approved" | "changes_requested"
  feedback: string | null
}

function scriptReviewEntries(brief: CreativeBrief): ScriptReviewEntry[] {
  const raw = brief.adapted_script as Record<string, AdCloneLine[]> | AdCloneLine[] | null
  if (!raw) return []
  const reviews = brief.script_reviews ?? {}
  const titles = brief.script_titles ?? {}
  if (Array.isArray(raw)) {
    if (!raw.length) return []
    const r = reviews["_single"]
    return [{ key: "_single", label: titles["_single"] || "Guión", status: r?.client_status ?? "pending_review", feedback: r?.client_feedback ?? null }]
  }
  return Object.entries(raw)
    .filter(([, lines]) => lines?.length)
    .map(([key, ], i) => {
      const r = reviews[key]
      const label = titles[key] || `Guión ${Object.keys(raw).length > 1 ? `#${i + 1}` : ""}`.trim()
      return { key, label, status: r?.client_status ?? "pending_review", feedback: r?.client_feedback ?? null }
    })
}

const SCRIPT_STATUS_STYLE: Record<ScriptReviewEntry["status"], { label: string; className: string }> = {
  pending_review:    { label: "Pendiente",       className: "bg-amber-50 text-amber-700 border-amber-200" },
  approved:          { label: "Aprobado",        className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  changes_requested: { label: "Cambios pedidos", className: "bg-sky-50 text-sky-700 border-sky-200" },
}

function BriefScriptStatus({ brief }: { brief: CreativeBrief }) {
  const entries = scriptReviewEntries(brief)
  if (entries.length === 0) return null
  const changes = entries.filter((e) => e.status === "changes_requested")

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex flex-wrap gap-1">
        {entries.map((e) => (
          <span key={e.key} className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border", SCRIPT_STATUS_STYLE[e.status].className)}>
            {e.label} · {SCRIPT_STATUS_STYLE[e.status].label}
          </span>
        ))}
      </div>
      {changes.length > 0 && (
        <div className="space-y-1">
          {changes.filter((e) => e.feedback).map((e) => (
            <div key={e.key} className="text-[11px] text-sky-800 bg-sky-50/70 border border-sky-100 rounded-lg px-2.5 py-1.5">
              <span className="font-semibold">{e.label}:</span> &quot;{e.feedback}&quot;
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const FUNNEL_COLORS: Record<string, string> = {
  TOF: "bg-sky-100 text-sky-700",
  MOF: "bg-violet-100 text-violet-700",
  BOF: "bg-emerald-100 text-emerald-700",
}

interface ConceptsTableProps {
  concepts: CreativeConcept[]
  assets: CreativeAsset[]
  briefs?: CreativeBrief[]
  projectId: string
  cycleId: string | null
  isAdminOrSubadmin: boolean
  canManageAssets?: boolean
  // Promover/degradar a Evergreen NO es una edición de contenido del
  // ciclo — es un estado del concepto en sí, y el backend
  // (promoteConcept/demoteConcept) nunca lo restringió a ciclo activo.
  // Separado de isAdminOrSubadmin (que aquí llega mezclado con "¿es el
  // ciclo activo?" vía canEdit en creatives-hub.tsx) para poder marcar
  // Evergreen un concepto de un ciclo ya cerrado.
  canManageConceptStatus: boolean
  onRefresh: () => void
  // Actualiza un asset en el state local del padre sin volver a pedir
  // concepts+assets+briefs completos — publicar/ocultar un asset para el
  // cliente es la acción más frecuente de esta pantalla y no cambia la
  // lista de conceptos ni de briefs, así que no necesita ese refetch de 3
  // queries (antes se sentía como recargar la página entera).
  onUpdateAsset: (assetId: string, patch: Partial<CreativeAsset>) => void
  // Vista inversa del link a Meta — qué assets están corriendo de verdad
  // como ad activo, y cuánto llevan gastado este ciclo. Ver
  // lib/actions/paid-media-performance.ts:getAssetMetaLinkStatus.
  assetLinkStatus: Record<string, AssetMetaLinkStatus>
  brandBrains?: any[]
  brandLines?: BrandLine[]
  projectBrandBrainId?: string
}

// ── Assets: piezas con versiones y estado escrito ───────────────────────────

const ASSET_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/`

function assetThumbUrl(a: CreativeAsset): string | null {
  if (a.thumbnail_path) return ASSET_BASE + a.thumbnail_path
  if (a.file_path) return ASSET_BASE + a.file_path
  return a.asset_url
}

function assetFileUrl(a: CreativeAsset): string | null {
  return a.file_path ? ASSET_BASE + a.file_path : a.asset_url
}

// Una pieza = la versión vigente + las anteriores (encadenadas con
// revises_asset_id). Así una revisión no aparece como un asset más.
interface AssetPiece { current: CreativeAsset; versions: CreativeAsset[] }

function buildPieces(assets: CreativeAsset[]): AssetPiece[] {
  const byId = new Map(assets.map((a) => [a.id, a]))
  const superseded = new Set(assets.map((a) => a.revises_asset_id).filter((id): id is string => !!id))
  return assets
    .filter((a) => !superseded.has(a.id))
    .map((head) => {
      const versions = [head]
      let cur = head
      while (cur.revises_asset_id && byId.has(cur.revises_asset_id)) {
        cur = byId.get(cur.revises_asset_id)!
        versions.unshift(cur)
      }
      return { current: head, versions }
    })
}

// Estado escrito — antes eran ojitos de colores sin explicación.
function assetStatus(a: CreativeAsset): { label: string; detail: string } {
  if (!a.client_visible) return { label: "Borrador", detail: "Solo el equipo lo ve." }
  if (a.client_status === "approved") return { label: "Aprobado", detail: "El cliente lo aprobó." }
  if (a.client_status === "changes_requested") return { label: "Cambios pedidos", detail: "El cliente pidió cambios." }
  return { label: "En revisión del cliente", detail: "El cliente lo ve y aún no responde." }
}

function AssetPieceCard({ piece, live, canManage, onOpen, onNewVersion }: {
  piece: AssetPiece
  live: AssetMetaLinkStatus | undefined
  canManage: boolean
  onOpen: () => void
  onNewVersion: () => void
}) {
  const a = piece.current
  const thumb = assetThumbUrl(a)
  const status = assetStatus(a)
  const needsChanges = a.client_visible && a.client_status === "changes_requested"
  return (
    <div className="rounded-xl border overflow-hidden bg-card flex flex-col">
      <button type="button" onClick={onOpen} className="relative aspect-[4/5] bg-muted/50 flex items-center justify-center group">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-6 h-6 text-muted-foreground/40" />
        )}
        {a.file_type === "video" && (
          <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 text-[10px] font-medium bg-black/60 text-white px-1.5 py-0.5 rounded">
            <Film className="w-3 h-3" /> Video
          </span>
        )}
        {piece.versions.length > 1 && (
          <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold bg-black/60 text-white px-1.5 py-0.5 rounded">
            v{piece.versions.length}
          </span>
        )}
        {live?.anyActive && (
          <span className="absolute top-1.5 right-1.5 text-[10px] font-semibold bg-black/60 text-white px-1.5 py-0.5 rounded" title="Corriendo en Meta este ciclo">
            En Meta · {fmt$(live.totalSpend)}
          </span>
        )}
        <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
      </button>
      <div className="p-2.5 space-y-1.5 flex-1 flex flex-col">
        <div>
          <p className="text-xs font-medium">{status.label}</p>
          <p className="text-[11px] text-muted-foreground">{status.detail}</p>
        </div>
        {needsChanges && a.client_feedback && (
          <p className="text-[11px] bg-muted/40 border-l-2 border-foreground/30 rounded-r px-2 py-1 line-clamp-3">“{a.client_feedback}”</p>
        )}
        {canManage && (
          <button
            type="button"
            onClick={onNewVersion}
            className={cn(
              "mt-auto text-[11px] font-medium text-left",
              needsChanges ? "text-primary hover:underline" : "text-muted-foreground hover:text-foreground"
            )}
          >
            + Subir nueva versión
          </button>
        )}
      </div>
    </div>
  )
}

// ── Concept detail modal (read-only) ─────────────────────────────────────────

function ConceptDetailModal({
  concept,
  conceptAssets,
  conceptBriefs,
  projectId,
  cycleId,
  isAdminOrSubadmin,
  canManageAssets,
  canManageConceptStatus,
  onEdit,
  onClose,
  onNewAsset,
  onNewBrief,
  onQuickScript,
  onAddScriptToBrief,
  onRefresh,
  onUpdateAsset,
  assetLinkStatus,
}: {
  concept: CreativeConcept
  conceptAssets: CreativeAsset[]
  conceptBriefs: CreativeBrief[]
  projectId: string
  cycleId: string | null
  isAdminOrSubadmin: boolean
  canManageAssets: boolean
  canManageConceptStatus: boolean
  onEdit: () => void
  onClose: () => void
  onNewAsset: (opts?: { briefId?: string | null; revisesAssetId?: string }) => void
  onNewBrief: () => void
  onQuickScript: () => void
  onAddScriptToBrief: (brief: CreativeBrief) => void
  onRefresh: () => void
  onUpdateAsset: (assetId: string, patch: Partial<CreativeAsset>) => void
  assetLinkStatus: Record<string, AssetMetaLinkStatus>
}) {
  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState<"id" | "angle" | "mech">("id")
  const [lightboxAsset, setLightboxAsset] = useState<CreativeAsset | null>(null)
  const [lightboxVideoError, setLightboxVideoError] = useState(false)
  const [editingBriefId, setEditingBriefId] = useState<string | null>(null)
  const [briefTitleDraft, setBriefTitleDraft] = useState("")
  const angleEntry  = ANGLE_GUIDE.find((a) => a.name === concept.angle_type)
  const isEvergreen = concept.status === "Evergreen"
  const liveRollup  = conceptLiveRollup(conceptAssets.map((a) => a.id), assetLinkStatus)
  const archivedButLive = concept.status === "Archived" && liveRollup.anyActive

  function handlePromote() {
    startTransition(async () => {
      await promoteConcept(concept.id, projectId)
      onRefresh()
      onClose()
    })
  }

  function handleDemote() {
    startTransition(async () => {
      await demoteConcept(concept.id, projectId, cycleId ?? undefined)
      onRefresh()
      onClose()
    })
  }

  function handleDelete() {
    if (!confirm("¿Eliminar este concepto?")) return
    startTransition(async () => {
      await deleteConcept(concept.id, projectId)
      onRefresh()
      onClose()
    })
  }

  const grpLabel = "text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-3"
  const fLabel   = "text-[11px] font-medium text-muted-foreground/80 mb-0.5"
  const fValue   = "text-sm leading-snug"
  const fEmpty   = "text-sm text-muted-foreground/30 italic"

  function F({ label, value }: { label: string; value?: string | number | null }) {
    return (
      <div>
        <p className={fLabel}>{label}</p>
        {value ? <p className={fValue}>{value}</p> : <p className={fEmpty}>—</p>}
      </div>
    )
  }

  const pieces = buildPieces(conceptAssets)
  const briefGroups = [
    ...conceptBriefs.map((b) => ({
      key: b.id,
      title: b.title || b.brand_brain?.name || "Brief",
      pieces: pieces.filter((p) => p.current.brief_id === b.id),
    })),
    {
      key: "_none",
      title: "Sin brief asignado",
      pieces: pieces.filter((p) => !p.current.brief_id || !conceptBriefs.some((b) => b.id === p.current.brief_id)),
    },
  ].filter((g) => g.pieces.length > 0 || g.key !== "_none")
  const unpublished = pieces.filter((p) => !p.current.client_visible)

  function publishAll() {
    for (const p of unpublished) onUpdateAsset(p.current.id, { client_visible: true, client_status: "pending_review", client_feedback: null })
    startTransition(async () => {
      await Promise.all(unpublished.map((p) => toggleClientVisible(p.current.id, projectId, true)))
    })
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <DialogHeader className="pb-0 flex-shrink-0">
          <div className="space-y-1 min-w-0">
            <DialogTitle className="text-xl leading-tight">
              {concept.name || "Concepto"}
            </DialogTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={cn("text-xs border-0", CONCEPT_STATUS_COLORS[concept.status])}>
                {concept.status}
              </Badge>
              {angleEntry && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <span className="text-base">{angleEntry.emoji}</span>
                  {concept.angle_type}
                </span>
              )}
              {concept.funnel_stage && (
                <Badge className={cn("text-xs border-0", FUNNEL_COLORS[concept.funnel_stage] ?? "bg-gray-100 text-gray-600")}>
                  {concept.funnel_stage}
                </Badge>
              )}
              {concept.awareness_stage && (
                <span className="text-xs text-muted-foreground">
                  Stage {concept.awareness_stage} · {AWARENESS_LABELS[concept.awareness_stage]}
                </span>
              )}
            </div>
          </div>
        </DialogHeader>

        {archivedButLive && (
          <div className="flex-shrink-0 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 flex items-center gap-2 font-medium">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            Este concepto está archivado, pero sigue corriendo en Meta — {fmt$(liveRollup.totalSpend)} gastados este ciclo.
          </div>
        )}

        {/* ── Body: ficha a la izquierda, assets (el centro del modal) a la derecha ── */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
          <div className="min-h-0 overflow-y-auto space-y-4 pr-1">
            {concept.parent && (
              <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 flex items-center gap-2">
                <ArrowUpRight className="w-3.5 h-3.5 flex-shrink-0" />
                Evolución de: <span className="font-medium">{concept.parent.angle_type ?? "concepto anterior"}</span>
              </div>
            )}

            {/* Ficha del concepto */}
            <div className="border rounded-xl overflow-hidden">
              <div className="flex border-b bg-muted/30">
                {([
                  { key: "id" as const, label: "Identificación" },
                  { key: "angle" as const, label: "Ángulo" },
                  { key: "mech" as const, label: "Mecanismo" },
                ]).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      "flex-1 px-2 py-2 text-[11px] font-semibold uppercase tracking-wide transition-colors relative",
                      activeTab === tab.key ? "text-foreground bg-background" : "text-muted-foreground hover:text-foreground/70"
                    )}
                  >
                    {tab.label}
                    {activeTab === tab.key && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
                  </button>
                ))}
              </div>
              <div className="px-4 py-4">
                {activeTab === "id" && (
                  <div className="space-y-4">
                    <F label="Principio organizador" value={concept.organizing_principle} />
                    <div>
                      <p className={fLabel}>Persona objetivo</p>
                      {concept.target_persona ? <p className="text-sm leading-snug">{concept.target_persona}</p> : <p className={fEmpty}>—</p>}
                    </div>
                    <F label="Awareness Stage" value={concept.awareness_stage ? `${concept.awareness_stage} — ${AWARENESS_LABELS[concept.awareness_stage]}` : null} />
                  </div>
                )}
                {activeTab === "angle" && (
                  <div className="space-y-3">
                    {angleEntry ? (
                      <>
                        <div className="flex items-center gap-3">
                          <span className="text-3xl leading-none">{angleEntry.emoji}</span>
                          <div>
                            <p className="text-sm font-semibold">{concept.angle_type}</p>
                            <p className="text-xs text-muted-foreground italic leading-snug">{angleEntry.guiding_question}</p>
                          </div>
                        </div>
                        {angleEntry.mechanism && <p className="text-sm text-muted-foreground leading-relaxed">{angleEntry.mechanism}</p>}
                      </>
                    ) : (
                      <p className={fEmpty}>Sin ángulo asignado</p>
                    )}
                  </div>
                )}
                {activeTab === "mech" && (
                  <div className="space-y-0 divide-y divide-border">
                    {[
                      { label: "¿Por qué va a funcionar?", value: concept.why_it_works },
                      { label: "Pain Point específico",    value: concept.pain_point },
                      { label: "Objeción que derrumba",    value: concept.objection },
                      { label: "Transformación prometida", value: concept.transformation },
                    ].map(({ label, value }) => (
                      <div key={label} className="py-3 first:pt-0 last:pb-0">
                        <p className={fLabel}>{label}</p>
                        {value ? <p className="text-sm leading-relaxed">{value}</p> : <p className={fEmpty}>—</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Briefs */}
            {(conceptBriefs.length > 0 || isAdminOrSubadmin) && (
              <div className="border rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className={grpLabel + " mb-0"}>
                    <FileText className="w-3 h-3 inline mr-1" />
                    Briefs {conceptBriefs.length > 0 && `(${conceptBriefs.length})`}
                  </p>
                  {isAdminOrSubadmin && (
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={onQuickScript} className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 transition-colors">
                        <Sparkles className="w-3 h-3" />
                        Guión
                      </button>
                      <button type="button" onClick={onNewBrief} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                        <Plus className="w-3 h-3" />
                        Brief
                      </button>
                    </div>
                  )}
                </div>
                {conceptBriefs.length > 0 ? (
                  <div className="space-y-1.5">
                    {conceptBriefs.map((b) => (
                      <div key={b.id} className="text-xs py-2 px-3 rounded-lg bg-muted/30 border group">
                        {editingBriefId === b.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              autoFocus
                              value={briefTitleDraft}
                              onChange={(e) => setBriefTitleDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  startTransition(async () => {
                                    await updateBriefTitle(b.id, projectId, briefTitleDraft)
                                    setEditingBriefId(null)
                                    onRefresh()
                                  })
                                }
                                if (e.key === "Escape") setEditingBriefId(null)
                              }}
                              placeholder="Ej. Escasez — Black Friday"
                              className="flex-1 min-w-0 text-xs bg-background border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                            <button type="button" className="p-1 rounded text-muted-foreground hover:text-foreground" onClick={() => setEditingBriefId(null)}>
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <a href={`/share/brief/${b.share_token}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-80">
                              <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="font-medium truncate">{b.title || b.brand_brain?.name || "Brief"}</span>
                              <span className="text-muted-foreground text-[10px] flex-shrink-0">Abrir ↗</span>
                            </a>
                            {isAdminOrSubadmin && (
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                                <button type="button" title="Agregar guión a este brief" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted" onClick={() => onAddScriptToBrief(b)}>
                                  <Plus className="w-3 h-3" />
                                </button>
                                <button type="button" title="Renombrar" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted" onClick={() => { setBriefTitleDraft(b.title ?? ""); setEditingBriefId(b.id) }}>
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  title="Eliminar brief"
                                  className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => {
                                    if (!confirm("¿Eliminar este brief?")) return
                                    startTransition(async () => { await deleteBrief(b.id, projectId); onRefresh() })
                                  }}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        <BriefScriptStatus brief={b} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={fEmpty}>Sin briefs — crea uno para compartir con tu editor</p>
                )}
              </div>
            )}

            {(concept.ref_links || (isAdminOrSubadmin && concept.insight)) && (
              <div className="border rounded-xl px-4 py-3 space-y-3">
                {concept.ref_links && <F label="Referencias / Inspiración" value={concept.ref_links} />}
                {isAdminOrSubadmin && concept.insight && (
                  <div>
                    <div className="flex items-center gap-1 mb-0.5">
                      <Star className="w-3 h-3 text-amber-500" />
                      <p className={fLabel}>Insight estratégico</p>
                    </div>
                    <p className={fValue}>{concept.insight}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Assets ── */}
          <div className="min-h-0 overflow-y-auto border rounded-xl">
            <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-semibold">Assets</p>
                <p className="text-[11px] text-muted-foreground">
                  {pieces.length} pieza{pieces.length !== 1 ? "s" : ""}
                  {unpublished.length > 0 && ` · ${unpublished.length} sin publicar`}
                  {liveRollup.anyActive && ` · ${fmt$(liveRollup.totalSpend)} en Meta este ciclo`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isAdminOrSubadmin && unpublished.length > 0 && (
                  <Button type="button" variant="outline" size="sm" onClick={publishAll} disabled={isPending}>
                    <Eye className="w-3.5 h-3.5 mr-1.5" />
                    Mostrar todos al cliente
                  </Button>
                )}
                {canManageAssets && (
                  <Button type="button" size="sm" onClick={() => onNewAsset()}>
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Subir asset
                  </Button>
                )}
              </div>
            </div>

            <div className="p-4 space-y-6">
              {briefGroups.length === 0 && <p className={fEmpty}>Crea un brief primero — cada asset sale de uno.</p>}
              {briefGroups.map((g) => (
                <div key={g.key}>
                  <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    {g.key === "_none" ? g.title : `Brief: ${g.title}`}
                    <span className="font-normal text-muted-foreground">· {g.pieces.length} pieza{g.pieces.length !== 1 ? "s" : ""}</span>
                  </p>
                  {g.key === "_none" && (
                    <p className="text-[11px] text-muted-foreground mb-2">Subidos antes de que se guardara el brief. Ábrelos para asignarles uno.</p>
                  )}
                  {g.pieces.length === 0 ? (
                    <p className="text-xs text-muted-foreground/60 italic">Sin assets de este brief todavía.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                      {g.pieces.map((p) => (
                        <AssetPieceCard
                          key={p.current.id}
                          piece={p}
                          live={assetLinkStatus[p.current.id]}
                          canManage={canManageAssets}
                          onOpen={() => { setLightboxVideoError(false); setLightboxAsset(p.current) }}
                          onNewVersion={() => onNewAsset({ briefId: p.current.brief_id, revisesAssetId: p.current.id })}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Visor del asset — pantalla dividida: info y copies a la izquierda, media a la derecha ── */}
        {lightboxAsset && (() => {
          const a = lightboxAsset
          const piece = pieces.find((p) => p.versions.some((v) => v.id === a.id))
          const versionIdx = piece ? piece.versions.findIndex((v) => v.id === a.id) : 0
          const fileUrl = assetFileUrl(a)
          const status = assetStatus(a)
          return (
            <Dialog open onOpenChange={() => setLightboxAsset(null)}>
              <DialogContent className="max-w-6xl h-[88vh] p-0 overflow-hidden">
                <div className="h-full grid grid-cols-1 md:grid-cols-[400px_1fr] min-h-0">
                  <div className="min-h-0 overflow-y-auto border-r bg-background">
                    <div className="px-5 pt-5 pb-4 border-b space-y-1">
                      <DialogTitle className="text-base">{a.format || (a.file_type === "video" ? "Video" : "Imagen")}{a.platform ? ` · ${a.platform}` : ""}</DialogTitle>
                      {piece && piece.versions.length > 1 && (
                        <p className="text-xs text-muted-foreground">Versión {versionIdx + 1} de {piece.versions.length}{versionIdx === piece.versions.length - 1 ? " (vigente)" : ""}</p>
                      )}
                    </div>

                    <div className="px-5 py-4 border-b space-y-3">
                      {isAdminOrSubadmin ? (
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={a.client_visible}
                            disabled={isPending}
                            onClick={() => {
                              const nextVisible = !a.client_visible
                              const patch = { client_visible: nextVisible, client_status: nextVisible ? "pending_review" as const : null, client_feedback: null }
                              setLightboxAsset((prev) => prev ? { ...prev, ...patch } : prev)
                              onUpdateAsset(a.id, patch)
                              startTransition(async () => { await toggleClientVisible(a.id, projectId, nextVisible) })
                            }}
                            className={cn(
                              "relative mt-0.5 h-5 w-9 flex-shrink-0 rounded-full transition-colors disabled:opacity-50",
                              a.client_visible ? "bg-primary" : "bg-muted-foreground/30"
                            )}
                          >
                            <span className={cn("absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", a.client_visible && "translate-x-4")} />
                          </button>
                          <div>
                            <p className="text-sm font-medium">Visible para el cliente: {a.client_visible ? "Sí" : "No"}</p>
                            <p className="text-xs text-muted-foreground">
                              {a.client_visible
                                ? "El cliente lo ve en su panel y puede aprobarlo o pedir cambios."
                                : "Solo el equipo lo ve. Actívalo cuando esté listo para que el cliente lo revise."}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm">Visible para el cliente: {a.client_visible ? "Sí" : "No"}</p>
                      )}

                      <div>
                        <p className="text-xs font-medium">Estado: {status.label}</p>
                        <p className="text-xs text-muted-foreground">{status.detail}</p>
                      </div>
                      {a.client_status === "changes_requested" && a.client_feedback && (
                        <blockquote className="text-xs bg-muted/40 border-l-2 border-foreground/30 rounded-r px-3 py-2">
                          <span className="block text-[10px] font-semibold text-muted-foreground mb-0.5">Lo que pidió el cliente</span>
                          {a.client_feedback}
                        </blockquote>
                      )}

                      {canManageAssets && conceptBriefs.length > 0 && (
                        <label className="block text-xs">
                          <span className="text-muted-foreground">Brief del que sale</span>
                          <select
                            value={a.brief_id ?? ""}
                            onChange={(e) => {
                              const briefId = e.target.value || null
                              setLightboxAsset((prev) => prev ? { ...prev, brief_id: briefId } : prev)
                              onUpdateAsset(a.id, { brief_id: briefId })
                              startTransition(async () => { await setAssetBrief(a.id, projectId, briefId) })
                            }}
                            className="mt-0.5 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
                          >
                            <option value="">Sin brief asignado</option>
                            {conceptBriefs.map((b) => <option key={b.id} value={b.id}>{b.title || b.brand_brain?.name || "Brief"}</option>)}
                          </select>
                        </label>
                      )}
                    </div>

                    {piece && piece.versions.length > 1 && (
                      <div className="px-5 py-4 border-b">
                        <p className="text-xs font-semibold mb-2">Versiones</p>
                        <div className="space-y-1">
                          {[...piece.versions].reverse().map((v) => {
                            const n = piece.versions.indexOf(v) + 1
                            return (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => { setLightboxVideoError(false); setLightboxAsset(v) }}
                                className={cn("w-full text-left text-xs px-2.5 py-1.5 rounded-md hover:bg-muted", v.id === a.id && "bg-muted font-medium")}
                              >
                                v{n}{n === piece.versions.length ? " · vigente" : ""} — {assetStatus(v).label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <AssetCopyBank key={a.id} assetId={a.id} projectId={projectId} hasConcept={!!a.concept_id} canManage={canManageAssets} embedded />

                    {canManageAssets && (
                      <div className="px-5 py-4 border-t flex items-center justify-between gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => { setLightboxAsset(null); onNewAsset({ briefId: a.brief_id, revisesAssetId: piece?.current.id ?? a.id }) }}>
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Subir nueva versión
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (!confirm("¿Eliminar este asset?")) return
                            startTransition(async () => { await deleteAsset(a.id, projectId); onRefresh(); setLightboxAsset(null) })
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          Eliminar
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="bg-black flex items-center justify-center min-h-[300px] overflow-hidden">
                    {a.file_type === "video" && fileUrl ? (
                      lightboxVideoError ? (
                        <p className="text-white/70 text-sm py-16 px-6 text-center">Este video ya no se puede reproducir — probablemente venció el enlace original.</p>
                      ) : (
                        <video key={a.id} controls autoPlay className="max-w-full max-h-full" onError={() => setLightboxVideoError(true)}>
                          <source src={fileUrl} />
                        </video>
                      )
                    ) : fileUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fileUrl} alt="" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <div className="text-white/40 text-sm py-20">Sin archivo</div>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )
        })()}

        {/* ── Footer ── */}
        <DialogFooter className="flex-shrink-0 flex items-center justify-between pt-2 gap-2">
          <div className="flex gap-2">
            {canManageConceptStatus && isEvergreen && (
              <Button type="button" variant="outline" size="sm" onClick={handleDemote} disabled={isPending} className="text-amber-600 border-amber-200 hover:bg-amber-50">
                <Star className="w-3.5 h-3.5 mr-1" />
                Degradar a Activo
              </Button>
            )}
            {canManageConceptStatus && !isEvergreen && (
              <Button type="button" variant="outline" size="sm" onClick={handlePromote} disabled={isPending}>
                <Star className="w-3.5 h-3.5 mr-1 text-amber-500" />
                Evergreen
              </Button>
            )}
            {isAdminOrSubadmin && (
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleDelete} disabled={isPending}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cerrar</Button>
            {isAdminOrSubadmin && (
              <Button size="sm" onClick={onEdit} disabled={isPending}>
                <Pencil className="w-3.5 h-3.5 mr-1" />
                Editar
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Draft preview modal ──────────────────────────────────────────────────────

function DraftPreviewModal({
  draft,
  onConfirm,
  onDiscard,
  isPending,
}: {
  draft: AIDraftConcept
  onConfirm: () => void
  onDiscard: () => void
  isPending: boolean
}) {
  const angleEntry = ANGLE_GUIDE.find((a) => a.name === draft.angle_type)
  const sectionLabel = "text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2"
  const fieldLabel   = "text-[11px] font-medium text-muted-foreground"
  const fieldValue   = "text-sm mt-0.5 leading-snug"
  const fieldEmpty   = "text-sm mt-0.5 text-muted-foreground/40 italic"

  function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
    return (
      <div>
        <p className={fieldLabel}>{label}</p>
        {value ? <p className={fieldValue}>{value}</p> : <p className={fieldEmpty}>—</p>}
      </div>
    )
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onDiscard() }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            {draft.name || "Borrador IA"}
            <Badge className="text-xs bg-purple-100 text-purple-700 border-0 ml-1">AI Draft</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-5">
            <div>
              <p className={sectionLabel}>Identificación</p>
              <div className="space-y-3">
                <Field label="Principio organizador" value={draft.organizing_principle} />
                <Field label="Persona objetivo" value={draft.target_persona} />
              </div>
            </div>
            <div>
              <p className={sectionLabel}>Teoría del Ángulo</p>
              <div className="space-y-3">
                <div>
                  <p className={fieldLabel}>Ángulo</p>
                  <p className={fieldValue}>
                    {angleEntry ? `${angleEntry.emoji} ${draft.angle_type}` : draft.angle_type || "—"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className={fieldLabel}>Awareness Stage</p>
                    <p className={draft.awareness_stage ? fieldValue : fieldEmpty}>
                      {draft.awareness_stage
                        ? `${draft.awareness_stage} — ${AWARENESS_LABELS[draft.awareness_stage] ?? ""}`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className={fieldLabel}>Funnel Stage</p>
                    {draft.funnel_stage
                      ? <Badge className={cn("text-xs border-0 mt-0.5", FUNNEL_COLORS[draft.funnel_stage] ?? "bg-gray-100 text-gray-600")}>{draft.funnel_stage}</Badge>
                      : <p className={fieldEmpty}>—</p>
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <p className={sectionLabel}>Mecanismo</p>
              <div className="space-y-4">
                <Field label="¿Por qué va a funcionar este ángulo?" value={draft.why_it_works} />
                <Field label="Pain Point específico" value={draft.pain_point} />
                <Field label="Objeción que derrumba" value={draft.objection} />
                <Field label="Transformación prometida" value={draft.transformation} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between pt-4 mt-2 border-t gap-2">
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onDiscard} disabled={isPending}>
            <X className="w-3.5 h-3.5 mr-1" />
            Descartar
          </Button>
          <Button size="sm" className="bg-purple-600 hover:bg-purple-700" onClick={onConfirm} disabled={isPending}>
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Check className="w-3.5 h-3.5 mr-1" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── AI draft rows ────────────────────────────────────────────────────────────

function AIDraftRows({
  drafts,
  onPreview,
  onConfirm,
  onDiscard,
  onDiscardAll,
  onConfirmAll,
  isConfirming,
}: {
  drafts: AIDraftConcept[]
  onPreview: (idx: number) => void
  onConfirm: (idx: number) => void
  onDiscard: (idx: number) => void
  onDiscardAll: () => void
  onConfirmAll: () => void
  isConfirming: boolean
}) {
  if (!drafts.length) return null
  return (
    <>
      <tr>
        <td colSpan={7} className="px-4 py-2 bg-purple-50 border-t border-purple-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-700 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              {drafts.length} borrador{drafts.length !== 1 ? "es" : ""} generados por IA — revisa y confirma los que quieras guardar
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="text-xs h-7 text-destructive" onClick={onDiscardAll} disabled={isConfirming}>
                Descartar todos
              </Button>
              <Button size="sm" className="text-xs h-7 bg-purple-600 hover:bg-purple-700" onClick={onConfirmAll} disabled={isConfirming}>
                {isConfirming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                Confirmar todos
              </Button>
            </div>
          </div>
        </td>
      </tr>
      {drafts.map((draft, idx) => {
        const angleEntry = ANGLE_GUIDE.find((a) => a.name === draft.angle_type)
        return (
          <tr
            key={idx}
            className="border-t bg-purple-50/40 hover:bg-purple-50/70 transition-colors cursor-pointer"
            onClick={() => onPreview(idx)}
          >
            <td className="px-3 py-3">
              <Badge className="text-xs bg-purple-100 text-purple-700 border-0">AI</Badge>
            </td>
            <td className="px-3 py-3">
              <div className="text-sm font-medium">{draft.name || "—"}</div>
            </td>
            <td className="px-3 py-3">
              <div className="text-xs line-clamp-2">{draft.target_persona}</div>
            </td>
            <td className="px-3 py-3">
              <span className="text-xs">{angleEntry ? `${angleEntry.emoji} ${draft.angle_type}` : draft.angle_type || "—"}</span>
            </td>
            <td className="px-3 py-3">
              {draft.funnel_stage ? (
                <Badge className={cn("text-xs border-0 h-5 px-1.5", FUNNEL_COLORS[draft.funnel_stage] ?? "bg-gray-100 text-gray-600")}>
                  {draft.funnel_stage}
                </Badge>
              ) : <span className="text-xs text-muted-foreground">—</span>}
            </td>
            <td className="px-3 py-3">
              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDiscard(idx)} disabled={isConfirming} title="Descartar">
                  <X className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-700" onClick={() => onConfirm(idx)} disabled={isConfirming} title="Confirmar">
                  <Check className="w-3.5 h-3.5" />
                </Button>
              </div>
            </td>
          </tr>
        )
      })}
    </>
  )
}

// ── Mecanismo cell — 4 sub-fields stacked ────────────────────────────────────

function MecanismoCell({
  why_it_works,
  pain_point,
  objection,
  transformation,
}: {
  why_it_works?: string | null
  pain_point?: string | null
  objection?: string | null
  transformation?: string | null
}) {
  const hasAny = why_it_works || pain_point || objection || transformation
  if (!hasAny) return <span className="text-xs text-muted-foreground">—</span>

  return (
    <div className="space-y-1 min-w-[200px]">
      {why_it_works && (
        <p className="text-xs leading-snug line-clamp-1" title={why_it_works}>
          <span className="text-muted-foreground/50 font-medium select-none">¿Por qué? </span>
          {why_it_works}
        </p>
      )}
      {pain_point && (
        <p className="text-xs leading-snug line-clamp-1" title={pain_point}>
          <span className="text-muted-foreground/50 font-medium select-none">Pain: </span>
          {pain_point}
        </p>
      )}
      {objection && (
        <p className="text-xs leading-snug line-clamp-1" title={objection}>
          <span className="text-muted-foreground/50 font-medium select-none">Objeción: </span>
          {objection}
        </p>
      )}
      {transformation && (
        <p className="text-xs leading-snug line-clamp-1" title={transformation}>
          <span className="text-muted-foreground/50 font-medium select-none">Transf.: </span>
          {transformation}
        </p>
      )}
    </div>
  )
}

// ── Main table ───────────────────────────────────────────────────────────────

export function ConceptsTable({ concepts, assets, briefs = [], projectId, cycleId, isAdminOrSubadmin, canManageAssets = isAdminOrSubadmin, canManageConceptStatus = isAdminOrSubadmin, onRefresh, onUpdateAsset, assetLinkStatus, brandBrains = [], brandLines = [], projectBrandBrainId }: ConceptsTableProps) {
  const [detailConcept, setDetailConcept]   = useState<CreativeConcept | null>(null)
  const [editConcept,   setEditConcept]     = useState<CreativeConcept | null>(null)
  const [createForLineId, setCreateForLineId] = useState<string | null | undefined>(undefined)
  const [aiDrafts,      setAiDrafts]        = useState<AIDraftConcept[]>([])
  const [aiDraftsLineId, setAiDraftsLineId] = useState<string | null>(null)
  const [previewIdx,    setPreviewIdx]      = useState<number | null>(null)
  // Para qué concepto se sube el asset, y opcionalmente de qué brief sale y
  // de qué pieza es nueva versión ("Subir nueva versión").
  const [newAssetFor, setNewAssetFor] = useState<{ conceptId: string; briefId?: string | null; revisesAssetId?: string } | null>(null)
  const [briefForConcept, setBriefForConcept] = useState<CreativeConcept | null>(null)
  const [quickScriptForConcept, setQuickScriptForConcept] = useState<CreativeConcept | null>(null)
  const [addScriptToBrief, setAddScriptToBrief] = useState<CreativeBrief | null>(null)
  const [copied,        setCopied]          = useState(false)
  const [showBrainPicker, setShowBrainPicker] = useState(false)
  const [generateForLineId, setGenerateForLineId] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isDeleting, startDelete] = useTransition()
  const [isGenerating, startGenerate] = useTransition()
  const [isConfirming, startConfirm]  = useTransition()

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll(ids: string[]) {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id))
      const next = new Set(prev)
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  function handleBulkDelete() {
    if (selectedIds.size === 0) return
    if (!confirm(`¿Eliminar ${selectedIds.size} concepto${selectedIds.size !== 1 ? "s" : ""}?`)) return
    startDelete(async () => {
      await bulkDeleteConcepts(Array.from(selectedIds), projectId)
      setSelectedIds(new Set())
      onRefresh()
    })
  }

  function handleShareProject() {
    const url = `${window.location.origin}/share/concepts/${projectId}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  function toggleGroup(groupId: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  function openBrainPicker(lineId?: string) {
    setGenerateForLineId(lineId ?? null)
    setShowBrainPicker(true)
  }

  function handleGenerate(brainId?: string, lineId?: string) {
    if (!cycleId) return
    const resolvedLineId = lineId ?? generateForLineId
    setShowBrainPicker(false)
    setGenerateForLineId(null)
    startGenerate(async () => {
      const drafts = await generateCreativeConcepts(projectId, cycleId, brainId, resolvedLineId ?? undefined)
      setAiDrafts(drafts)
      setAiDraftsLineId(resolvedLineId)
    })
  }

  function discardDraft(idx: number) {
    setAiDrafts((prev) => prev.filter((_, i) => i !== idx))
    if (previewIdx === idx) setPreviewIdx(null)
  }

  function confirmSingle(idx: number) {
    const draft = aiDrafts[idx]
    if (!draft || !cycleId) return
    setPreviewIdx(null)
    startConfirm(async () => {
      await confirmAIDrafts(projectId, cycleId, [draft], aiDraftsLineId ?? undefined)
      setAiDrafts((prev) => prev.filter((_, i) => i !== idx))
      onRefresh()
    })
  }

  function confirmAll() {
    if (!cycleId || !aiDrafts.length) return
    setPreviewIdx(null)
    startConfirm(async () => {
      await confirmAIDrafts(projectId, cycleId, aiDrafts, aiDraftsLineId ?? undefined)
      setAiDrafts([])
      setAiDraftsLineId(null)
      onRefresh()
    })
  }

  function openDetailAsNewAsset(opts?: { briefId?: string | null; revisesAssetId?: string }) {
    if (!detailConcept) return
    const id = detailConcept.id
    setDetailConcept(null)
    setNewAssetFor({ conceptId: id, ...opts })
  }

  function openEditFromDetail() {
    if (!detailConcept) return
    const c = detailConcept
    setDetailConcept(null)
    setEditConcept(c)
  }

  // ── Group concepts by brand line ──
  // Show ALL brand lines (even empty ones), plus a "General" group for ungrouped concepts
  const allLines = [...brandLines].sort((a, b) => a.position - b.position)
  const ungrouped = concepts.filter((c) => !c.brand_line_id)

  type LineGroup = { line: BrandLine | null; concepts: CreativeConcept[]; groupId: string }
  const groups: LineGroup[] = [
    ...allLines.map((l) => ({
      line: l,
      concepts: concepts.filter((c) => c.brand_line_id === l.id),
      groupId: l.id,
    })),
    { line: null, concepts: ungrouped, groupId: "__general__" },
  ]

  // Empty groups start collapsed
  const [initializedCollapsed, setInitializedCollapsed] = useState(false)
  if (!initializedCollapsed && allLines.length > 0) {
    const emptyIds = groups.filter((g) => g.concepts.length === 0 && g.line).map((g) => g.groupId)
    if (emptyIds.length > 0) {
      setCollapsedGroups(new Set(emptyIds))
    }
    setInitializedCollapsed(true)
  }

  const groupTh = "px-3 py-1.5 text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 border-b border-border bg-muted/30"
  const subTh   = "px-3 py-2 text-left text-xs font-medium text-muted-foreground bg-muted/50"

  function renderTableHeader(groupConceptIds?: string[]) {
    return (
      <thead>
        <tr className="border-b">
          {isAdminOrSubadmin && (
            <th className={cn(subTh, "w-10 align-middle text-center")}>
              {groupConceptIds && groupConceptIds.length > 0 && (
                <input
                  type="checkbox"
                  className="rounded border-muted-foreground/30 cursor-pointer"
                  checked={groupConceptIds.length > 0 && groupConceptIds.every((id) => selectedIds.has(id))}
                  onChange={() => toggleSelectAll(groupConceptIds)}
                />
              )}
            </th>
          )}
          <th className={cn(subTh, "w-16")}>Status</th>
          <th className={cn(subTh, "w-44")}>Concepto</th>
          <th className={cn(subTh, "w-52")}>Persona</th>
          <th className={cn(subTh, "w-36")}>Ángulo</th>
          <th className={cn(subTh, "w-16")}>Funnel</th>
          <th className={cn(subTh, "w-16 text-right")}></th>
        </tr>
      </thead>
    )
  }

  function renderConceptRows(groupConcepts: CreativeConcept[]) {
    const evergreen = groupConcepts.filter((c) => c.status === "Evergreen")
    const cycleOnly = groupConcepts.filter((c) => c.status !== "Evergreen")
    return (
      <>
        {evergreen.length > 0 && (
          <tr>
            <td colSpan={7} className="px-4 py-1.5 bg-amber-50/60 border-t">
              <span className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                <Star className="w-3 h-3" />
                Evergreen
              </span>
            </td>
          </tr>
        )}
        {evergreen.map((c) => (
          <ConceptRow
            key={c.id}
            concept={c}
            conceptAssets={assets.filter((a) => a.concept_id === c.id)}
            conceptBriefs={briefs.filter((b) => b.concept_id === c.id)}
            assetLinkStatus={assetLinkStatus}
            isAdminOrSubadmin={isAdminOrSubadmin}
            canManageAssets={canManageAssets}
            selected={selectedIds.has(c.id)}
            onToggleSelect={() => toggleSelect(c.id)}
            onClick={() => setDetailConcept(c)}
            onNewBrief={() => setBriefForConcept(c)}
            onNewAsset={() => setNewAssetFor({ conceptId: c.id })}
          />
        ))}
        {cycleOnly.map((c) => (
          <ConceptRow
            key={c.id}
            concept={c}
            conceptAssets={assets.filter((a) => a.concept_id === c.id)}
            conceptBriefs={briefs.filter((b) => b.concept_id === c.id)}
            assetLinkStatus={assetLinkStatus}
            isAdminOrSubadmin={isAdminOrSubadmin}
            canManageAssets={canManageAssets}
            selected={selectedIds.has(c.id)}
            onToggleSelect={() => toggleSelect(c.id)}
            onClick={() => setDetailConcept(c)}
            onNewBrief={() => setBriefForConcept(c)}
            onNewAsset={() => setNewAssetFor({ conceptId: c.id })}
          />
        ))}
      </>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          {concepts.filter((c) => c.status !== "Evergreen").length} concepto{concepts.filter((c) => c.status !== "Evergreen").length !== 1 ? "s" : ""} en este ciclo
          {concepts.filter((c) => c.status === "Evergreen").length > 0 && ` · ${concepts.filter((c) => c.status === "Evergreen").length} evergreen`}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className={cn("text-xs", copied && "text-emerald-600 border-emerald-300")}
            onClick={handleShareProject}
          >
            <Link2 className="w-3.5 h-3.5 mr-1" />
            {copied ? "¡Copiado!" : "Link de cliente"}
          </Button>
          {isAdminOrSubadmin && (
            <>
              {cycleId && groups.length <= 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => openBrainPicker()}
                  disabled={isGenerating}
                >
                  {isGenerating
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Generando…</>
                    : <><Sparkles className="w-3.5 h-3.5 mr-1 text-purple-500" />Generar con IA</>
                  }
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Brand Brain picker dialog */}
      <Dialog open={showBrainPicker} onOpenChange={setShowBrainPicker}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-500" />
              Generar conceptos con IA
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-xs text-muted-foreground">
              Selecciona un Brand Brain para que la IA genere conceptos basados en la identidad de la marca.
            </p>
            {brandBrains.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
                No hay Brand Brains. Crea uno en Ad Lab.
              </p>
            ) : (
              <div className="grid gap-2">
                {brandBrains.map((b: any) => (
                  <button
                    key={b.id}
                    onClick={() => handleGenerate(b.id)}
                    className="flex items-center gap-3 p-4 rounded-xl border text-left hover:border-primary/40 hover:bg-primary/5 transition-all"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{b.name}</p>
                      {b.industry && (
                        <p className="text-xs text-muted-foreground truncate">{b.industry}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => handleGenerate()}>
              Generar sin Brand Brain
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grouped concept tables */}
      {groups.map(({ line, concepts: groupConcepts, groupId }) => {
        const isCollapsed = collapsedGroups.has(groupId)
        const showDraftsHere = (aiDraftsLineId ?? null) === (line?.id ?? null)
        const count = groupConcepts.length
        const groupConceptIds = new Set(groupConcepts.map((c) => c.id))
        const unpublishedInGroup = assets.filter((a) => a.concept_id && groupConceptIds.has(a.concept_id) && !a.client_visible).length

        return (
          <div key={groupId} className="border rounded-lg overflow-hidden bg-card">
            {/* Group header */}
            <button
              type="button"
              onClick={() => toggleGroup(groupId)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: line?.color ?? "#9ca3af" }}
              />
              <span className="text-sm font-semibold flex-1">
                {line?.name ?? "General"}
              </span>
              {unpublishedInGroup > 0 && (
                <AttentionPill tone="warn" title="Assets que el cliente todavía no puede ver ni revisar">
                  {unpublishedInGroup} asset{unpublishedInGroup !== 1 ? "s" : ""} sin publicar
                </AttentionPill>
              )}
              <span className={cn("text-xs mr-2", count === 0 ? "text-muted-foreground/40 italic" : "text-muted-foreground")}>
                {count === 0 ? "Sin conceptos" : `${count} concepto${count !== 1 ? "s" : ""}`}
              </span>
              {isAdminOrSubadmin && cycleId && (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <span
                    onClick={() => setCreateForLineId(line?.id ?? null)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Nuevo
                  </span>
                  <span
                    onClick={() => {
                      if (line) {
                        const brain = brandBrains.find((b: any) => b.id === line.brand_brain_id)
                        if (brain) {
                          handleGenerate(brain.id, line.id)
                        } else {
                          openBrainPicker(line.id)
                        }
                      } else {
                        openBrainPicker()
                      }
                    }}
                    className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 px-2 py-1 rounded hover:bg-purple-50 transition-colors"
                  >
                    {isGenerating && generateForLineId === (line?.id ?? null)
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Sparkles className="w-3 h-3" />
                    }
                    Generar
                  </span>
                </div>
              )}
              <ChevronDown className={cn(
                "w-4 h-4 text-muted-foreground transition-transform",
                isCollapsed && "-rotate-90"
              )} />
            </button>

            {/* Group content */}
            {!isCollapsed && (
              <div className="border-t overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  {renderTableHeader(groupConcepts.map((c) => c.id))}
                  <tbody>
                    {showDraftsHere && (
                      <AIDraftRows
                        drafts={aiDrafts}
                        onPreview={setPreviewIdx}
                        onConfirm={confirmSingle}
                        onDiscard={discardDraft}
                        onDiscardAll={() => setAiDrafts([])}
                        onConfirmAll={confirmAll}
                        isConfirming={isConfirming}
                      />
                    )}
                    {renderConceptRows(groupConcepts)}
                    {groupConcepts.length === 0 && !(showDraftsHere && aiDrafts.length > 0) && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <p className="text-sm text-muted-foreground">
                              {line ? `Sin conceptos para ${line.name}` : "Sin conceptos"}
                            </p>
                            {isAdminOrSubadmin && cycleId && line && (
                              <button
                                type="button"
                                onClick={() => {
                                  const brain = brandBrains.find((b: any) => b.id === line.brand_brain_id)
                                  if (brain) {
                                    handleGenerate(brain.id, line.id)
                                  } else {
                                    openBrainPicker(line.id)
                                  }
                                }}
                                disabled={isGenerating}
                                className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-700 px-3 py-1.5 rounded-lg border border-purple-200 hover:bg-purple-50 transition-colors"
                              >
                                <Sparkles className="w-3 h-3" />
                                Generar primeros conceptos
                              </button>
                            )}
                            {isAdminOrSubadmin && cycleId && !line && (
                              <p className="text-xs text-muted-foreground">Crea uno manualmente o genera con IA</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}

      {/* Draft preview modal */}
      {previewIdx !== null && aiDrafts[previewIdx] && (
        <DraftPreviewModal
          draft={aiDrafts[previewIdx]}
          onConfirm={() => confirmSingle(previewIdx)}
          onDiscard={() => { discardDraft(previewIdx); setPreviewIdx(null) }}
          isPending={isConfirming}
        />
      )}

      {/* Concept detail modal (read-only) */}
      {detailConcept && (
        <ConceptDetailModal
          concept={detailConcept}
          conceptAssets={assets.filter((a) => a.concept_id === detailConcept.id)}
          conceptBriefs={briefs.filter((b) => b.concept_id === detailConcept.id)}
          projectId={projectId}
          cycleId={cycleId}
          isAdminOrSubadmin={isAdminOrSubadmin}
          canManageAssets={canManageAssets}
          canManageConceptStatus={canManageConceptStatus}
          onEdit={openEditFromDetail}
          onClose={() => setDetailConcept(null)}
          onNewAsset={openDetailAsNewAsset}
          onNewBrief={() => { const c = detailConcept; setDetailConcept(null); setBriefForConcept(c) }}
          onQuickScript={() => { const c = detailConcept; setDetailConcept(null); setQuickScriptForConcept(c) }}
          onAddScriptToBrief={(b) => { setDetailConcept(null); setAddScriptToBrief(b) }}
          onRefresh={onRefresh}
          onUpdateAsset={onUpdateAsset}
          assetLinkStatus={assetLinkStatus}
        />
      )}

      {/* Edit modal — opens from detail modal "Editar" button */}
      {editConcept && (
        <ConceptModal
          projectId={projectId}
          cycleId={cycleId}
          concept={editConcept}
          assets={assets.filter((a) => a.concept_id === editConcept.id)}
          isAdminOrSubadmin={isAdminOrSubadmin}
          open={!!editConcept}
          onRefresh={onRefresh}
          onClose={() => setEditConcept(null)}
          onNewAsset={() => {
            const id = editConcept.id
            setEditConcept(null)
            setNewAssetFor({ conceptId: id })
          }}
        />
      )}

      {/* Create concept modal */}
      {createForLineId !== undefined && (
        <ConceptModal
          projectId={projectId}
          cycleId={cycleId}
          isAdminOrSubadmin={isAdminOrSubadmin}
          brandLineId={createForLineId}
          brandBrainId={createForLineId ? brandLines.find((l: any) => l.id === createForLineId)?.brand_brain_id : projectBrandBrainId}
          open={createForLineId !== undefined}
          onRefresh={onRefresh}
          onClose={() => setCreateForLineId(undefined)}
        />
      )}

      {/* Asset creation pre-linked to concept */}
      {newAssetFor && (
        <AssetModal
          projectId={projectId}
          cycleId={cycleId}
          conceptId={newAssetFor.conceptId}
          briefId={newAssetFor.briefId ?? null}
          briefs={briefs
            .filter((b) => b.concept_id === newAssetFor.conceptId)
            .map((b) => ({ id: b.id, title: b.title || b.brand_brain?.name || "Brief" }))}
          siblingAssets={assets.filter((a) => a.concept_id === newAssetFor.conceptId)}
          defaultRevisesAssetId={newAssetFor.revisesAssetId}
          isAdminOrSubadmin={isAdminOrSubadmin}
          canManageAssets={canManageAssets}
          brandBrains={brandBrains}
          open
          onRefresh={onRefresh}
          onClose={() => setNewAssetFor(null)}
        />
      )}

      {/* Brief creator */}
      {briefForConcept && (
        <BriefCreator
          concept={briefForConcept}
          projectId={projectId}
          brandBrains={brandBrains}
          onClose={() => setBriefForConcept(null)}
          onCreated={() => { setBriefForConcept(null); onRefresh(); }}
        />
      )}

      {/* Quick Create — scripts from scratch, no reference ad */}
      {quickScriptForConcept && (
        <QuickScriptModal
          concept={quickScriptForConcept}
          projectId={projectId}
          brandBrains={brandBrains}
          projectBrandBrainId={projectBrandBrainId}
          onClose={() => setQuickScriptForConcept(null)}
          onCreated={() => { setQuickScriptForConcept(null); onRefresh(); }}
        />
      )}

      {/* Add another script (manual or AI) to a brief that already exists */}
      {addScriptToBrief && (() => {
        const scriptConcept = concepts.find((c) => c.id === addScriptToBrief.concept_id)
        if (!scriptConcept) return null
        return (
          <QuickScriptModal
            concept={scriptConcept}
            projectId={projectId}
            brandBrains={brandBrains}
            existingBrief={addScriptToBrief}
            onClose={() => setAddScriptToBrief(null)}
            onCreated={() => { setAddScriptToBrief(null); onRefresh(); }}
          />
        )
      })()}

      {/* Floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-background border shadow-lg rounded-lg px-4 py-2.5 flex items-center gap-3">
          <span className="text-sm font-medium">
            {selectedIds.size} concepto{selectedIds.size !== 1 ? "s" : ""} seleccionado{selectedIds.size !== 1 ? "s" : ""}
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            disabled={isDeleting}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            {isDeleting ? "Eliminando..." : "Eliminar"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Concept row ──────────────────────────────────────────────────────────────

// Lo que antes vivía en el bloque "Requiere tu atención", ahora en el
// renglón de cada concepto — escrito, no codificado con colores, y solo
// cuando hay algo pendiente.
// Color con significado fijo (siempre con texto e ícono, nunca solo color):
// rojo = el cliente pidió cambios (lo más urgente), ámbar = pendiente del
// equipo (sin publicar), gris = esperando al cliente.
const ATTENTION_TONES = {
  urgent: { className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", Icon: MessageSquare },
  warn:   { className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", Icon: EyeOff },
  wait:   { className: "bg-muted text-muted-foreground", Icon: Clock },
} as const

function AttentionPill({ tone, title, children }: { tone: keyof typeof ATTENTION_TONES; title?: string; children: React.ReactNode }) {
  const { className, Icon } = ATTENTION_TONES[tone]
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap", className)}>
      <Icon className="w-3 h-3" />
      {children}
    </span>
  )
}

// Lo que antes vivía en el bloque "Requiere tu atención", ahora en el
// renglón de cada concepto, y solo cuando hay algo pendiente.
function ConceptAttentionNotes({ conceptAssets, conceptBriefs }: { conceptAssets: CreativeAsset[]; conceptBriefs: CreativeBrief[] }) {
  const unpublished = conceptAssets.filter((a) => !a.client_visible).length
  const assetChanges = conceptAssets.filter((a) => a.client_visible && a.client_status === "changes_requested").length
  const scriptEntries = conceptBriefs.flatMap((b) => scriptReviewEntries(b))
  const scriptChanges = scriptEntries.filter((e) => e.status === "changes_requested").length
  const scriptPending = scriptEntries.filter((e) => e.status === "pending_review").length
  const notes: { tone: keyof typeof ATTENTION_TONES; text: string }[] = []
  if (assetChanges > 0) notes.push({ tone: "urgent", text: `${assetChanges} asset${assetChanges !== 1 ? "s" : ""} con cambios pedidos` })
  if (scriptChanges > 0) notes.push({ tone: "urgent", text: `${scriptChanges} guión${scriptChanges !== 1 ? "es" : ""} con cambios pedidos` })
  if (unpublished > 0) notes.push({ tone: "warn", text: `${unpublished} asset${unpublished !== 1 ? "s" : ""} sin publicar` })
  if (scriptPending > 0) notes.push({ tone: "wait", text: `${scriptPending} guión${scriptPending !== 1 ? "es" : ""} en revisión del cliente` })
  if (notes.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {notes.map((n) => <AttentionPill key={n.text} tone={n.tone}>{n.text}</AttentionPill>)}
    </div>
  )
}

function ConceptRow({
  concept,
  conceptAssets,
  conceptBriefs,
  isAdminOrSubadmin,
  canManageAssets = isAdminOrSubadmin,
  selected,
  onToggleSelect,
  onClick,
  onNewBrief,
  onNewAsset,
  assetLinkStatus,
}: {
  concept: CreativeConcept
  conceptAssets: CreativeAsset[]
  conceptBriefs: CreativeBrief[]
  isAdminOrSubadmin: boolean
  canManageAssets?: boolean
  selected?: boolean
  onToggleSelect?: () => void
  onClick: () => void
  onNewBrief: () => void
  onNewAsset: () => void
  assetLinkStatus: Record<string, AssetMetaLinkStatus>
}) {
  const angleEntry = ANGLE_GUIDE.find((a) => a.name === concept.angle_type)
  const liveRollup  = conceptLiveRollup(conceptAssets.map((a) => a.id), assetLinkStatus)
  const archivedButLive = concept.status === "Archived" && liveRollup.anyActive

  return (
    <tr className={cn("border-t hover:bg-muted/30 transition-colors cursor-pointer", selected && "bg-purple-50/50")} onClick={onClick}>
      {isAdminOrSubadmin && (
        <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="rounded border-muted-foreground/30 cursor-pointer"
            checked={!!selected}
            onChange={onToggleSelect}
          />
        </td>
      )}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1">
          <Badge className={cn("text-xs border-0", CONCEPT_STATUS_COLORS[concept.status])}>
            {concept.status}
          </Badge>
          {concept.parent_concept_id && (
            <span title="Evolución de concepto anterior">
              <ArrowUpRight className="w-3 h-3 text-muted-foreground" />
            </span>
          )}
          {archivedButLive ? (
            <span title={`Archivado pero sigue corriendo en Meta — ${fmt$(liveRollup.totalSpend)} este ciclo`}>
              <AlertTriangle className="w-3 h-3 text-destructive" />
            </span>
          ) : liveRollup.anyActive ? (
            <span title={`Corriendo en Meta — ${fmt$(liveRollup.totalSpend)} este ciclo`}>
              <Radio className="w-3 h-3 text-emerald-600" />
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="text-sm font-medium">{concept.name || "—"}</div>
        <ConceptAttentionNotes conceptAssets={conceptAssets} conceptBriefs={conceptBriefs} />
      </td>
      <td className="px-3 py-3">
        <div className="text-xs line-clamp-2">{concept.target_persona || "—"}</div>
      </td>
      <td className="px-3 py-3">
        <span className="text-xs font-medium">
          {angleEntry ? `${angleEntry.emoji} ${concept.angle_type}` : concept.angle_type ?? "—"}
        </span>
      </td>
      <td className="px-3 py-3">
        {concept.funnel_stage ? (
          <Badge className={cn("text-xs border-0 h-5 px-1.5", FUNNEL_COLORS[concept.funnel_stage] ?? "bg-gray-100 text-gray-600")}>
            {concept.funnel_stage}
          </Badge>
        ) : <span className="text-xs text-muted-foreground">—</span>}
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center justify-end gap-1.5">
          {conceptBriefs.length > 0 && (() => {
            const hasChanges = conceptBriefs.some((b) => scriptReviewEntries(b).some((e) => e.status === "changes_requested"))
            return (
              <span
                className={cn(
                  "relative inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full",
                  hasChanges ? "text-sky-700 bg-sky-50" : "text-violet-600 bg-violet-50"
                )}
                title={hasChanges ? "Hay cambios pedidos por el cliente en un guión" : `${conceptBriefs.length} brief${conceptBriefs.length !== 1 ? "s" : ""}`}
              >
                <FileText className="w-3 h-3" />
                {conceptBriefs.length}
                {hasChanges && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-sky-500" />}
              </span>
            )
          })()}
          {conceptAssets.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full" title={`${conceptAssets.length} asset${conceptAssets.length !== 1 ? "s" : ""}`}>
              <Upload className="w-3 h-3" />
              {conceptAssets.length}
            </span>
          )}
          {(isAdminOrSubadmin || canManageAssets) && (
            <div className="flex gap-0.5 ml-1" onClick={(e) => e.stopPropagation()}>
              {isAdminOrSubadmin && (
                <button
                  onClick={onNewBrief}
                  className="p-1 rounded hover:bg-violet-100 text-muted-foreground hover:text-violet-600 transition-colors"
                  title="Crear brief"
                >
                  <FileText className="w-3.5 h-3.5" />
                </button>
              )}
              {canManageAssets && (
                <button
                  onClick={onNewAsset}
                  className="p-1 rounded hover:bg-blue-100 text-muted-foreground hover:text-blue-600 transition-colors"
                  title="Subir asset"
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
          {!isAdminOrSubadmin && conceptBriefs.length === 0 && conceptAssets.length === 0 && (
            <span className="text-xs text-muted-foreground">Ver →</span>
          )}
        </div>
      </td>
    </tr>
  )
}
