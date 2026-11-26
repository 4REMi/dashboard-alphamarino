"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Brain, ExternalLink, Sparkles } from "lucide-react"
import { inferAuditBrand, promoteAuditBrand } from "@/lib/actions/ad-audits"
import type { AuditBrandBrain, AuditBrandLine } from "@/lib/ad-audit/brand"
import { formatMoney } from "@/lib/ad-audit/metrics"

function List({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <ul className="flex flex-col gap-0.5 text-sm">{items.map((x) => <li key={x}>· {x}</li>)}</ul>
    </div>
  )
}

export function AuditBrand({ accountId, brain, lines, error, currency, canPromote }: {
  accountId: string; brain: AuditBrandBrain | null; lines: AuditBrandLine[]; error: string | null; currency: string; canPromote: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<"infer" | "promote" | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const infer = () => start(async () => {
    setBusy("infer"); setMsg(null)
    try { await inferAuditBrand(accountId); router.refresh() } catch (e) { setMsg(e instanceof Error ? e.message : "Falló") }
    setBusy(null)
  })
  const promote = () => start(async () => {
    setBusy("promote"); setMsg(null)
    try {
      const r = await promoteAuditBrand(accountId)
      setMsg(r.created ? "Listo: se creó en Brand Brains con sus líneas." : "Ya estaba en Brand Brains.")
      router.refresh()
    } catch (e) { setMsg(e instanceof Error ? e.message : "Falló") }
    setBusy(null)
  })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Inferido de las campañas auditadas: el sitio web al que va la mayor parte del gasto, el copy de los anuncios, sus páginas de destino y los análisis de concepto. Vive solo en la auditoría hasta que lo lleves a Brand Brains.
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={infer} disabled={pending}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold disabled:opacity-60">
            <Sparkles className="h-4 w-4" />
            {busy === "infer" ? "Infiriendo… (~1 min)" : brain ? "Volver a inferir" : "Inferir Brand Brain y Brand Lines"}
          </button>
          {brain && (brain.promoted_brand_brain_id ? (
            <Link href={`/brand-brains/${brain.promoted_brand_brain_id}`} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
              <ExternalLink className="h-4 w-4" />Ver en Brand Brains
            </Link>
          ) : canPromote ? (
            <button onClick={promote} disabled={pending}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              <Brain className="h-4 w-4" />{busy === "promote" ? "Llevando…" : "Llevar a Brand Brains"}
            </button>
          ) : null)}
        </div>
      </div>
      {(error || msg) && <p className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{error ?? msg}</p>}
      {brain?.promoted_brand_brain_id && (
        <p className="text-xs text-muted-foreground">Ya se llevó a Brand Brains{brain.promoted_at ? ` el ${brain.promoted_at.slice(0, 10)}` : ""}. Volver a inferir solo cambia la copia de la auditoría, no la de Brand Brains.</p>
      )}

      {!brain && !error && <p className="text-sm text-muted-foreground">Aún no se ha inferido la marca de esta cuenta.</p>}

      {brain && (
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">{brain.name}</h2>
              <p className="text-sm text-muted-foreground">{[brain.industry, brain.tone_of_voice].filter(Boolean).join(" · ")}</p>
            </div>
            {brain.brand_colors?.length > 0 && (
              <div className="flex gap-1.5" aria-label="Colores de marca">
                {brain.brand_colors.map((c) => <span key={c.hex} title={`${c.hex}${c.label ? ` · ${c.label}` : ""}`} className="h-7 w-7 rounded-full border border-border" style={{ background: c.hex }} />)}
              </div>
            )}
          </div>
          {brain.description && <p className="text-sm">{brain.description}</p>}
          {brain.target_audience && <p className="text-sm"><span className="font-semibold">Audiencia:</span> {brain.target_audience}</p>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <List label="USPs" items={brain.usps} />
            <List label="Beneficios" items={brain.key_benefits} />
            <List label="Dolores" items={brain.pain_points} />
            <List label="Características" items={brain.key_features} />
            <List label="CTAs" items={brain.ctas} />
          </div>
          {brain.additional_context && <p className="rounded-lg bg-muted px-3 py-2 text-sm"><span className="font-semibold">Aprendido de los anuncios:</span> {brain.additional_context}</p>}
          <p className="text-[11px] text-muted-foreground">
            Fuentes: {brain.sources?.website ? `sitio ${brain.sources.website}` : "sin sitio"}{brain.sources?.websiteError ? ` (no se pudo leer: ${brain.sources.websiteError})` : ""} · {brain.sources?.ads ?? 0} anuncios · {brain.sources?.analyses ?? 0} análisis de concepto · {brain.sources?.landings ?? 0} páginas de destino · actualizado {brain.updated_at.slice(0, 10)}
          </p>
        </div>
      )}

      {lines.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Brand Lines ({lines.length})</h2>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
            {lines.map((l) => {
              const spend = l.ads.reduce((t, a) => t + a.spend, 0)
              const purchases = l.ads.reduce((t, a) => t + a.purchases, 0)
              return (
                <div key={l.id} className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 flex-none rounded-full" style={{ background: l.color }} aria-hidden="true" />
                    <h3 className="font-semibold">{l.name}</h3>
                    {l.promoted_brand_line_id && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">en Brand Brains</span>}
                  </div>
                  {l.description && <p className="text-sm text-muted-foreground">{l.description}</p>}
                  <p className="text-xs tabular-nums">{l.ads.length} anuncio{l.ads.length === 1 ? "" : "s"} · {formatMoney(spend, currency)} · {purchases} compras</p>
                  <List label="USPs" items={l.usps} />
                  <List label="Dolores" items={l.pain_points} />
                  {l.keywords.length > 0 && <div className="flex flex-wrap gap-1">{l.keywords.map((k) => <span key={k} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{k}</span>)}</div>}
                  {l.landing_urls.length > 0 && <p className="truncate text-[11px] text-muted-foreground" title={l.landing_urls.join("\n")}>Destino: {l.landing_urls.join(" · ")}</p>}
                  {l.ads.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {l.ads.slice(0, 8).map((a) => (
                        <Link key={a.id} href={`/ad-lab/auditorias/${accountId}/c/${a.campaignId}/a/${a.id}`} className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:underline">{a.name}</Link>
                      ))}
                      {l.ads.length > 8 && <span className="text-[11px] text-muted-foreground">+{l.ads.length - 8}</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
