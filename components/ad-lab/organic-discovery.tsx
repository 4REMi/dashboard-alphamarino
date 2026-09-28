"use client"

import { useEffect, useMemo, useState } from "react"
import type { AdBoard, InstagramPostResult, SavedAd, TrackedBrand, AccountSuggestion } from "@/lib/types"
import {
  searchOrganicPosts, saveOrganicPost, addAdToBoard, searchInstagramAccountSuggestions,
  getSavedCreators, saveCreator, deleteCreator, touchCreator, type SavedCreator,
} from "@/lib/actions/ad-lab"
import { OrganicPostCard } from "@/components/ad-lab/organic-post-card"
import { OrganicPostDetailModal } from "@/components/ad-lab/organic-post-detail-modal"
import { SiInstagram } from "@icons-pack/react-simple-icons"
import { Search, Loader2, RefreshCw, Bookmark, BookmarkCheck, Pin, TrendingUp, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

// Discovery orgánico (feed de Instagram):
//  - Creadores guardados (fila de avatares) — separados de tracked_brands.
//  - Orden cronológico real (los fijados se marcan 📌 y se pueden ocultar),
//    o por likes, comentarios o "Destacados" (rinden ≥2× la mediana del perfil).
//  - Filtro por tipo, cantidad (24/50/100) y rango de fechas.
//  - Caché de 24 h por perfil ("actualizado hace X" + Actualizar).
//  - Click abre el visor dentro del dashboard (clonar slide/carrusel)
//    sin tener que guardarlo antes en un board.

type Sort = "recent" | "likes" | "comments" | "top"
type TypeFilter = "all" | "Video" | "Sidecar" | "Image"

const SORTS: { k: Sort; label: string }[] = [
  { k: "recent", label: "Recientes" },
  { k: "top", label: "Destacados" },
  { k: "likes", label: "Más likes" },
  { k: "comments", label: "Más comentarios" },
]
const TYPES: { k: TypeFilter; label: string }[] = [
  { k: "all", label: "Todos" },
  { k: "Video", label: "Reels" },
  { k: "Sidecar", label: "Carruseles" },
  { k: "Image", label: "Imágenes" },
]

const engagement = (p: InstagramPostResult) => (p.likesCount ?? 0) + (p.commentsCount ?? 0) * 3
function median(xs: number[]) {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (min < 1) return "hace un momento"
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`
}

export function OrganicDiscovery({ trackedBrands, boards }: { trackedBrands: TrackedBrand[]; boards: AdBoard[] }) {
  const [handle, setHandle] = useState("")
  const [current, setCurrent] = useState<string | null>(null)
  const [limit, setLimit] = useState(24)
  const [sinceDays, setSinceDays] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [posts, setPosts] = useState<InstagramPostResult[]>([])
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>("recent")
  const [type, setType] = useState<TypeFilter>("all")
  const [hidePinned, setHidePinned] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SavedAd | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)

  const [creators, setCreators] = useState<SavedCreator[]>([])
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<AccountSuggestion[]>([])
  const [suggestOpen, setSuggestOpen] = useState(false)

  useEffect(() => { getSavedCreators().then(setCreators) }, [])

  useEffect(() => {
    const q = handle.trim()
    if (q.length < 2 || q === current) { setSuggestions([]); return }
    const t = setTimeout(() => { searchInstagramAccountSuggestions(q).then(setSuggestions).catch(() => setSuggestions([])) }, 400)
    return () => clearTimeout(t)
  }, [handle, current])

  async function load(h: string, opts?: { force?: boolean; limit?: number; sinceDays?: number }) {
    const clean = h.trim().replace(/^@/, "").toLowerCase()
    if (!clean) return
    setHandle(clean); setCurrent(clean); setSuggestOpen(false)
    setLoading(true); setError(null)
    try {
      const r = await searchOrganicPosts({ username: clean, limit: opts?.limit ?? limit, sinceDays: opts?.sinceDays ?? sinceDays, force: opts?.force })
      setPosts(r.items); setFetchedAt(r.fetchedAt)
      touchCreator(clean).catch(() => {})
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al buscar posts")
      setPosts([])
    } finally {
      setLoading(false)
    }
  }

  const creator = creators.find((c) => c.instagram_handle === current) ?? null
  const owner = posts[0]
  async function toggleSaveCreator() {
    if (!current) return
    try {
      if (creator) {
        await deleteCreator(creator.id)
        setCreators((cs) => cs.filter((c) => c.id !== creator.id))
      } else {
        const tag = window.prompt("Etiqueta opcional (ej. Inspiración UGC, Fitness). Déjalo vacío para ninguna.", "") ?? null
        const saved = await saveCreator({ handle: current, displayName: owner?.ownerFullName ?? null, avatarUrl: null, tag })
        setCreators((cs) => [saved, ...cs.filter((c) => c.id !== saved.id)])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const med = useMemo(() => median(posts.filter((p) => !p.isPinned).map(engagement)), [posts])
  const shown = useMemo(() => {
    let list = posts.filter((p) => (type === "all" ? true : p.type === type) && !(hidePinned && p.isPinned))
    const byDate = (a: InstagramPostResult, b: InstagramPostResult) => Date.parse(b.timestamp ?? "0") - Date.parse(a.timestamp ?? "0")
    if (sort === "recent") list = [...list].sort(byDate)
    if (sort === "likes") list = [...list].sort((a, b) => (b.likesCount ?? 0) - (a.likesCount ?? 0))
    if (sort === "comments") list = [...list].sort((a, b) => (b.commentsCount ?? 0) - (a.commentsCount ?? 0))
    if (sort === "top") list = list.filter((p) => med > 0 && engagement(p) >= 2 * med).sort((a, b) => engagement(b) - engagement(a))
    return list
  }, [posts, type, hidePinned, sort, med])
  const topCount = posts.filter((p) => med > 0 && engagement(p) >= 2 * med).length

  async function saveToBoard(post: InstagramPostResult, boardId: string) {
    setSavingId(post.shortCode)
    try {
      const saved = await saveOrganicPost(post)
      await addAdToBoard(boardId, saved.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el post")
      throw e
    } finally {
      setSavingId(null)
    }
  }

  // El visor (y clonar) trabaja sobre un post guardado: se guarda al vuelo
  // (upsert, sin board) al abrirlo.
  async function openDetail(post: InstagramPostResult) {
    setOpeningId(post.shortCode)
    try { setDetail(await saveOrganicPost(post)) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setOpeningId(null) }
  }

  const tags = [...new Set(creators.map((c) => c.tag).filter(Boolean) as string[])]
  const visibleCreators = tagFilter ? creators.filter((c) => c.tag === tagFilter) : creators
  const quickBrands = trackedBrands.filter((b) => b.instagram_handle)

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Búsqueda + creadores */}
      <div className="px-6 pt-5 pb-4 border-b border-border space-y-4">
        <form onSubmit={(e) => { e.preventDefault(); load(handle) }} className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <SiInstagram className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input value={handle} onChange={(e) => setHandle(e.target.value)} onFocus={() => setSuggestOpen(true)} onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
              placeholder="usuario_de_instagram (sin @)" autoComplete="off"
              className="w-full pl-9 pr-4 h-10 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            {suggestOpen && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-xl border border-border bg-popover shadow-lg z-30 max-h-72 overflow-y-auto">
                {suggestions.map((s) => (
                  <button key={s.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => s.handle && load(s.handle)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {s.thumbnail ? <img src={s.thumbnail} alt="" className="w-6 h-6 rounded-full object-cover" /> : <span className="w-6 h-6 rounded-full bg-muted" />}
                    <span className="min-w-0"><span className="block text-xs font-medium truncate">{s.name}</span>{s.handle && <span className="block text-[11px] text-muted-foreground">@{s.handle}</span>}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} title="Cuántos posts traer" className="h-10 rounded-xl border border-border bg-background px-2 text-sm">
            {[24, 50, 100].map((n) => <option key={n} value={n}>{n} posts</option>)}
          </select>
          <select value={sinceDays} onChange={(e) => setSinceDays(Number(e.target.value))} title="Rango de fechas" className="h-10 rounded-xl border border-border bg-background px-2 text-sm">
            <option value={0}>Todo</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>
          <button type="submit" disabled={loading || !handle.trim()} className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}Buscar
          </button>
        </form>

        {(creators.length > 0 || quickBrands.length > 0) && (
          <div className="space-y-2">
            {creators.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-muted-foreground">Creadores</span>
                {tags.length > 0 && (
                  <>
                    <button onClick={() => setTagFilter(null)} className={cn("text-[11px] px-2 py-0.5 rounded-full", !tagFilter ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>Todos</button>
                    {tags.map((t) => <button key={t} onClick={() => setTagFilter(tagFilter === t ? null : t)} className={cn("text-[11px] px-2 py-0.5 rounded-full", tagFilter === t ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>{t}</button>)}
                    <span className="w-px h-4 bg-border" />
                  </>
                )}
                {visibleCreators.map((c) => (
                  <button key={c.id} onClick={() => load(c.instagram_handle)} disabled={loading}
                    className={cn("inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border text-xs transition-colors disabled:opacity-50",
                      current === c.instagram_handle ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>
                    <span className="w-5 h-5 rounded-full bg-gradient-to-br from-pink-500 to-amber-400 text-white text-[9px] font-bold flex items-center justify-center">{c.instagram_handle[0]?.toUpperCase()}</span>
                    {c.display_name || `@${c.instagram_handle}`}
                  </button>
                ))}
              </div>
            )}
            {quickBrands.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground">Marcas:</span>
                {quickBrands.map((b) => (
                  <button key={b.id} onClick={() => load(b.instagram_handle!)} disabled={loading}
                    className="text-xs px-2.5 py-1 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50">{b.name}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-6 py-5">
        {error && <p className="mb-4 text-sm text-red-600 flex items-start gap-1.5"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}</p>}

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Buscando posts en Instagram…</p>
          </div>
        )}

        {!loading && !current && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center"><SiInstagram className="w-7 h-7 text-muted-foreground" /></div>
            <div>
              <p className="text-sm font-semibold">Busca una cuenta de Instagram para empezar</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">Escribe el usuario o elige uno de tus creadores guardados.</p>
            </div>
          </div>
        )}

        {!loading && current && (
          <>
            {/* Encabezado del perfil */}
            <div className="flex items-center gap-3 flex-wrap mb-4">
              <div className="min-w-0">
                <p className="text-base font-semibold">{owner?.ownerFullName || `@${current}`}</p>
                <p className="text-xs text-muted-foreground">
                  <a href={`https://instagram.com/${current}`} target="_blank" rel="noopener noreferrer" className="hover:underline">@{current}</a>
                  {" · "}{posts.length} posts{fetchedAt && ` · actualizado ${ago(fetchedAt)}`}
                </p>
              </div>
              <button onClick={toggleSaveCreator} className={cn("inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium", creator ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>
                {creator ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}{creator ? "Creador guardado" : "Guardar creador"}
              </button>
              <button onClick={() => load(current, { force: true })} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs hover:bg-muted" title="Volver a traer de Instagram">
                <RefreshCw className="w-3.5 h-3.5" />Actualizar
              </button>
            </div>

            {/* Orden y filtros */}
            {posts.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mb-4 text-xs">
                <div className="flex items-center bg-muted rounded-lg p-0.5">
                  {SORTS.map((s) => (
                    <button key={s.k} onClick={() => setSort(s.k)} className={cn("px-2.5 py-1 rounded-md font-medium", sort === s.k ? "bg-background shadow-sm" : "text-muted-foreground")}>
                      {s.label}{s.k === "top" && topCount > 0 && <span className="ml-1 text-emerald-600">{topCount}</span>}
                    </button>
                  ))}
                </div>
                <div className="flex items-center bg-muted rounded-lg p-0.5">
                  {TYPES.map((t) => (
                    <button key={t.k} onClick={() => setType(t.k)} className={cn("px-2.5 py-1 rounded-md font-medium", type === t.k ? "bg-background shadow-sm" : "text-muted-foreground")}>
                      {t.label} <span className="opacity-60">{t.k === "all" ? posts.length : posts.filter((p) => p.type === t.k).length}</span>
                    </button>
                  ))}
                </div>
                {posts.some((p) => p.isPinned) && (
                  <label className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <input type="checkbox" checked={hidePinned} onChange={(e) => setHidePinned(e.target.checked)} />Ocultar fijados
                  </label>
                )}
                {sort === "top" && <span className="text-muted-foreground">Posts con ≥2× el engagement mediano del perfil.</span>}
              </div>
            )}

            {shown.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-16">{posts.length ? "Ningún post con estos filtros." : "Sin resultados — verifica el usuario."}</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {shown.map((post) => {
                  const x = med > 0 ? engagement(post) / med : 0
                  return (
                    <div key={post.shortCode || post.id} className="relative">
                      <OrganicPostCard
                        post={post} boards={boards} savingId={savingId}
                        onSaveToBoard={saveToBoard} onOpenDetail={openDetail}
                        badges={<>
                          {post.isPinned && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-black/70 text-white px-1.5 py-0.5 rounded"><Pin className="w-2.5 h-2.5" />Fijado</span>}
                          {x >= 2 && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-emerald-500 text-white px-1.5 py-0.5 rounded"><TrendingUp className="w-2.5 h-2.5" />{x.toFixed(1)}×</span>}
                        </>}
                      />
                      {openingId === (post.shortCode) && (
                        <div className="absolute inset-0 rounded-xl bg-background/60 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {detail && <OrganicPostDetailModal post={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
