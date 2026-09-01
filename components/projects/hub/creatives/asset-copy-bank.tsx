"use client"

import { useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { getAssetCopies, generateCopyForAsset, refineAssetCopy, deleteAssetCopy } from "@/lib/actions/creatives"
import type { AssetCopy } from "@/lib/types"
import { Sparkles, Copy, Check, Trash2, Loader2, ChevronDown, ChevronUp } from "lucide-react"

const REFINEMENT_LABELS: { key: "shorter" | "longer" | "richer"; label: string }[] = [
  { key: "shorter", label: "Más corto" },
  { key: "longer",  label: "Más largo" },
  { key: "richer",  label: "Más enriquecido" },
]

interface Props {
  assetId: string
  projectId: string
  hasConcept: boolean
  canManage: boolean
}

export function AssetCopyBank({ assetId, projectId, hasConcept, canManage }: Props) {
  const [expanded, setExpanded]     = useState(false)
  const [copies, setCopies]         = useState<AssetCopy[] | null>(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [copiedId, setCopiedId]     = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [refiningId, setRefiningId]  = useState<string | null>(null)

  useEffect(() => {
    if (!expanded || copies !== null) return
    setLoading(true)
    getAssetCopies(assetId)
      .then(setCopies)
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar el banco de copies"))
      .finally(() => setLoading(false))
  }, [expanded, copies, assetId])

  function handleGenerate() {
    setError(null)
    startTransition(async () => {
      try {
        const created = await generateCopyForAsset(assetId)
        setCopies((prev) => [created, ...(prev ?? [])])
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo generar el copy")
      }
    })
  }

  function handleRefine(copyId: string, refinement: "shorter" | "longer" | "richer") {
    setError(null)
    setRefiningId(copyId)
    refineAssetCopy(copyId, refinement)
      .then((created) => setCopies((prev) => [created, ...(prev ?? [])]))
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo refinar el copy"))
      .finally(() => setRefiningId(null))
  }

  function handleDelete(copyId: string) {
    setCopies((prev) => (prev ?? []).filter((c) => c.id !== copyId))
    deleteAssetCopy(copyId, projectId).catch(() => {})
  }

  function handleCopy(c: AssetCopy) {
    const text = [c.hook, c.copy, c.cta].filter(Boolean).join("\n\n")
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(c.id)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }

  if (!hasConcept) return null

  return (
    <div className="border-t bg-muted/20">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          Banco de copies {copies && copies.length > 0 ? `(${copies.length})` : ""}
        </span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div className="px-5 pb-4 space-y-3">
          {canManage && (
            <Button type="button" size="sm" variant="outline" onClick={handleGenerate} disabled={isPending}>
              {isPending
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Generando…</>
                : <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generar copy</>
              }
            </Button>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando…
            </div>
          )}

          {!loading && copies && copies.length === 0 && (
            <p className="text-xs text-muted-foreground">Sin copies generados todavía.</p>
          )}

          {copies && copies.length > 0 && (
            <div className="space-y-2">
              {copies.map((c) => (
                <div key={c.id} className="rounded-lg border bg-background p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 text-xs flex-1 min-w-0">
                      {c.hook && <p className="font-semibold">{c.hook}</p>}
                      {c.copy && <p className="text-muted-foreground whitespace-pre-line">{c.copy}</p>}
                      {c.cta && <p className="font-medium text-primary">{c.cta}</p>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopy(c)}>
                        {copiedId === c.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </Button>
                      {canManage && (
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(c.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {c.source !== "generated" && (
                    <p className="text-[10px] text-muted-foreground">Variante: {c.source === "shorter" ? "más corto" : c.source === "longer" ? "más largo" : "más enriquecido"}</p>
                  )}
                  {canManage && (
                    <div className="flex gap-1.5">
                      {REFINEMENT_LABELS.map(({ key, label }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => handleRefine(c.id, key)}
                          disabled={refiningId === c.id}
                          className="text-[10px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                        >
                          {refiningId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
