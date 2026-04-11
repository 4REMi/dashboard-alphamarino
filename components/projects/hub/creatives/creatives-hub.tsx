"use client"

import { useState, useEffect, useTransition } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConceptsTable } from "./concepts-table"
import { AssetsTable } from "./assets-table"
import { getCreativeConcepts, getCreativeAssets } from "@/lib/actions/creatives"
import type { CreativeConcept, CreativeAsset, PaidMediaCycle } from "@/lib/types"
import { Loader2, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface CreativesHubProps {
  projectId: string
  cycles: PaidMediaCycle[]
  initialConcepts: CreativeConcept[]
  initialAssets: CreativeAsset[]
  isAdminOrSubadmin: boolean
}

export function CreativesHub({
  projectId,
  cycles,
  initialConcepts,
  initialAssets,
  isAdminOrSubadmin,
}: CreativesHubProps) {
  const activeCycle = cycles.find((c) => c.is_active) ?? cycles[0] ?? null
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(activeCycle?.id ?? null)
  const [concepts, setConcepts] = useState<CreativeConcept[]>(initialConcepts)
  const [assets, setAssets]     = useState<CreativeAsset[]>(initialAssets)
  const [isLoading, startLoad]  = useTransition()

  const selectedCycle = cycles.find((c) => c.id === selectedCycleId) ?? null
  const isActiveCycle = selectedCycle?.is_active ?? false
  const canEdit       = isAdminOrSubadmin && isActiveCycle

  // Reload when cycle changes
  useEffect(() => {
    if (!selectedCycleId) return
    startLoad(async () => {
      const [c, a] = await Promise.all([
        getCreativeConcepts(projectId, selectedCycleId),
        getCreativeAssets(projectId, selectedCycleId),
      ])
      setConcepts(c)
      setAssets(a)
    })
  }, [selectedCycleId, projectId])

  function formatCycleLabel(cycle: PaidMediaCycle) {
    const d = new Date(cycle.cycle_month + "T12:00:00")
    return d.toLocaleDateString("es-MX", { month: "long", year: "numeric" })
  }

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
                {formatCycleLabel(cycle)}
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

      {/* Sub-tabs */}
      <Tabs defaultValue="concepts">
        <TabsList className="h-8">
          <TabsTrigger value="concepts" className="text-xs h-7">
            Conceptos
            {concepts.length > 0 && (
              <span className="ml-1.5 text-xs bg-muted rounded-full px-1.5 py-0.5 text-muted-foreground">
                {concepts.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="assets" className="text-xs h-7">
            Assets
            {assets.length > 0 && (
              <span className="ml-1.5 text-xs bg-muted rounded-full px-1.5 py-0.5 text-muted-foreground">
                {assets.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="concepts" className="mt-4">
          <ConceptsTable
            concepts={concepts}
            projectId={projectId}
            cycleId={selectedCycleId}
            isAdminOrSubadmin={canEdit}
          />
        </TabsContent>

        <TabsContent value="assets" className="mt-4">
          <AssetsTable
            assets={assets}
            concepts={concepts}
            projectId={projectId}
            cycleId={selectedCycleId}
            isAdminOrSubadmin={canEdit}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
