"use client"

import { useState, useEffect, useTransition } from "react"
import { ConceptsTable } from "./concepts-table"
import { RelationshipMap } from "./relationship-map"
import { LayoutGrid, Share2 } from "lucide-react"
import { getCreativeConcepts, getCreativeAssets, getBriefsForProject } from "@/lib/actions/creatives"
import { getAssetMetaLinkStatus, type AssetMetaLinkStatus } from "@/lib/actions/paid-media-performance"
import type { CreativeConcept, CreativeAsset, CreativeBrief, PaidMediaCycle } from "@/lib/types"
import { formatCycleRange, cn } from "@/lib/utils"
import { Loader2, ChevronDown } from "lucide-react"

interface CreativesHubProps {
  projectId: string
  cycles: PaidMediaCycle[]
  initialConcepts: CreativeConcept[]
  initialAssets: CreativeAsset[]
  isAdminOrSubadmin: boolean
  isProjectMember?: boolean
  brandBrains?: any[]
  brandLines?: any[]
  projectBrandBrainId?: string
}

export function CreativesHub({
  projectId,
  cycles,
  initialConcepts,
  initialAssets,
  isAdminOrSubadmin,
  isProjectMember = false,
  brandBrains = [],
  brandLines = [],
  projectBrandBrainId,
}: CreativesHubProps) {
  const activeCycle = cycles.find((c) => c.is_active) ?? cycles[0] ?? null
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(activeCycle?.id ?? null)
  const [concepts, setConcepts] = useState<CreativeConcept[]>(initialConcepts)
  const [assets, setAssets]     = useState<CreativeAsset[]>(initialAssets)
  const [briefs, setBriefs]     = useState<CreativeBrief[]>([])
  const [assetLinkStatus, setAssetLinkStatus] = useState<Record<string, AssetMetaLinkStatus>>({})
  const [isLoading, startLoad]  = useTransition()
  const [view, setView] = useState<"table" | "map">("table")

  const selectedCycle = cycles.find((c) => c.id === selectedCycleId) ?? null
  const isActiveCycle = selectedCycle?.is_active ?? false
  const canEdit         = isAdminOrSubadmin && isActiveCycle
  const canManageAssets = (isAdminOrSubadmin || isProjectMember) && isActiveCycle

  function reload() {
    if (!selectedCycleId) return
    startLoad(async () => {
      const [c, a, b, links] = await Promise.all([
        getCreativeConcepts(projectId, selectedCycleId),
        getCreativeAssets(projectId, selectedCycleId),
        getBriefsForProject(projectId),
        getAssetMetaLinkStatus(projectId, selectedCycleId),
      ])
      setConcepts(c)
      setAssets(a)
      setBriefs(b)
      setAssetLinkStatus(links)
    })
  }

  // Actualizar un asset puntual (ej. publicar/ocultar al cliente) sin
  // pedir de vuelta concepts+assets+briefs completos — antes cualquier
  // toggle de visibilidad disparaba ese refetch de 3 queries y se sentía
  // como recargar la página entera.
  function updateAssetLocal(assetId: string, patch: Partial<CreativeAsset>) {
    setAssets((prev) => prev.map((a) => a.id === assetId ? { ...a, ...patch } : a))
  }

  useEffect(() => {
    reload()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCycleId, projectId])

  if (cycles.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        <p>No hay ciclos activos.</p>
        <p className="text-xs mt-1">Abre un ciclo mensual desde el Hub Paid Media para empezar a trackear creativos.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Cycle selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <select
            value={selectedCycleId ?? ""}
            onChange={(e) => setSelectedCycleId(e.target.value || null)}
            className="appearance-none text-sm border rounded-lg px-3 py-1.5 pr-8 bg-background focus:outline-none focus:ring-1 focus:ring-ring font-medium"
          >
            {cycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {formatCycleRange(cycle.start_date, cycle.end_date)}
                {cycle.is_active ? " (activo)" : ""}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        </div>

        {isLoading && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Cargando…
          </span>
        )}

        {!isActiveCycle && selectedCycle && (
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
            Solo lectura — ciclo cerrado
          </span>
        )}

        {/* Tabla / Mapa — el mapa es de solo lectura, generado a partir de
            concepto→asset→ad, incluso para ciclos ya cerrados (para
            revisitar cómo se veía la relación en un ciclo pasado). */}
        <div className="ml-auto flex items-center gap-1 border rounded-lg p-0.5">
          <button
            onClick={() => setView("table")}
            className={cn("flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md transition-colors", view === "table" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Tabla
          </button>
          <button
            onClick={() => setView("map")}
            className={cn("flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md transition-colors", view === "map" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
          >
            <Share2 className="w-3.5 h-3.5" /> Mapa
          </button>
        </div>
      </div>

      {view === "map" ? (
        <RelationshipMap projectId={projectId} cycleId={selectedCycleId} />
      ) : (
        <ConceptsTable
          concepts={concepts}
          assets={assets}
          briefs={briefs}
          projectId={projectId}
          cycleId={selectedCycleId}
          isAdminOrSubadmin={canEdit}
          canManageAssets={canManageAssets}
          onRefresh={reload}
          onUpdateAsset={updateAssetLocal}
          assetLinkStatus={assetLinkStatus}
          brandBrains={brandBrains}
          brandLines={brandLines}
          projectBrandBrainId={projectBrandBrainId}
        />
      )}
    </div>
  )
}
