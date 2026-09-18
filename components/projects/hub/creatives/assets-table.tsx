"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AssetModal } from "./asset-modal"
import {
  PRODUCTION_STATUS_COLORS,
  PLATFORM_COLORS,
  FUNNEL_COLORS, ANGLE_GUIDE,
} from "@/lib/constants/creatives"
import type { CreativeAsset, CreativeConcept } from "@/lib/types"
import { Plus, ExternalLink, Eye, Film, ImageIcon, History, ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

// Un asset "actual" (head) es cualquiera que NADIE más apunta como su
// revisión — el resto son historial, encadenados vía revises_asset_id
// (ver createAsset, lib/actions/creatives.ts). Se muestra solo el head por
// default, con las versiones anteriores colapsadas debajo — evita que la
// tabla se llene de filas viejas ya superadas mientras conserva el
// historial completo a un clic, en vez de perderlo (como pasaba con el
// flujo manual de antes).
function buildAssetChains(groupAssets: CreativeAsset[]): { head: CreativeAsset; history: CreativeAsset[] }[] {
  const byId = new Map(groupAssets.map((a) => [a.id, a]))
  const supersededIds = new Set(groupAssets.map((a) => a.revises_asset_id).filter((id): id is string => !!id))
  const heads = groupAssets.filter((a) => !supersededIds.has(a.id))
  return heads.map((head) => {
    const history: CreativeAsset[] = []
    let current = head
    while (current.revises_asset_id) {
      const prev = byId.get(current.revises_asset_id)
      if (!prev) break
      history.push(prev)
      current = prev
    }
    return { head, history }
  })
}

interface AssetsTableProps {
  assets: CreativeAsset[]
  concepts: CreativeConcept[]
  projectId: string
  cycleId: string | null
  isAdminOrSubadmin: boolean
  onRefresh: () => void
}

export function AssetsTable({ assets, concepts, projectId, cycleId, isAdminOrSubadmin, onRefresh }: AssetsTableProps) {
  const [selectedAsset, setSelectedAsset] = useState<CreativeAsset | null>(null)
  const [defaultConceptId, setDefaultConceptId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  function openCreate(conceptId?: string) {
    setDefaultConceptId(conceptId ?? null)
    setShowCreate(true)
  }

  // Group assets by concept_id
  const byConceptId = new Map<string | null, CreativeAsset[]>()
  for (const asset of assets) {
    const key = asset.concept_id ?? null
    const group = byConceptId.get(key) ?? []
    group.push(asset)
    byConceptId.set(key, group)
  }

  // Concept groups in the order concepts appear
  const conceptGroups = concepts
    .filter((c) => byConceptId.has(c.id))
    .map((c) => ({ concept: c, groupAssets: byConceptId.get(c.id)! }))

  // Assets not linked to any concept
  const unlinked = byConceptId.get(null) ?? []

  const totalCols = 3
  const colHeader = "text-left px-4 py-2.5 text-xs font-medium text-muted-foreground"

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {assets.length} asset{assets.length !== 1 ? "s" : ""} en este ciclo
        </p>
      </div>

      <div className="border rounded-lg overflow-hidden bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className={colHeader}>Asset</th>
              <th className={colHeader}>Estado</th>
              <th className="px-4 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody>
            {assets.length === 0 && (
              <tr>
                <td colSpan={totalCols} className="px-4 py-10 text-center text-muted-foreground text-sm">
                  Sin assets para este ciclo
                  {isAdminOrSubadmin && <p className="text-xs mt-1">Crea el primer asset del ciclo</p>}
                </td>
              </tr>
            )}

            {/* Groups by concept */}
            {conceptGroups.map(({ concept, groupAssets }) => {
              const angleEntry = ANGLE_GUIDE.find((a) => a.name === concept.angle_type)
              return (
                <>
                  {/* Concept group header */}
                  <tr key={`header-${concept.id}`} className="border-t bg-muted/20">
                    <td colSpan={totalCols} className="px-4 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          {/* Angle emoji */}
                          {angleEntry && (
                            <span className="text-base leading-none">{angleEntry.emoji}</span>
                          )}
                          <span className="text-xs font-semibold text-foreground truncate">
                            {concept.name ?? concept.angle_type ?? "Sin nombre"}
                          </span>
                          {/* Angle type chip */}
                          {concept.angle_type && (
                            <span className="hidden sm:inline-flex text-[10px] font-medium bg-foreground/8 text-muted-foreground px-1.5 py-0.5 rounded">
                              {concept.angle_type}
                            </span>
                          )}
                          {/* Funnel badge */}
                          {concept.funnel_stage && (
                            <span className={cn(
                              "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                              FUNNEL_COLORS[concept.funnel_stage] ?? "bg-gray-100 text-gray-600"
                            )}>
                              {concept.funnel_stage}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {groupAssets.length} asset{groupAssets.length !== 1 ? "s" : ""}
                          </span>
                          {isAdminOrSubadmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={() => openCreate(concept.id)}
                            >
                              <Plus className="w-3 h-3 mr-0.5" />
                              Nuevo
                            </Button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>

                  {/* Assets in this group — solo la versión actual de cada
                      cadena de revisiones, con el historial colapsado. */}
                  {buildAssetChains(groupAssets).map(({ head, history }) => (
                    <AssetRow
                      key={head.id}
                      asset={head}
                      history={history}
                      isAdminOrSubadmin={isAdminOrSubadmin}
                      onClick={() => setSelectedAsset(head)}
                      onClickHistory={setSelectedAsset}
                    />
                  ))}
                </>
              )
            })}

            {/* Unlinked assets */}
            {unlinked.length > 0 && (
              <>
                <tr className="border-t bg-muted/10">
                  <td colSpan={totalCols} className="px-4 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Sin concepto asignado</span>
                      <span className="text-xs text-muted-foreground">{unlinked.length} asset{unlinked.length !== 1 ? "s" : ""}</span>
                    </div>
                  </td>
                </tr>
                {buildAssetChains(unlinked).map(({ head, history }) => (
                  <AssetRow
                    key={head.id}
                    asset={head}
                    history={history}
                    isAdminOrSubadmin={isAdminOrSubadmin}
                    onClick={() => setSelectedAsset(head)}
                    onClickHistory={setSelectedAsset}
                  />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showCreate && defaultConceptId && (
        <AssetModal
          projectId={projectId}
          cycleId={cycleId}
          conceptId={defaultConceptId}
          isAdminOrSubadmin={isAdminOrSubadmin}
          siblingAssets={byConceptId.get(defaultConceptId) ?? []}
          open={showCreate}
          onRefresh={onRefresh}
          onClose={() => { setShowCreate(false); setDefaultConceptId(null) }}
        />
      )}
      {selectedAsset && selectedAsset.concept_id && (
        <AssetModal
          projectId={projectId}
          cycleId={cycleId}
          asset={selectedAsset}
          conceptId={selectedAsset.concept_id}
          isAdminOrSubadmin={isAdminOrSubadmin}
          open={!!selectedAsset}
          onRefresh={onRefresh}
          onClose={() => setSelectedAsset(null)}
        />
      )}
    </div>
  )
}

// ── Asset row ────────────────────────────────────────────────────────────────

function getAssetThumbUrl(asset: CreativeAsset): string | null {
  if (asset.thumbnail_path) return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/${asset.thumbnail_path}`
  if (asset.file_path) return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/${asset.file_path}`
  return asset.asset_url
}

function AssetRow({
  asset,
  history = [],
  isAdminOrSubadmin,
  onClick,
  onClickHistory,
}: {
  asset: CreativeAsset
  history?: CreativeAsset[]
  isAdminOrSubadmin: boolean
  onClick: () => void
  onClickHistory?: (asset: CreativeAsset) => void
}) {
  const thumbUrl = getAssetThumbUrl(asset)
  const [showHistory, setShowHistory] = useState(false)

  return (
    <>
    <tr className="border-t hover:bg-muted/30 transition-colors cursor-pointer" onClick={onClick}>

      {/* Thumbnail + format */}
      <td className="px-4 py-2.5 pl-6">
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-muted/50 flex-shrink-0 flex items-center justify-center border">
            {thumbUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                {asset.file_type === "video" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <Film className="w-4 h-4 text-white drop-shadow" />
                  </div>
                )}
              </>
            ) : (
              <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {asset.format && <span className="text-xs font-medium text-foreground">{asset.format}</span>}
              {asset.platform && (
                <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-md", PLATFORM_COLORS[asset.platform] ?? "bg-muted text-muted-foreground")}>
                  {asset.platform.replace(" Ads", "")}
                </span>
              )}
            </div>
            {(asset.variant || asset.iteration || history.length > 0) && (
              <div className="flex gap-1 mt-1 flex-wrap items-center">
                {asset.variant && <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{asset.variant}</span>}
                {asset.iteration && <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{asset.iteration}</span>}
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowHistory((v) => !v) }}
                    className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded bg-muted/70 hover:bg-muted"
                  >
                    {showHistory ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                    <History className="w-2.5 h-2.5" />
                    {history.length} revisión{history.length !== 1 ? "es" : ""} anterior{history.length !== 1 ? "es" : ""}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Production status */}
      <td className="px-4 py-2.5">
        <Badge className={cn("text-xs border-0 font-medium", PRODUCTION_STATUS_COLORS[asset.production_status] ?? "bg-gray-100 text-gray-600")}>
          {asset.production_status}
        </Badge>
      </td>

      {/* Actions */}
      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1.5">
          {asset.client_visible && (
            <span
              title={
                asset.client_status === "approved"          ? "Aprobado por el cliente" :
                asset.client_status === "changes_requested" ? "Cliente pidió cambios" :
                "Enviado al cliente — pendiente"
              }
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                asset.client_status === "approved"          && "bg-emerald-100 text-emerald-700",
                asset.client_status === "changes_requested" && "bg-amber-100 text-amber-700",
                (!asset.client_status || asset.client_status === "pending_review") && "bg-blue-100 text-blue-600",
              )}
            >
              <Eye className="w-2.5 h-2.5" />
              {asset.client_status === "approved"          ? "OK" :
               asset.client_status === "changes_requested" ? "Cambios" :
               "Pendiente"}
            </span>
          )}
        </div>
      </td>
    </tr>
    {showHistory && history.map((old) => (
      <tr
        key={old.id}
        className="border-t bg-muted/10 hover:bg-muted/30 transition-colors cursor-pointer text-muted-foreground"
        onClick={() => onClickHistory?.(old)}
      >
        <td className="px-4 py-2 pl-10">
          <div className="flex items-center gap-2">
            <History className="w-3 h-3 flex-shrink-0" />
            <span className="text-xs">
              {[old.format, old.platform, old.iteration].filter(Boolean).join(" ") || "Versión anterior"}
            </span>
          </div>
        </td>
        <td className="px-4 py-2">
          <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground border-muted-foreground/30">
            Reemplazada
          </Badge>
        </td>
        <td className="px-4 py-2" />
      </tr>
    ))}
    </>
  )
}
