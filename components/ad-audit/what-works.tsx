"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatSec } from "@/lib/ad-audit/metrics"
import { PART_LABEL, type PartKey } from "@/lib/ad-audit/parts"
import { type FindingClip, type FindingRow, type Findings, type Format } from "@/lib/ad-audit/findings"
import { CMP_CLASS } from "@/components/ad-audit/ui"

// Video que reproduce SOLO el tramo de la parte que se juzga (desde → hasta),
// en bucle mientras el mouse está encima. preload="none": nada se descarga
// hasta que alguien lo pide.
function SegmentClip({ clip, badge, width = 128 }: { clip: FindingClip; badge: string; width?: number }) {
  const ref = useRef<HTMLVideoElement>(null)
  const from = clip.from ?? 0
  const to = clip.to ?? null
  const seg = clip.from !== null && clip.to !== null ? `${formatSec(clip.from)}–${formatSec(clip.to)}` : null
  return (
    <Link href={clip.href} style={{ width }} className="group relative flex-none overflow-hidden rounded-xl border border-border bg-muted"
      aria-label={`${clip.name}: ${badge}${seg ? `, tramo ${seg}` : ""}`}>
      {clip.videoUrl ? (
        <video
          ref={ref}
          src={clip.videoUrl}
          poster={clip.posterUrl ?? undefined}
          preload="none"
          muted
          playsInline
          className="aspect-[9/16] w-full object-cover"
          onMouseEnter={() => { const v = ref.current; if (v) { v.currentTime = from; v.play().catch(() => {}) } }}
          onMouseLeave={() => ref.current?.pause()}
          onTimeUpdate={() => { const v = ref.current; if (v && to !== null && v.currentTime >= to) v.currentTime = from }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        clip.imageUrl ? <img src={clip.imageUrl} alt={clip.name} loading="lazy" className="aspect-square w-full object-cover" /> : <div className="aspect-[9/16] w-full" />
      )}
      <span className={cn("absolute left-1.5 top-1.5 rounded-md bg-black/75 px-1.5 py-0.5 text-xs font-bold", clip.cmp === "better" ? "text-emerald-300" : clip.cmp === "worse" ? "text-orange-300" : "text-white")}>{badge}</span>
      <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/85 to-transparent p-1.5 text-[11px] text-white">
        <span className="truncate font-semibold">{clip.name}</span>{seg && <span className="flex-none text-white/80">{seg}</span>}
      </span>
    </Link>
  )
}

const VERDICT: Record<FindingRow["verdict"], { label: string; className: string; big: string; box: string }> = {
  ok: { label: "Funciona", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", big: CMP_CLASS.better, box: "border-emerald-500/40" },
  mid: { label: "En la media", className: "bg-muted text-muted-foreground", big: "text-foreground", box: "border-border" },
  bad: { label: "No funciona", className: "bg-orange-500/15 text-orange-700 dark:text-orange-300", big: CMP_CLASS.worse, box: "border-border" },
  few: { label: "Pocos datos", className: "bg-sky-500/15 text-sky-700 dark:text-sky-300", big: "text-muted-foreground", box: "border-border" },
}

const PART_HINT: Record<PartKey, Record<Format, string>> = {
  gancho: { video: "Primeros segundos · hook rate", image: "Lo que detiene · CTR" },
  cuerpo: { video: "El tramo del medio · hold rate", image: "El texto · visita → carrito" },
  cierre: { video: "Los últimos segundos · conversión y AOV", image: "Precio / CTA · conversión y AOV" },
}

export function WhatWorks({ findings }: { findings: Findings }) {
  const [part, setPart] = useState<PartKey>("gancho")
  const [fmt, setFmt] = useState<Format>(findings.rows.video.gancho.length || !findings.rows.image.gancho.length ? "video" : "image")
  const rows = findings.rows[fmt][part]
  const recipe = findings.recipe[fmt]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {findings.coverage.analyzed} de {findings.coverage.total} creativos analizados por partes.
          {findings.coverage.analyzed < findings.coverage.total && " Analiza los que faltan desde cada campaña para que cuenten aquí."}
        </p>
        <div className="flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Formato">
          {(["video", "image"] as Format[]).map((f) => (
            <button key={f} onClick={() => setFmt(f)} aria-pressed={fmt === f}
              className={cn("h-8 rounded-md px-3 text-sm font-semibold", fmt === f ? "bg-muted text-foreground" : "text-muted-foreground")}>
              {f === "video" ? "Video" : "Imagen"}
            </button>
          ))}
        </div>
      </div>

      {recipe && (
        <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-emerald-500/40 bg-card p-4">
          <div className="flex w-52 flex-none flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">La combinación que más vende</span>
            <span className={cn("text-3xl font-bold tracking-tight", CMP_CLASS.better)}>ROAS {recipe.roas.toFixed(1)}</span>
            <span className="text-xs text-muted-foreground">cuenta {recipe.accountRoas.toFixed(1)} · {recipe.ads} anuncio{recipe.ads === 1 ? "" : "s"} · {Math.round(recipe.purchaseShare * 100)} % de las compras</span>
          </div>
          <div className="flex min-w-0 flex-1 items-start gap-2 overflow-x-auto pb-1">
            {(["gancho", "cuerpo", "cierre"] as PartKey[]).map((p, i) => (
              <div key={p} className="flex flex-none items-start gap-2">
                <div className="flex flex-col gap-1">
                  <SegmentClip clip={recipe.clips[p]} badge={PART_LABEL[p]} width={140} />
                  <span className="max-w-[140px] text-xs font-semibold leading-tight">{recipe.parts[p]}</span>
                </div>
                {i < 2 && <ArrowRight className="mt-[115px] h-5 w-5 flex-none text-muted-foreground" aria-hidden="true" />}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-3" role="tablist" aria-label="Parte del creativo">
        {(["gancho", "cuerpo", "cierre"] as PartKey[]).map((p) => (
          <button key={p} role="tab" aria-selected={part === p} onClick={() => setPart(p)}
            className={cn("flex flex-col items-start gap-0.5 rounded-xl border px-4 py-3 text-left",
              part === p ? "border-foreground/30 bg-muted" : "border-border bg-card")}>
            <span className="text-lg font-bold">{p === "gancho" ? "Ganchos" : p === "cuerpo" ? "Cuerpos" : "Cierres"}</span>
            <span className="text-xs text-muted-foreground">{PART_HINT[p][fmt]}</span>
          </button>
        ))}
      </div>

      {rows.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay creativos de este formato analizados por partes.</p>}

      <div className="flex flex-col gap-3">
        {rows.map((r) => {
          const v = VERDICT[r.verdict]
          return (
            <div key={r.type} className={cn("flex flex-wrap items-stretch gap-4 rounded-2xl border bg-card p-3.5", v.box)}>
              <div className="flex w-52 flex-none flex-col justify-center gap-1.5">
                <span className="text-[15px] font-semibold leading-tight">{r.type}</span>
                <span className={cn("text-3xl font-bold tracking-tight tabular-nums", v.big)} title={`${r.mainLabel} (suma de los anuncios del tipo)`}>{r.main}</span>
                <span className={cn("w-fit rounded-full px-2.5 py-0.5 text-[11px] font-semibold", v.className)}
                  title={r.index !== null ? `En promedio ${r.index >= 0 ? "+" : ""}${Math.round(r.index * 100)} % contra la mediana de su conjunto` : undefined}>
                  {v.label}{r.index !== null && r.verdict !== "few" ? ` · ${r.index >= 0 ? "+" : ""}${Math.round(r.index * 100)} %` : ""}
                </span>
                <span className="text-[11px] text-muted-foreground">{r.mainLabel}{r.second ? ` · ${r.second}` : ""}</span>
                <span className="text-[11px] text-muted-foreground">{r.support}</span>
              </div>
              <div className="flex min-w-0 flex-1 gap-2.5 overflow-x-auto pb-1">
                {r.clips.map((c) => <SegmentClip key={c.adId} clip={c} badge={c.value} />)}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        El número grande suma los anuncios de cada tipo. El veredicto compara cada anuncio contra la mediana de su propio conjunto (misma audiencia y fechas): «Funciona» = en promedio 10 % o más arriba; «No funciona» = 10 % o más abajo; «Pocos datos» = menos de 2 anuncios con muestra suficiente. Métricas por parte: {fmt === "video" ? "gancho → hook rate, cuerpo → hold rate, cierre → conversión de sesión" : "gancho → CTR, cuerpo → visita → carrito, cierre → conversión de sesión"}.
      </p>
    </div>
  )
}
