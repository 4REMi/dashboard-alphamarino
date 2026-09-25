"use client"

import { useMemo, useState, useTransition } from "react"
import { Loader2, RefreshCw, ImageIcon, Link2, X, ListFilter, Film } from "lucide-react"
import { syncMetaAds, getMetaCampaignOptions } from "@/lib/actions/meta"
import { setSyncedCampaignIds } from "@/lib/actions/projects"
import {
  getCreativePerformance, getLinkableAssets, linkAssetToMetaAd, unlinkAssetFromMetaAd,
  type AdPerformanceCard, type LinkableAsset,
} from "@/lib/actions/paid-media-performance"
import { METRIC_DEFS, type MetricKey } from "@/lib/constants/paid-media-metrics"
import { cn } from "@/lib/utils"

interface Props {
  projectId: string
  cycleId: string
  initialCards: AdPerformanceCard[]
  displayMetrics: MetricKey[]
  savedCampaignIds: string[] | null
  hasCredentials: boolean
  canEdit: boolean
}

type SortMode = "worst_trend" | "spend_desc" | "name_asc"

function fmt$(v: number) {
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
}

// Qué tan "mal" se ve una métrica — 0 si va bien o no tiene tendencia,
// el % de desvío si va en la dirección equivocada. Usado para ordenar
// "peor primero" sin importar de qué métrica se trate cada vez.
function badness(m: { trendPct: number | null; higherIsBetter: boolean } | undefined): number {
  if (!m || m.trendPct === null) return 0
  const isUp = m.trendPct > 0
  const isGood = isUp === m.higherIsBetter
  return isGood ? 0 : Math.abs(m.trendPct)
}

function TrendBadge({ trendPct, higherIsBetter }: { trendPct: number | null; higherIsBetter: boolean }) {
  if (trendPct === null || Math.abs(trendPct) < 0.5) return null
  const isUp = trendPct > 0
  const isGood = isUp === higherIsBetter
  return (
    <span className={cn(
      "text-[10px] font-semibold px-1 py-0.5 rounded",
      isGood ? "text-emerald-600 bg-emerald-50" : "text-destructive bg-destructive/10"
    )}>
      {isUp ? "+" : ""}{trendPct.toFixed(0)}%
    </span>
  )
}

// Rediseñado — el picker viejo agrupaba por concepto (varias filas
// idénticas "Aguascalientes + Precios + Beneficios" sin forma de
// distinguirlas) y no mostraba NI el creativo que se estaba vinculando
// NI un preview real de cada asset (los "Sin concepto" salían en blanco).
// Ahora es explícitamente 1-a-1 asset↔ad: arriba se ve el propio
// creativo que se está vinculando (para comparar lado a lado), cada
// asset trae su miniatura real + ícono de video si aplica, un buscador
// para cuando hay muchas variantes similares, y un aviso si ese asset ya
// está vinculado a otro ad (no lo bloquea — puede ser intencional — pero
// evita vincularlo dos veces sin darse cuenta).
function LinkPickerModal({ projectId, cycleId, card, onClose, onLinked }: {
  projectId: string; cycleId: string; card: AdPerformanceCard; onClose: () => void; onLinked: () => void
}) {
  const [assets, setAssets] = useState<LinkableAsset[] | null>(null)
  const [search, setSearch] = useState("")
  const [isPending, startTransition] = useTransition()
  const [lightboxAsset, setLightboxAsset] = useState<LinkableAsset | null>(null)

  useState(() => {
    getLinkableAssets(projectId, cycleId).then(setAssets)
    return null
  })

  const filtered = (assets ?? []).filter((a) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (a.conceptName ?? "").toLowerCase().includes(q) || (a.targetPersona ?? "").toLowerCase().includes(q)
  })

  function pick(assetId: string) {
    startTransition(async () => {
      await linkAssetToMetaAd(projectId, assetId, card.ad_id)
      onLinked()
      onClose()
    })
  }

  const adMedia = card.displayImageUrl ?? card.displayThumbnailUrl

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Antes era un cuadrito chico con una lista de texto — con tantos
          creativos casi idénticos (ver captura del usuario) eso era
          inservible. Ahora ocupa casi toda la pantalla: el creativo que
          se está vinculando queda grande y fijo a la izquierda, y los
          assets del dashboard se ven como un grid de tarjetas con media
          real, no una lista de renglones de texto. */}
      <div
        className="bg-background rounded-2xl border border-border w-full max-w-6xl h-[92vh] flex overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Columna izquierda — el creativo de Meta que se está vinculando */}
        <div className="w-[300px] flex-shrink-0 border-r border-border flex flex-col bg-muted/20">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Este creativo</p>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 bg-black/90">
            {card.displayVideoUrl ? (
              <video src={card.displayVideoUrl} controls className="max-w-full max-h-full rounded-lg" />
            ) : adMedia ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={adMedia} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
            ) : (
              <ImageIcon className="w-8 h-8 text-white/30" />
            )}
          </div>
          <div className="px-4 py-3 border-t border-border">
            <p className="text-sm font-semibold truncate">{card.ad_name ?? "Sin nombre"}</p>
            {card.campaign_name && <p className="text-xs text-muted-foreground truncate mt-0.5">{card.campaign_name}</p>}
          </div>
        </div>

        {/* Columna derecha — buscador + grid de assets del dashboard */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div>
              <h3 className="text-sm font-semibold">Vincular a un asset del dashboard</h3>
              <p className="text-[11px] text-muted-foreground">Compara contra el creativo de la izquierda antes de elegir.</p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>

          <div className="px-5 py-3 border-b border-border">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por concepto o persona…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {!assets && <p className="text-sm text-muted-foreground p-2">Cargando…</p>}
            {assets?.length === 0 && <p className="text-sm text-muted-foreground p-2">Sin assets en este ciclo todavía.</p>}
            {assets && assets.length > 0 && filtered.length === 0 && <p className="text-sm text-muted-foreground p-2">Nada coincide con "{search}".</p>}
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {filtered.map((a) => (
                <div key={a.id} className="rounded-xl border border-border overflow-hidden hover:border-primary/50 transition-colors">
                  <button
                    onClick={() => a.fileType === "video" ? setLightboxAsset(a) : undefined}
                    className={cn("relative w-full aspect-square bg-muted block", a.fileType === "video" && "cursor-pointer")}
                    title={a.fileType === "video" ? "Ver video" : undefined}
                  >
                    {a.thumbUrl && <img src={a.thumbUrl} alt="" className="w-full h-full object-cover" />}
                    {a.fileType === "video" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <Film className="w-5 h-5 text-white" />
                      </div>
                    )}
                  </button>
                  <button onClick={() => pick(a.id)} disabled={isPending} className="w-full text-left p-2.5 hover:bg-muted transition-colors disabled:opacity-50">
                    <p className="text-xs font-medium truncate">{a.conceptName ?? "Sin concepto"}</p>
                    {a.targetPersona && <p className="text-[11px] text-muted-foreground truncate">{a.targetPersona}</p>}
                    {a.format && <p className="text-[10px] text-muted-foreground/70 truncate">{a.format}</p>}
                    {a.linkedToAdName && (
                      <p className="text-[10px] text-amber-600 truncate mt-1">Ya vinculado a: {a.linkedToAdName}</p>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {lightboxAsset && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={() => setLightboxAsset(null)}>
          <video src={lightboxAsset.fileUrl ?? undefined} controls autoPlay className="max-w-full max-h-[80vh]" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}

// Picker previo al sync — pensado para cuentas con muchos creativos
// corriendo (80+): en vez de traer/mostrar todo de golpe, elige qué
// campañas te interesan. La selección se guarda por proyecto (no se
// vuelve a preguntar en cada sync) hasta que la cambies aquí mismo.
function CampaignPickerModal({ projectId, savedCampaignIds, onClose, onConfirm }: {
  projectId: string; savedCampaignIds: string[] | null
  onClose: () => void
  onConfirm: (campaignIds: string[]) => void
}) {
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; status: string | null }[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set(savedCampaignIds ?? []))

  useState(() => {
    getMetaCampaignOptions(projectId).then((r) => {
      if (r.error) setError(r.error)
      setCampaigns(r.campaigns)
    })
    return null
  })

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background rounded-2xl border border-border max-w-md w-full max-h-[75vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold">Elegir campañas a sincronizar</h3>
            <p className="text-[11px] text-muted-foreground">Vacío = todas. Se recuerda para el próximo sync.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {!campaigns && !error && <p className="text-xs text-muted-foreground p-2">Cargando…</p>}
          {error && <p className="text-xs text-destructive p-2">{error}</p>}
          {campaigns?.length === 0 && <p className="text-xs text-muted-foreground p-2">Sin campañas en esta cuenta.</p>}
          {campaigns?.map((c) => (
            <label key={c.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted transition-colors cursor-pointer">
              <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="accent-primary" />
              <span className="text-xs flex-1 truncate">{c.name}</span>
              {c.status && <span className="text-[10px] text-muted-foreground">{c.status}</span>}
            </label>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
          <button
            onClick={() => onConfirm(Array.from(selected))}
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Guardar y sincronizar
          </button>
        </div>
      </div>
    </div>
  )
}

function CreativeCard({ card, metrics, projectId, cycleId, canEdit, onRefresh }: {
  card: AdPerformanceCard; metrics: MetricKey[]; projectId: string; cycleId: string; canEdit: boolean; onRefresh: () => void
}) {
  const [showLinkPicker, setShowLinkPicker] = useState(false)
  // El video real (no solo su thumbnail chico/borroso) — display*Url ya
  // trae la preferencia resuelta: el archivo del propio dashboard si el
  // ad está vinculado a un asset (no expira, no depende de Meta), o lo
  // que trajo el sync si no.
  const poster = card.displayImageUrl ?? card.displayThumbnailUrl ?? undefined
  const media = card.displayImageUrl ?? card.displayThumbnailUrl
  const isVideo = !!card.displayVideoUrl

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      <div className="relative aspect-square bg-muted">
        {isVideo ? (
          <video
            src={card.displayVideoUrl ?? undefined}
            poster={poster}
            controls
            preload="none"
            className="w-full h-full object-cover"
          />
        ) : media ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
            <ImageIcon className="w-8 h-8" />
          </div>
        )}
        <span className={cn(
          "absolute top-1.5 right-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full",
          card.status === "ACTIVE" ? "bg-emerald-500 text-white" : "bg-slate-900/70 text-white"
        )}>
          {card.status === "ACTIVE" ? "Activo" : card.status ?? "—"}
        </span>
      </div>

      <div className="p-3 space-y-2 flex-1 flex flex-col">
        <p className="text-xs font-medium truncate" title={card.ad_name ?? undefined}>{card.ad_name ?? "Sin nombre"}</p>

        <div className="grid grid-cols-2 gap-1.5">
          {metrics.map((key) => {
            const m = card.metrics[key]
            if (!m || m.value === null) return null
            return (
              <div key={key} className="bg-muted/40 rounded-md p-1.5">
                <p className="text-[10px] text-muted-foreground">{METRIC_DEFS[key].label}</p>
                <div className="flex items-center gap-1">
                  <p className="text-xs font-semibold">{METRIC_DEFS[key].format(m.value)}</p>
                  <TrendBadge trendPct={m.trendPct} higherIsBetter={m.higherIsBetter} />
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-1 mt-auto pt-1">
          {card.campaign_name && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 truncate max-w-full">
              {card.campaign_name}
            </span>
          )}
          {card.linkedConcepts.map((l) => (
            <span key={l.linkId} className="group text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 flex items-center gap-1">
              {l.conceptName ?? "Sin concepto"}
              {canEdit && (
                <button
                  onClick={() => unlinkAssetFromMetaAd(projectId, l.linkId).then(onRefresh)}
                  className="opacity-0 group-hover:opacity-100 hover:text-destructive"
                  title="Quitar vínculo"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </span>
          ))}
          {canEdit && card.linkedConcepts.length === 0 && (
            <button
              onClick={() => setShowLinkPicker(true)}
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 flex items-center gap-1 transition-colors"
            >
              <Link2 className="w-2.5 h-2.5" /> Vincular a concepto
            </button>
          )}
        </div>
      </div>

      {showLinkPicker && (
        <LinkPickerModal projectId={projectId} cycleId={cycleId} card={card} onClose={() => setShowLinkPicker(false)} onLinked={onRefresh} />
      )}
    </div>
  )
}

export function CreativePerformanceGrid({ projectId, cycleId, initialCards, displayMetrics, savedCampaignIds, hasCredentials, canEdit }: Props) {
  const [cards, setCards] = useState(initialCards)
  const [isPending, startTransition] = useTransition()
  const [syncError, setSyncError] = useState<string | null>(null)
  const [showCampaignPicker, setShowCampaignPicker] = useState(false)
  const [campaignSelection, setCampaignSelection] = useState<string[] | null>(savedCampaignIds)

  const [sortBy, setSortBy] = useState<SortMode>("worst_trend")
  const [filterCampaign, setFilterCampaign] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterLinked, setFilterLinked] = useState<string>("all")

  function reload() {
    startTransition(async () => {
      setCards(await getCreativePerformance(projectId, cycleId))
    })
  }

  function runSync(campaignIds: string[] | null) {
    setSyncError(null)
    startTransition(async () => {
      const result = await syncMetaAds(projectId, cycleId, campaignIds?.length ? campaignIds : undefined)
      if (result.error) { setSyncError(result.error); return }
      setCards(await getCreativePerformance(projectId, cycleId))
    })
  }

  function handleSync() {
    runSync(campaignSelection)
  }

  function handleConfirmCampaigns(campaignIds: string[]) {
    setShowCampaignPicker(false)
    setCampaignSelection(campaignIds)
    startTransition(async () => {
      await setSyncedCampaignIds(projectId, campaignIds)
    })
    runSync(campaignIds)
  }

  const campaignOptions = useMemo(
    () => Array.from(new Set(cards.map((c) => c.campaign_name).filter((n): n is string => !!n))),
    [cards]
  )

  const visibleCards = useMemo(() => {
    let result = cards
    if (filterCampaign !== "all") result = result.filter((c) => c.campaign_name === filterCampaign)
    if (filterStatus !== "all") result = result.filter((c) => (filterStatus === "active" ? c.status === "ACTIVE" : c.status !== "ACTIVE"))
    if (filterLinked !== "all") result = result.filter((c) => (filterLinked === "linked" ? c.linkedConcepts.length > 0 : c.linkedConcepts.length === 0))

    const sorted = [...result]
    if (sortBy === "worst_trend") {
      sorted.sort((a, b) => {
        const worstA = Math.max(...displayMetrics.map((k) => badness(a.metrics[k])), 0)
        const worstB = Math.max(...displayMetrics.map((k) => badness(b.metrics[k])), 0)
        return worstB - worstA
      })
    } else if (sortBy === "spend_desc") {
      sorted.sort((a, b) => (b.metrics.spend.value ?? 0) - (a.metrics.spend.value ?? 0))
    } else {
      sorted.sort((a, b) => (a.ad_name ?? "").localeCompare(b.ad_name ?? ""))
    }
    return sorted
  }, [cards, filterCampaign, filterStatus, filterLinked, sortBy, displayMetrics])

  const totalSpend = cards.reduce((sum, c) => sum + (c.metrics.spend.value ?? 0), 0)
  const activeCount = cards.filter((c) => c.status === "ACTIVE").length

  return (
    <div>
      <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-wrap gap-2">
        <div>
          <h3 className="font-semibold text-sm text-foreground">Creativos</h3>
          {cards.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {activeCount}/{cards.length} activos · {fmt$(totalSpend)} invertido este ciclo
              {campaignSelection?.length ? ` · ${campaignSelection.length} campaña${campaignSelection.length !== 1 ? "s" : ""} elegida${campaignSelection.length !== 1 ? "s" : ""}` : ""}
            </p>
          )}
        </div>
        {canEdit && hasCredentials && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCampaignPicker(true)}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50 transition-colors"
            >
              <ListFilter className="w-3.5 h-3.5" />
              Elegir campañas
            </button>
            <button
              onClick={handleSync}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Sincronizar
            </button>
          </div>
        )}
      </div>

      {syncError && (
        <div className="mx-5 mt-3 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs">{syncError}</div>
      )}

      {!hasCredentials && (
        <p className="px-5 py-4 text-sm text-muted-foreground">Configura Meta en la card Conexiones para sincronizar creativos.</p>
      )}

      {hasCredentials && cards.length === 0 && !syncError && (
        <p className="px-5 py-4 text-sm text-muted-foreground">
          Sin datos. Presiona <span className="font-medium">Sincronizar</span> para traer los creativos activos de este ciclo.
        </p>
      )}

      {cards.length > 0 && (
        <>
          {/* Barra de orden + filtro — útil desde ya, indispensable cuando
              una cuenta corre docenas de creativos a la vez. */}
          <div className="flex items-center gap-2 px-5 py-2.5 border-b border-border flex-wrap">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortMode)} className="h-7 rounded-md border border-input bg-background px-2 text-xs">
              <option value="worst_trend">Peor tendencia primero</option>
              <option value="spend_desc">Mayor inversión</option>
              <option value="name_asc">Nombre A-Z</option>
            </select>
            {campaignOptions.length > 1 && (
              <select value={filterCampaign} onChange={(e) => setFilterCampaign(e.target.value)} className="h-7 rounded-md border border-input bg-background px-2 text-xs">
                <option value="all">Todas las campañas</option>
                {campaignOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            )}
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-7 rounded-md border border-input bg-background px-2 text-xs">
              <option value="all">Cualquier estado</option>
              <option value="active">Solo activos</option>
              <option value="inactive">Solo inactivos</option>
            </select>
            <select value={filterLinked} onChange={(e) => setFilterLinked(e.target.value)} className="h-7 rounded-md border border-input bg-background px-2 text-xs">
              <option value="all">Vinculados o no</option>
              <option value="linked">Solo vinculados</option>
              <option value="unlinked">Solo sin vincular</option>
            </select>
            <span className="text-xs text-muted-foreground ml-auto">{visibleCards.length} de {cards.length}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-5">
            {visibleCards.map((card) => (
              <CreativeCard key={card.ad_id} card={card} metrics={displayMetrics} projectId={projectId} cycleId={cycleId} canEdit={canEdit} onRefresh={reload} />
            ))}
          </div>
        </>
      )}

      {showCampaignPicker && (
        <CampaignPickerModal
          projectId={projectId}
          savedCampaignIds={campaignSelection}
          onClose={() => setShowCampaignPicker(false)}
          onConfirm={handleConfirmCampaigns}
        />
      )}
    </div>
  )
}
