"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AssetModal } from "./asset-modal"
import { PRODUCTION_STATUS_COLORS, VERDICT_COLORS } from "@/lib/constants/creatives"
import type { CreativeAsset, CreativeConcept } from "@/lib/types"
import { Plus, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

interface AssetsTableProps {
  assets: CreativeAsset[]
  concepts: CreativeConcept[]
  projectId: string
  cycleId: string | null
  isAdminOrSubadmin: boolean
}

export function AssetsTable({ assets, concepts, projectId, cycleId, isAdminOrSubadmin }: AssetsTableProps) {
  const [selectedAsset, setSelectedAsset] = useState<CreativeAsset | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const colHeader = "text-left px-4 py-2.5 text-xs font-medium text-muted-foreground"

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {assets.length} asset{assets.length !== 1 ? "s" : ""} en este ciclo
        </p>
        {isAdminOrSubadmin && (
          <Button size="sm" className="text-xs" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Nuevo asset
          </Button>
        )}
      </div>

      <div className="border rounded-lg overflow-hidden bg-card overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className={colHeader}>Concepto</th>
              <th className={colHeader}>Formato · Plataforma</th>
              <th className={cn(colHeader, "hidden md:table-cell")}>Hook</th>
              <th className={colHeader}>Estado</th>
              {isAdminOrSubadmin && (
                <>
                  <th className={cn(colHeader, "hidden lg:table-cell")}>ROAS</th>
                  <th className={cn(colHeader, "hidden lg:table-cell")}>Veredicto</th>
                </>
              )}
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {assets.length === 0 && (
              <tr>
                <td colSpan={isAdminOrSubadmin ? 7 : 5} className="px-4 py-10 text-center text-muted-foreground text-sm">
                  Sin assets para este ciclo
                  {isAdminOrSubadmin && <p className="text-xs mt-1">Crea el primer asset del ciclo</p>}
                </td>
              </tr>
            )}
            {assets.map((asset) => {
              const concept = asset.concept as CreativeConcept | null
              return (
                <tr
                  key={asset.id}
                  className="border-t hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => setSelectedAsset(asset)}
                >
                  <td className="px-4 py-3">
                    {concept ? (
                      <div>
                        <div className="text-xs font-medium truncate max-w-[130px]" title={concept.angle_type ?? ""}>
                          {concept.angle_type ?? "—"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[130px]" title={concept.target_persona}>
                          {concept.target_persona}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs">
                      {asset.format && <span className="font-medium">{asset.format}</span>}
                      {asset.format && asset.platform && <span className="text-muted-foreground"> · </span>}
                      {asset.platform && <span className="text-muted-foreground">{asset.platform}</span>}
                    </div>
                    {(asset.variant || asset.iteration) && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {[asset.variant, asset.iteration].filter(Boolean).join(" / ")}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-muted-foreground line-clamp-2 max-w-[160px]" title={asset.hook ?? ""}>
                      {asset.hook ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={cn("text-xs border-0", PRODUCTION_STATUS_COLORS[asset.production_status] ?? "bg-gray-100 text-gray-600")}>
                      {asset.production_status}
                    </Badge>
                  </td>
                  {isAdminOrSubadmin && (
                    <>
                      <td className="px-4 py-3 text-sm hidden lg:table-cell">
                        {asset.roas != null ? (
                          <span className={cn("font-medium", asset.roas >= 2 ? "text-emerald-600" : "text-red-500")}>
                            {asset.roas.toFixed(2)}x
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {asset.verdict ? (
                          <Badge className={cn("text-xs border-0", VERDICT_COLORS[asset.verdict] ?? "")}>
                            {asset.verdict}
                          </Badge>
                        ) : "—"}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {asset.asset_url && (
                        <a href={asset.asset_url} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showCreate && (
        <AssetModal
          projectId={projectId}
          cycleId={cycleId}
          concepts={concepts}
          isAdminOrSubadmin={isAdminOrSubadmin}
          open={showCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
      {selectedAsset && (
        <AssetModal
          projectId={projectId}
          cycleId={cycleId}
          asset={selectedAsset}
          concepts={concepts}
          isAdminOrSubadmin={isAdminOrSubadmin}
          open={!!selectedAsset}
          onClose={() => setSelectedAsset(null)}
        />
      )}
    </div>
  )
}
