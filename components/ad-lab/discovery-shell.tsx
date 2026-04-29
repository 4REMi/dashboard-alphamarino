"use client"

import { useState, useTransition, useRef, useCallback } from "react"
import type { TrackedBrand, AdBoard, MetaAdResult, Customer } from "@/lib/types"
import { searchMetaAds, saveAd, addAdToBoard } from "@/lib/actions/ad-lab"
import { AdCard } from "@/components/ad-lab/ad-card"
import {
  Search, LayoutGrid, ArrowLeft, Filter, ChevronDown,
  Loader2, AlertCircle, Radio, Tv2,
} from "lucide-react"
import Link from "next/link"

interface Props {
  trackedBrands: TrackedBrand[]
  boards: AdBoard[]
  customers: Pick<Customer, "id" | "name" | "company">[]
}

type FilterTab = "all" | "tracked"
type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE"

export function DiscoveryShell({ trackedBrands, boards, customers }: Props) {
  const [results, setResults]         = useState<MetaAdResult[]>([])
  const [query, setQuery]             = useState("")
  const [selectedPageId, setSelectedPageId] = useState<string>("")
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("")
  const [tab, setTab]                 = useState<FilterTab>("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL")
  const [hasSearched, setHasSearched] = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [isPending, startTransition]  = useTransition()
  const [savingId, setSavingId]       = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Brands filtered by selected customer
  const filteredBrands = selectedCustomerId
    ? trackedBrands.filter((b) => b.customer_id === selectedCustomerId)
    : trackedBrands

  function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    const q = query.trim()
    const pageId = selectedPageId || undefined
    if (!q && !pageId) return

    setError(null)
    setHasSearched(true)
    startTransition(async () => {
      try {
        const data = await searchMetaAds({
          query:   pageId ? undefined : q,
          pageId,
          status:  statusFilter,
        })
        setResults(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al buscar anuncios")
        setResults([])
      }
    })
  }

  function handleBrandClick(brand: TrackedBrand) {
    setSelectedPageId(brand.meta_page_id ?? "")
    setQuery(brand.name)
    setTab("tracked")
    // Auto-search
    setError(null)
    setHasSearched(true)
    startTransition(async () => {
      try {
        const data = await searchMetaAds({
          pageId: brand.meta_page_id ?? undefined,
          query:  !brand.meta_page_id ? brand.name : undefined,
          status: statusFilter,
        })
        setResults(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al buscar anuncios")
        setResults([])
      }
    })
  }

  async function handleSaveToBoard(ad: MetaAdResult, boardId: string) {
    setSavingId(ad.ad_archive_id)
    try {
      const card      = ad.snapshot?.cards?.[0]
      const imageUrl  = card?.resized_image_url || card?.original_image_url || null
      const videoUrl  = card?.video_hd_url || card?.video_sd_url || null
      const toDate    = (ts: number | null) =>
        ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null

      const saved = await saveAd({
        ad_archive_id:     ad.ad_archive_id,
        page_id:           ad.page_id,
        page_name:         ad.page_name,
        body:              ad.snapshot?.body?.text || card?.body || null,
        image_url:         imageUrl,
        video_url:         videoUrl,
        snapshot_url:      ad.ad_library_url ?? null,
        start_date:        toDate(ad.start_date),
        end_date:          toDate(ad.end_date),
        status:            ad.is_active ? "active" : "inactive",
        platforms:         (ad.publisher_platform ?? []).map((p) => p.toLowerCase()),
        spend_lower:       ad.spend?.lower_bound ?? null,
        spend_upper:       ad.spend?.upper_bound ?? null,
        impressions_lower: null,
        impressions_upper: null,
        currency:          ad.currency || "MXN",
      })
      await addAdToBoard(boardId, saved.id)
    } finally {
      setSavingId(null)
    }
  }

  const activeResults = tab === "all"
    ? results
    : results.filter((r) => {
        const brand = trackedBrands.find((b) =>
          b.meta_page_id === r.page_id || b.name.toLowerCase() === r.page_name.toLowerCase()
        )
        return !!brand
      })

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3 mb-5">
          <Link
            href="/ad-lab"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <LayoutGrid className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Discovery</h1>
            <p className="text-sm text-muted-foreground">
              Busca anuncios de competidores en Meta Ads Library
            </p>
          </div>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                if (!e.target.value) setSelectedPageId("")
              }}
              placeholder="Busca una marca o término…"
              className="w-full pl-9 pr-4 h-10 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-transparent"
            />
          </div>

          {/* Status filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="h-10 pl-3 pr-8 rounded-xl border border-border bg-background text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
            >
              <option value="ALL">Todos</option>
              <option value="ACTIVE">Activos</option>
              <option value="INACTIVE">Inactivos</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>

          <button
            type="submit"
            disabled={isPending || (!query.trim() && !selectedPageId)}
            className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Buscar
          </button>
        </form>

        {/* Filter tabs + tracked brand shortcuts */}
        <div className="mt-4 flex items-center gap-4 flex-wrap">
          <div className="flex gap-1">
            {(["all", "tracked"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  tab === t
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {t === "all" ? "Todos" : "Marcas trackeadas"}
              </button>
            ))}
          </div>

          {/* Quick brand pills */}
          {trackedBrands.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground">Acceso rápido:</span>
              {/* Customer filter */}
              {customers.length > 1 && (
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="text-xs h-7 px-2 rounded-lg border border-border bg-background appearance-none focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
                >
                  <option value="">Todos los clientes</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.company || c.name}</option>
                  ))}
                </select>
              )}
              {filteredBrands.slice(0, 6).map((brand) => (
                <button
                  key={brand.id}
                  onClick={() => handleBrandClick(brand)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                    selectedPageId === brand.meta_page_id && selectedPageId
                      ? "border-primary/50 bg-primary/10 text-primary font-medium"
                      : "border-border hover:border-primary/30 hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {brand.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* Loading */}
        {isPending && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Buscando en Meta Ads Library…</p>
          </div>
        )}

        {/* Error */}
        {!isPending && error && (
          <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 max-w-xl mx-auto mt-8">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Error al buscar</p>
              <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Empty — not searched yet */}
        {!isPending && !error && !hasSearched && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
              <Tv2 className="w-7 h-7 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold">Busca una marca para empezar</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Escribe el nombre de una marca o usa los accesos rápidos de marcas trackeadas.
              </p>
            </div>
            {trackedBrands.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {trackedBrands.slice(0, 4).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => handleBrandClick(b)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors"
                  >
                    <Radio className="w-3 h-3 text-primary" />
                    {b.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty results */}
        {!isPending && !error && hasSearched && activeResults.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
              <Search className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold">Sin resultados</p>
              <p className="text-xs text-muted-foreground mt-1">
                Intenta con otro término o cambia el filtro de estado.
              </p>
            </div>
          </div>
        )}

        {/* Results grid */}
        {!isPending && !error && activeResults.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground mb-4">
              {activeResults.length} anuncio{activeResults.length !== 1 ? "s" : ""} encontrado{activeResults.length !== 1 ? "s" : ""}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {activeResults.map((ad) => (
                <AdCard
                  key={ad.ad_archive_id}
                  ad={ad}
                  boards={boards}
                  savingId={savingId}
                  onSaveToBoard={handleSaveToBoard}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
