"use client"

import { useState, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getMetaCampaignsHistory, getMetaAdSets, getMetaAds, importMetaCreatives,
  type MetaCampaignSummary, type MetaAdCreative,
} from "@/lib/actions/meta"
import { Search, Loader2, Check, ChevronLeft, Film, ImageIcon, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

type Step = "campaigns" | "creatives" | "importing"

interface AdRow {
  campaignId: string
  campaignName: string | null
  adSetId: string
  adSetName: string | null
  ad: MetaAdCreative
}

interface Props {
  projectId: string
  accountId: string
  onClose: () => void
  onImported: () => void
}

function formatMoney(n: number | null) {
  return n == null ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
}

export function MetaImportWizard({ projectId, accountId, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>("campaigns")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [campaigns, setCampaigns] = useState<MetaCampaignSummary[]>([])
  const [search, setSearch] = useState("")
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<string>>(new Set())

  const [adRows, setAdRows] = useState<AdRow[]>([])
  const [selectedAdIds, setSelectedAdIds] = useState<Set<string>>(new Set())

  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null)

  useEffect(() => {
    setLoading(true)
    getMetaCampaignsHistory(accountId)
      .then((res) => {
        if (res.error) setError(res.error)
        setCampaigns(res.campaigns)
      })
      .finally(() => setLoading(false))
  }, [accountId])

  const filteredCampaigns = useMemo(
    () => campaigns.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    [campaigns, search]
  )

  function toggleCampaign(id: string) {
    setSelectedCampaignIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAd(id: string) {
    setSelectedAdIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleGoToCreatives() {
    setError(null)
    setLoading(true)
    setStep("creatives")
    try {
      const selected = campaigns.filter((c) => selectedCampaignIds.has(c.id))
      const rows: AdRow[] = []
      for (const campaign of selected) {
        const { adSets, error: adSetsError } = await getMetaAdSets(campaign.id)
        if (adSetsError) { setError(adSetsError); continue }
        for (const adSet of adSets) {
          const { ads, error: adsError } = await getMetaAds(adSet.id)
          if (adsError) { setError(adsError); continue }
          for (const ad of ads) {
            rows.push({ campaignId: campaign.id, campaignName: campaign.name, adSetId: adSet.id, adSetName: adSet.name, ad })
          }
        }
      }
      setAdRows(rows)
    } finally {
      setLoading(false)
    }
  }

  async function handleImport() {
    setStep("importing")
    setError(null)
    const selectedRows = adRows.filter((r) => selectedAdIds.has(r.ad.id))
    const inputs = selectedRows.map((r) => {
      const campaign = campaigns.find((c) => c.id === r.campaignId)
      return {
        campaignId: r.campaignId,
        campaignName: r.campaignName,
        adSetId: r.adSetId,
        adSetName: r.adSetName,
        ad: r.ad,
        campaignMetrics: {
          spend: campaign?.spend ?? null,
          results: campaign?.results ?? null,
          results_type: campaign?.results_type ?? null,
          date_start: campaign?.date_start ?? null,
          date_stop: campaign?.date_stop ?? null,
        },
      }
    })
    const result = await importMetaCreatives(projectId, inputs)
    setImportResult(result)
    onImported()
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {step === "creatives" && (
              <button type="button" onClick={() => setStep("campaigns")} className="text-muted-foreground hover:text-foreground -ml-1">
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            {step === "campaigns" && "Elegir campañas"}
            {step === "creatives" && "Elegir creativos"}
            {step === "importing" && "Importando…"}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {step === "campaigns" && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar campaña…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5 min-h-[300px]">
              {loading && (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando campañas…
                </div>
              )}
              {!loading && filteredCampaigns.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-12">Sin campañas encontradas.</p>
              )}
              {filteredCampaigns.map((c) => {
                const checked = selectedCampaignIds.has(c.id)
                return (
                  <label
                    key={c.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors",
                      checked ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                    )}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleCampaign(c.id)} className="w-4 h-4 accent-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.status ?? "—"} · {formatMoney(c.spend)} gastado{c.results ? ` · ${c.results} ${c.results_type ?? "resultados"}` : ""}
                      </p>
                    </div>
                  </label>
                )
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleGoToCreatives} disabled={selectedCampaignIds.size === 0 || loading}>
                Siguiente ({selectedCampaignIds.size})
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "creatives" && (
          <>
            <div className="flex-1 overflow-y-auto min-h-[300px]">
              {loading && (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando anuncios…
                </div>
              )}
              {!loading && adRows.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-12">Sin anuncios en las campañas seleccionadas.</p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {adRows.map((row) => {
                  const checked = selectedAdIds.has(row.ad.id)
                  // imageUrl is the full creative; thumbnailUrl is Meta's
                  // deliberately small crop — only fall back to that when
                  // there's nothing else to show.
                  const thumb = row.ad.imageUrl || row.ad.thumbnailUrl
                  return (
                    <button
                      key={row.ad.id}
                      type="button"
                      onClick={() => toggleAd(row.ad.id)}
                      className={cn(
                        "text-left rounded-xl overflow-hidden border-2 transition-all",
                        checked ? "border-primary ring-1 ring-primary" : "border-transparent opacity-80 hover:opacity-100"
                      )}
                    >
                      <div className="relative aspect-square bg-muted">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-6 h-6 text-muted-foreground/40" /></div>
                        )}
                        {row.ad.videoUrl && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <Film className="w-5 h-5 text-white drop-shadow" />
                          </div>
                        )}
                        {checked && (
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                            <Check className="w-3 h-3 text-primary-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="p-1.5">
                        <p className="text-[11px] font-medium truncate">{row.ad.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{row.adSetName}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleImport} disabled={selectedAdIds.size === 0}>
                Importar seleccionados ({selectedAdIds.size})
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "importing" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12">
            {!importResult ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Descargando y guardando creativos…</p>
              </>
            ) : (
              <>
                <Check className="w-6 h-6 text-emerald-500" />
                <p className="text-sm font-medium">{importResult.imported} creativo{importResult.imported !== 1 ? "s" : ""} importado{importResult.imported !== 1 ? "s" : ""}</p>
                {importResult.errors.length > 0 && (
                  <p className="text-xs text-destructive text-center max-w-sm">
                    {importResult.errors.length} fallaron: {importResult.errors.join("; ")}
                  </p>
                )}
                <Button onClick={onClose} className="mt-2">Listo</Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
