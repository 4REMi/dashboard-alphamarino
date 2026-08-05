"use client"

import { useState, useEffect, useTransition } from "react"
import { ConceptsTable } from "./concepts-table"
import { getCreativeConcepts, getCreativeAssets, getBriefsForProject } from "@/lib/actions/creatives"
import { getRequestsForProject } from "@/lib/actions/creative-requests"
import type { CreativeConcept, CreativeAsset, CreativeBrief, CreativeRequest, PaidMediaCycle } from "@/lib/types"
import { formatCycleRange } from "@/lib/utils"
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
  savedAds?: any[]
  boards?: any[]
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
  savedAds = [],
  boards = [],
  projectBrandBrainId,
}: CreativesHubProps) {
  const activeCycle = cycles.find((c) => c.is_active) ?? cycles[0] ?? null
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(activeCycle?.id ?? null)
  const [concepts, setConcepts] = useState<CreativeConcept[]>(initialConcepts)
  const [assets, setAssets]     = useState<CreativeAsset[]>(initialAssets)
  const [briefs, setBriefs]     = useState<CreativeBrief[]>([])
  const [requests, setRequests] = useState<CreativeRequest[]>([])
  const [isLoading, startLoad]  = useTransition()

  const selectedCycle = cycles.find((c) => c.id === selectedCycleId) ?? null
  const isActiveCycle = selectedCycle?.is_active ?? false
  const canEdit         = isAdminOrSubadmin && isActiveCycle
  const canManageAssets = (isAdminOrSubadmin || isProjectMember) && isActiveCycle

  function reload() {
    if (!selectedCycleId) return
    startLoad(async () => {
      const [c, a, b, r] = await Promise.all([
        getCreativeConcepts(projectId, selectedCycleId),
        getCreativeAssets(projectId, selectedCycleId),
        getBriefsForProject(projectId),
        getRequestsForProject(projectId).catch(() => [] as CreativeRequest[]),
      ])
      setConcepts(c)
      setAssets(a)
      setBriefs(b)
      setRequests(r)
    })
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
      </div>

      <ConceptsTable
        concepts={concepts}
        assets={assets}
        briefs={briefs}
        requests={requests}
        projectId={projectId}
        cycleId={selectedCycleId}
        isAdminOrSubadmin={canEdit}
        canManageAssets={canManageAssets}
        onRefresh={reload}
        brandBrains={brandBrains}
        brandLines={brandLines}
        savedAds={savedAds}
        boards={boards}
        projectBrandBrainId={projectBrandBrainId}
      />
    </div>
  )
}
