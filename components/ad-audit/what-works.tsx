"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatMoney, formatSec, type MetricId } from "@/lib/ad-audit/metrics"
import { PART_LABEL, type PartKey } from "@/lib/ad-audit/parts"
import { type FindingClip, type FindingRow, type Findings, type Format, type LineFindings } from "@/lib/ad-audit/findings"
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

const METRIC_SHORT: Partial<Record<MetricId, string>> = {
  hook: "hook rate", hold: "hold rate", ctr: "CTR", visit_cart: "visita → carrito", session_cvr: "conversión de sesión",
  aov: "AOV", result_rate: "resultados por clic", cpr: "costo por resultado",
}
const PART_WHERE: Record<PartKey, Record<Format, string>> = {
  gancho: { video: "Primeros segundos", image: "Lo que detiene" },
  cuerpo: { video: "El tramo del medio", image: "El texto" },
  cierre: { video: "Los últimos segundos", image: "Precio / CTA" },
}
const hint = (f: Findings, p: PartKey, fmt: Format) => {
  const m = f.metrics[p][fmt]
  return `${PART_WHERE[p][fmt]} · ${METRIC_SHORT[m.main] ?? m.main}${m.second ? ` y ${METRIC_SHORT[m.second] ?? m.second}` : ""}`
}
const pctIdx = (i: number | null) => (i === null ? "" : `${i >= 0 ? "+" : ""}${Math.round(i * 100)} %`)

export function WhatWorks({ findings: allFindings, lines = [] }: { findings: Findings; lines?: LineFindings[] }) {
  const [lineId, setLineId] = useState<string>("all")
  const compare = lineId === "compare"
  const findings = lineId === "all" || compare ? allFindings : (lines.find((l) => l.id === lineId)?.findings ?? allFindings)
  const [part, setPart] = useState<PartKey>("gancho")
  const [fmt, setFmt] = useState<Format>(allFindings.rows.video.gancho.length || !allFindings.rows.image.gancho.length ? "video" : "image")
  const rows = findings.rows[fmt][part] ?? []
  const recipe = findings.recipe[fmt]

  return (
    <div className="flex flex-col gap-5">
      {lines.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Brand Line">
          {[{ id: "all", name: "Toda la cuenta", color: null as string | null, cov: allFindings.coverage },
            ...lines.map((l) => ({ id: l.id, name: l.name, color: l.color, cov: l.findings.coverage }))].map((c) => (
            <button key={c.id} onClick={() => setLineId(c.id)} aria-pressed={lineId === c.id}
              className={cn("flex h-11 items-center gap-2 rounded-xl border px-3 text-sm", lineId === c.id ? "border-foreground/40 bg-muted font-semibold" : "border-border bg-card")}>
              {c.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} aria-hidden="true" />}
              <span>{c.name}</span>
              <span className={cn("text-xs tabular-nums", c.cov.analyzed < c.cov.total ? "text-orange-700 dark:text-orange-300" : "text-muted-foreground")} title="Creativos analizados por partes">{c.cov.analyzed}/{c.cov.total}</span>
            </button>
          ))}
          {lines.length > 1 && (
            <button onClick={() => setLineId("compare")} aria-pressed={compare}
              className={cn("h-11 rounded-xl border px-3 text-sm font-semibold", compare ? "border-foreground/40 bg-muted" : "border-dashed border-border bg-card")}>
              Comparar líneas
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {findings.coverage.analyzed} de {findings.coverage.total} creativos analizados por partes · se juzga por {findings.resultLabel.toLowerCase()}.
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

      {!compare && recipe && (
        <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-emerald-500/40 bg-card p-4">
          <div className="flex w-52 flex-none flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">La combinación que más {findings.kind === "purchase" ? "vende" : "resultados trae"}</span>
            <span className={cn("text-3xl font-bold tracking-tight tabular-nums", CMP_CLASS.better)}>{recipe.roas !== null ? `ROAS ${recipe.roas.toFixed(1)}` : formatMoney(recipe.cpr, recipe.currency)}</span>
            <span className="text-xs text-muted-foreground">
              {recipe.roas !== null ? `cuenta ${(recipe.accountRoas ?? 0).toFixed(1)} · ${formatMoney(recipe.cpr, recipe.currency)} por compra` : `por resultado · cuenta ${formatMoney(recipe.accountCpr, recipe.currency)}`}
              {" · "}{recipe.ads} anuncio{recipe.ads === 1 ? "" : "s"} · {Math.round(recipe.resultShare * 100)} % de {findings.resultLabel.toLowerCase()}
            </span>
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
            <span className="text-xs text-muted-foreground">{hint(findings, p, fmt)}</span>
          </button>
        ))}
      </div>

      {compare ? <LineMatrix lines={lines} part={part} fmt={fmt} /> : (
        <>
          {rows.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay creativos de este formato analizados por partes{lineId !== "all" ? " en esta línea" : ""}.</p>}
          <div className="flex flex-col gap-3">
            {rows.map((r) => {
              const v = VERDICT[r.verdict]
              return (
                <div key={r.type} className={cn("flex flex-wrap items-stretch gap-4 rounded-2xl border bg-card p-3.5", v.box)}>
                  <div className="flex w-52 flex-none flex-col justify-center gap-1.5">
                    <span className="text-[15px] font-semibold leading-tight">{r.type}</span>
                    <span className={cn("text-3xl font-bold tracking-tight tabular-nums", v.big)} title={`${r.mainLabel} (suma de los anuncios del tipo)`}>{r.main}</span>
                    <span className={cn("w-fit rounded-full px-2.5 py-0.5 text-[11px] font-semibold", v.className)}
                      title={r.index !== null ? `En promedio ${pctIdx(r.index)} contra la mediana de su conjunto` : undefined}>
                      {v.label}{r.index !== null && r.verdict !== "few" ? ` · ${pctIdx(r.index)}` : ""}
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
        </>
      )}

      <p className="text-xs text-muted-foreground">
        El número grande suma los anuncios de cada tipo. El veredicto compara cada anuncio contra la mediana de su propio conjunto (misma audiencia y fechas): «Funciona» = en promedio 10 % o más arriba; «No funciona» = 10 % o más abajo; «Pocos datos» = menos de 2 anuncios con muestra suficiente. Cada anuncio cuenta en la línea que le asignó la marca inferida (se corrige desde la tabla de la campaña).
      </p>
    </div>
  )
}

// Matriz tipos × líneas para la parte elegida, más un resumen de qué cambia.
function LineMatrix({ lines, part, fmt }: { lines: LineFindings[]; part: PartKey; fmt: Format }) {
  const types = [...new Set(lines.flatMap((l) => (l.findings.rows[fmt][part] ?? []).map((r) => r.type)))]
  const cell = (l: LineFindings, t: string) => (l.findings.rows[fmt][part] ?? []).find((r) => r.type === t) ?? null
  const bestOf = (l: LineFindings) => (l.findings.rows[fmt][part] ?? []).filter((r) => r.verdict === "ok").sort((a, b) => (b.index ?? 0) - (a.index ?? 0))[0] ?? null
  const bests = lines.map((l) => ({ l, best: bestOf(l) })).filter((x) => x.best)
  const distinct = new Set(bests.map((x) => x.best!.type))
  // Tipos que funcionan en una línea y no en otra.
  const flips = types.map((t) => {
    const ok = lines.filter((l) => cell(l, t)?.verdict === "ok").map((l) => l.name)
    const bad = lines.filter((l) => cell(l, t)?.verdict === "bad").map((l) => l.name)
    return ok.length && bad.length ? { t, ok, bad } : null
  }).filter(Boolean) as { t: string; ok: string[]; bad: string[] }[]

  if (types.length === 0) return <p className="text-sm text-muted-foreground">Todavía no hay creativos de este formato analizados por partes en las líneas.</p>
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-border bg-card p-4 text-sm">
        <p className="mb-1 font-semibold">Qué cambia por línea</p>
        {bests.length === 0 ? <p className="text-muted-foreground">Ningún tipo destaca todavía en ninguna línea (faltan datos o análisis).</p> : (
          <ul className="flex flex-col gap-1">
            <li>{distinct.size === 1 && bests.length > 1 ? `En todas las líneas con datos gana el mismo: ${[...distinct][0]}.` : bests.map((x) => `${x.l.name}: ${x.best!.type} (${pctIdx(x.best!.index)})`).join(" · ")}</li>
            {flips.map((f) => <li key={f.t} className="text-muted-foreground">«{f.t}» funciona en {f.ok.join(", ")} pero no en {f.bad.join(", ")}.</li>)}
          </ul>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Tipo</th>
              {lines.map((l) => (
                <th key={l.id} className="px-3 py-2 font-semibold"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: l.color }} aria-hidden="true" />{l.name}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2 font-semibold">{t}</td>
                {lines.map((l) => {
                  const r = cell(l, t)
                  if (!r) return <td key={l.id} className="px-3 py-2 text-muted-foreground">—</td>
                  const v = VERDICT[r.verdict]
                  return (
                    <td key={l.id} className="px-3 py-2" title={`${r.mainLabel} ${r.main} · ${r.support}`}>
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", v.className)}>{v.label}{r.verdict !== "few" && r.index !== null ? ` ${pctIdx(r.index)}` : ""}</span>
                      <span className="ml-2 tabular-nums text-xs text-muted-foreground">{r.main}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
