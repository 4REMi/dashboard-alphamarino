"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import type { TrackedBrand, AdBoard, MetaAdResult, InstagramPostResult } from "@/lib/types"
import {
  startMetaAdsSearch, getMetaAdsRunStatus, getMetaAdsDatasetPage,
  saveAd, addAdToBoard, searchOrganicPosts, saveOrganicPost,
} from "@/lib/actions/ad-lab"
import { AdCard } from "@/components/ad-lab/ad-card"
import { AdDetailModal } from "@/components/ad-lab/ad-detail-modal"
import { OrganicPostCard } from "@/components/ad-lab/organic-post-card"
import {
  Search, LayoutGrid, ArrowLeft, ChevronDown,
  Loader2, AlertCircle, Radio, Tv2, Upload,
} from "lucide-react"
import { SiInstagram } from "@icons-pack/react-simple-icons"
import Link from "next/link"
import { UploadAdModal } from "@/components/ad-lab/upload-ad-modal"

interface Props {
  trackedBrands: TrackedBrand[]
  boards: AdBoard[]
}

type FilterTab    = "all" | "tracked"
type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE"
type SearchStatus = "idle" | "starting" | "running" | "ready" | "failed"
type SourceMode   = "ads" | "organic"

const PAGE_SIZE = 24

export function DiscoveryShell({ trackedBrands, boards }: Props) {
  // ── Ads vs. Organic toggle ────────────────────────────────────
  const [mode, setMode] = useState<SourceMode>("ads")

  // ── Organic (Instagram) search ─────────────────────────────────
  const [igUsername,      setIgUsername]      = useState("")
  const [organicStatus,   setOrganicStatus]   = useState<SearchStatus>("idle")
  const [organicError,    setOrganicError]    = useState<string | null>(null)
  const [organicResults,  setOrganicResults]  = useState<InstagramPostResult[]>([])
  const [organicSavingId, setOrganicSavingId] = useState<string | null>(null)

  async function runOrganicSearch(username: string) {
    const handle = username.trim()
    if (!handle) return
    setOrganicStatus("starting")
    setOrganicError(null)
    setOrganicResults([])
    try {
      setOrganicStatus("running")
      const items = await searchOrganicPosts({ username: handle, limit: 24 })
      setOrganicResults(items)
      setOrganicStatus("ready")
    } catch (err) {
      setOrganicError(err instanceof Error ? err.message : "Error al buscar posts")
      setOrganicStatus("failed")
    }
  }

  async function handleSaveOrganicToBoard(post: InstagramPostResult, boardId: string) {
    setOrganicSavingId(post.shortCode)
    try {
      const saved = await saveOrganicPost(post)
      await addAdToBoard(boardId, saved.id)
    } catch (err) {
      setOrganicError(err instanceof Error ? err.message : "No se pudo guardar el post")
      throw err // let the card know the save failed too
    } finally {
      setOrganicSavingId(null)
    }
  }

  // ── Search inputs ──────────────────────────────────────────────
  const [query,          setQuery]          = useState("")
  const [selectedPageId, setSelectedPageId] = useState("")
  const [statusFilter,   setStatusFilter]   = useState<StatusFilter>("ALL")
  const [tab,              setTab]              = useState<FilterTab>("all")

  // ── Async run state ────────────────────────────────────────────
  const [searchStatus,    setSearchStatus]    = useState<SearchStatus>("idle")
  const [error,           setError]           = useState<string | null>(null)
  const [results,         setResults]         = useState<MetaAdResult[]>([])
  const [offset,          setOffset]          = useState(0)
  const [hasMore,         setHasMore]         = useState(false)
  const [isLoadingMore,   setIsLoadingMore]   = useState(false)
  const [itemCount,       setItemCount]       = useState<number | null>(null)

  // ── UI state ───────────────────────────────────────────────────
  const [savingId,     setSavingId]     = useState<string | null>(null)
  const [detailAd,     setDetailAd]     = useState<MetaAdResult | null>(null)
  const [showUpload,   setShowUpload]   = useState(false)

  // ── Refs ───────────────────────────────────────────────────────
  const activeRunRef    = useRef<string | null>(null)  // cancels stale polls
  const datasetIdRef    = useRef<string | null>(null)
  const offsetRef       = useRef(0)
  const hasMoreRef      = useRef(false)
  const isLoadingRef    = useRef(false)
  const sentinelRef     = useRef<HTMLDivElement>(null)
  // When true the current search was triggered by a specific pageId — results are
  // already scoped to that page so the tracked-brands filter must be skipped.
  const searchByPageIdRef = useRef(false)

  // ── Core search flow ───────────────────────────────────────────

  async function pollRun(runId: string, datasetId: string) {
    if (activeRunRef.current !== runId) return // stale poll — new search started

    try {
      const { status, itemCount: count } = await getMetaAdsRunStatus(runId)
      if (activeRunRef.current !== runId) return

      if (status === "SUCCEEDED") {
        setItemCount(count)
        const firstPage = await getMetaAdsDatasetPage(datasetId, 0, PAGE_SIZE)
        if (activeRunRef.current !== runId) return
        setResults(firstPage)
        offsetRef.current = firstPage.length
        setOffset(firstPage.length)
        hasMoreRef.current = firstPage.length === PAGE_SIZE
        setHasMore(firstPage.length === PAGE_SIZE)
        setSearchStatus("ready")
      } else if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
        setError("La búsqueda falló. Intenta de nuevo.")
        setSearchStatus("failed")
      } else {
        // Still RUNNING or READY — poll again in 3s
        if (count > 0) setItemCount(count)
        setTimeout(() => pollRun(runId, datasetId), 3000)
      }
    } catch {
      if (activeRunRef.current !== runId) return
      setError("Error al verificar el estado de la búsqueda.")
      setSearchStatus("failed")
    }
  }

  async function runSearch(params: { query?: string; pageId?: string }) {
    const q      = params.query?.trim()
    const pageId = params.pageId || undefined
    if (!q && !pageId) return

    // Reset state
    activeRunRef.current    = null
    datasetIdRef.current    = null
    offsetRef.current       = 0
    hasMoreRef.current      = false
    isLoadingRef.current    = false
    searchByPageIdRef.current = !!pageId
    setSearchStatus("starting")
    setResults([])
    setOffset(0)
    setHasMore(false)
    setItemCount(null)
    setError(null)

    try {
      const { runId, datasetId } = await startMetaAdsSearch({
        query:   pageId ? undefined : q,
        pageId,
        status:  statusFilter,
      })
      activeRunRef.current = runId
      datasetIdRef.current = datasetId
      setSearchStatus("running")
      pollRun(runId, datasetId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar búsqueda")
      setSearchStatus("failed")
    }
  }

  function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    runSearch({ query: query.trim(), pageId: selectedPageId })
  }

  function handleBrandClick(brand: TrackedBrand) {
    setSelectedPageId(brand.meta_page_id ?? "")
    setQuery(brand.name)
    setTab("tracked")
    runSearch({ pageId: brand.meta_page_id ?? undefined, query: !brand.meta_page_id ? brand.name : undefined })
  }

  // ── Load more ──────────────────────────────────────────────────

  const loadMore = useCallback(async () => {
    if (isLoadingRef.current || !hasMoreRef.current || !datasetIdRef.current) return
    isLoadingRef.current = true
    setIsLoadingMore(true)
    try {
      const nextPage = await getMetaAdsDatasetPage(datasetIdRef.current, offsetRef.current, PAGE_SIZE)
      setResults((prev) => [...prev, ...nextPage])
      offsetRef.current += nextPage.length
      setOffset((v) => v + nextPage.length)
      hasMoreRef.current = nextPage.length === PAGE_SIZE
      setHasMore(nextPage.length === PAGE_SIZE)
    } catch {
      // silent — user can scroll again to retry
    } finally {
      isLoadingRef.current = false
      setIsLoadingMore(false)
    }
  }, []) // refs keep this stable

  // ── IntersectionObserver for sentinel ──────────────────────────

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || searchStatus !== "ready") return

    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore() },
      { rootMargin: "300px" },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [searchStatus, loadMore])

  // ── Save / board ───────────────────────────────────────────────

  async function handleSaveToBoard(ad: MetaAdResult, boardId: string) {
    setSavingId(ad.ad_archive_id)
    try {
      const snap      = ad.snapshot
      const card      = snap?.cards?.[0]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const videoItem = (snap as any)?.videos?.[0]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const imageItem = (snap as any)?.images?.[0]
      const imageUrl  = card?.resized_image_url ?? card?.original_image_url
        ?? imageItem?.resized_image_url ?? imageItem?.original_image_url ?? null
      const videoUrl  = card?.video_hd_url ?? card?.video_sd_url
        ?? videoItem?.video_hd_url ?? videoItem?.video_sd_url ?? null
      const toDate   = (ts: number | null) =>
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
        ad_snapshot:       ad,
      })
      await addAdToBoard(boardId, saved.id)
    } finally {
      setSavingId(null)
    }
  }

  // ── Filtered results ───────────────────────────────────────────
  // When the search was triggered by a specific pageId the API already scoped
  // results to that page — applying a brand-matching filter on top would
  // discard all results when page_id types differ (string vs number from Apify).

  const activeResults = tab === "all" || searchByPageIdRef.current
    ? results
    : results.filter((r) =>
        trackedBrands.some((b) =>
          String(b.meta_page_id) === String(r.page_id) ||
          b.name.toLowerCase() === (r.page_name ?? "").toLowerCase()
        )
      )

  const isSearching = searchStatus === "starting" || searchStatus === "running"
  const hasSearched = searchStatus !== "idle"

  // ── Render ─────────────────────────────────────────────────────

  return (
    <>
      {detailAd && (
        <AdDetailModal ad={detailAd} boards={boards} onClose={() => setDetailAd(null)} />
      )}
      {showUpload && (
        <UploadAdModal
          boards={boards}
          onClose={() => setShowUpload(false)}
        />
      )}

      <div className="flex flex-col h-full min-h-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3 mb-5">
            <Link href="/ad-lab" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <LayoutGrid className="w-4.5 h-4.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold tracking-tight">Discovery</h1>
              <p className="text-sm text-muted-foreground">
                {mode === "ads" ? "Busca anuncios de competidores en Meta Ads Library" : "Busca posts orgánicos de una cuenta de Instagram"}
              </p>
            </div>
            <div className="flex items-center gap-0.5 rounded-full bg-muted p-0.5 flex-shrink-0">
              {(["ads", "organic"] as SourceMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "ads" ? "Ads" : "Orgánico"}
                </button>
              ))}
            </div>
            {mode === "ads" && (
              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-2 h-9 px-4 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
              >
                <Upload className="w-3.5 h-3.5" />
                Subir
              </button>
            )}
          </div>

          {/* Search bar — Instagram (organic) */}
          {mode === "organic" && (
            <form onSubmit={(e) => { e.preventDefault(); runOrganicSearch(igUsername) }} className="flex gap-2">
              <div className="relative flex-1">
                <SiInstagram className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  value={igUsername}
                  onChange={(e) => setIgUsername(e.target.value)}
                  placeholder="usuario_de_instagram (sin @)"
                  className="w-full pl-9 pr-4 h-10 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-transparent"
                />
              </div>
              <button
                type="submit"
                disabled={organicStatus === "starting" || organicStatus === "running" || !igUsername.trim()}
                className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {(organicStatus === "starting" || organicStatus === "running") ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Buscar
              </button>
            </form>
          )}

          {/* Quick access — tracked brands with an Instagram handle */}
          {mode === "organic" && trackedBrands.some((b) => b.instagram_handle) && (
            <div className="mt-4 flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground">Acceso rápido:</span>
              {trackedBrands.filter((b) => b.instagram_handle).slice(0, 6).map((brand) => (
                <button
                  key={brand.id}
                  onClick={() => { setIgUsername(brand.instagram_handle!); runOrganicSearch(brand.instagram_handle!) }}
                  disabled={organicStatus === "starting" || organicStatus === "running"}
                  className="text-xs px-2.5 py-1 rounded-lg border border-border hover:border-primary/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {brand.name}
                </button>
              ))}
            </div>
          )}

          {/* Search bar — Ads */}
          {mode === "ads" && (
          <>
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); if (!e.target.value) setSelectedPageId("") }}
                placeholder="Busca una marca o término…"
                className="w-full pl-9 pr-4 h-10 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-transparent"
              />
            </div>
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
              disabled={isSearching || (!query.trim() && !selectedPageId)}
              className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Buscar
            </button>
          </form>

          {/* Filter tabs + quick brand pills */}
          <div className="mt-4 flex items-center gap-4 flex-wrap">
            <div className="flex gap-1">
              {(["all", "tracked"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {t === "all" ? "Todos" : "Marcas trackeadas"}
                </button>
              ))}
            </div>
            {trackedBrands.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground">Acceso rápido:</span>
                {trackedBrands.slice(0, 6).map((brand) => (
                  <button
                    key={brand.id}
                    onClick={() => handleBrandClick(brand)}
                    disabled={isSearching}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50 ${
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
          </>
          )}
        </div>

        {/* Content — Ads */}
        {mode === "ads" && (
        <div className="flex-1 overflow-y-auto px-6 py-6">

          {/* Starting */}
          {searchStatus === "starting" && (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Iniciando búsqueda…</p>
            </div>
          )}

          {/* Running — show progress */}
          {searchStatus === "running" && (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Buscando en Meta Ads Library…</p>
              {itemCount !== null && itemCount > 0 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {itemCount} anuncio{itemCount !== 1 ? "s" : ""} encontrado{itemCount !== 1 ? "s" : ""} hasta ahora
                </p>
              )}
            </div>
          )}

          {/* Error */}
          {searchStatus === "failed" && error && (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 max-w-xl mx-auto mt-8">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Error al buscar</p>
                <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Empty — not searched */}
          {searchStatus === "idle" && (
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
          {searchStatus === "ready" && activeResults.length === 0 && (
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
          {searchStatus === "ready" && activeResults.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground mb-4">
                {itemCount ?? activeResults.length} anuncio{(itemCount ?? activeResults.length) !== 1 ? "s" : ""} encontrado{(itemCount ?? activeResults.length) !== 1 ? "s" : ""}
                {activeResults.length < (itemCount ?? activeResults.length) && (
                  <span> — mostrando {activeResults.length}</span>
                )}
              </p>

              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {activeResults.map((ad) => (
                  <AdCard
                    key={ad.ad_archive_id}
                    ad={ad}
                    boards={boards}
                    savingId={savingId}
                    onSaveToBoard={handleSaveToBoard}
                    onOpenDetail={setDetailAd}
                  />
                ))}
              </div>

              {/* Sentinel + load more indicator */}
              <div ref={sentinelRef} className="mt-8 flex justify-center">
                {isLoadingMore && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cargando más anuncios…
                  </div>
                )}
                {!hasMore && !isLoadingMore && activeResults.length > PAGE_SIZE && (
                  <p className="text-xs text-muted-foreground py-4">
                    Fin de los resultados · {activeResults.length} anuncios
                  </p>
                )}
              </div>
            </>
          )}
        </div>
        )}

        {/* Content — Organic (Instagram) */}
        {mode === "organic" && (
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {(organicStatus === "starting" || organicStatus === "running") && (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Buscando posts en Instagram…</p>
            </div>
          )}

          {organicStatus === "failed" && organicError && (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 max-w-xl mx-auto mt-8">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Error al buscar</p>
                <p className="text-xs text-muted-foreground mt-0.5">{organicError}</p>
              </div>
            </div>
          )}

          {organicStatus === "ready" && organicError && (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 mb-4">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-medium text-destructive">No se pudo guardar</p>
                <p className="text-xs text-muted-foreground mt-0.5">{organicError}</p>
              </div>
              <button onClick={() => setOrganicError(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
            </div>
          )}

          {organicStatus === "idle" && (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <SiInstagram className="w-7 h-7 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold">Busca una cuenta de Instagram para empezar</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Escribe el usuario (sin @) o usa los accesos rápidos de marcas trackeadas.
                </p>
              </div>
            </div>
          )}

          {organicStatus === "ready" && organicResults.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
                <Search className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold">Sin resultados</p>
                <p className="text-xs text-muted-foreground mt-1">Verifica el usuario e intenta de nuevo.</p>
              </div>
            </div>
          )}

          {organicStatus === "ready" && organicResults.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground mb-4">
                {organicResults.length} post{organicResults.length !== 1 ? "s" : ""} encontrado{organicResults.length !== 1 ? "s" : ""}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {organicResults.map((post) => (
                  <OrganicPostCard
                    key={post.shortCode || post.id}
                    post={post}
                    boards={boards}
                    savingId={organicSavingId}
                    onSaveToBoard={handleSaveOrganicToBoard}
                    onOpenDetail={(p) => { if (p.url) window.open(p.url, "_blank", "noopener,noreferrer") }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        )}
      </div>
    </>
  )
}
