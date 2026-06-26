import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { ANGLE_GUIDE } from "@/lib/constants/creatives"
import { ClientAssetReview } from "@/components/share/client-asset-review"
import { ClientPortalShell } from "@/components/share/client-portal-shell"

interface Props {
  params: Promise<{ projectId: string }>
}

const FUNNEL_COLORS: Record<string, string> = {
  TOF: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200/60",
  MOF: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200/60",
  BOF: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/60",
}
const FUNNEL_LABELS: Record<string, string> = {
  TOF: "Audiencia fría",
  MOF: "Audiencia tibia",
  BOF: "Audiencia caliente",
}

export default async function ShareConceptsPage({ params }: Props) {
  const { projectId } = await params
  const supabase = createAdminClient()

  const [projectRes, conceptsRes, assetsRes, settingsRes] = await Promise.all([
    supabase
      .from("projects")
      .select("name, customer:customers(name, company)")
      .eq("id", projectId)
      .single(),
    supabase
      .from("creative_concepts")
      .select(`id, name, angle_type, target_persona, product_service,
               pain_point, why_it_works, transformation, funnel_stage, status`)
      .eq("project_id", projectId)
      .in("status", ["Active", "Evergreen"])
      .order("status", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("creative_assets")
      .select(`id, format, platform, asset_url,
               client_status, client_feedback, concept_id,
               concept:creative_concepts!concept_id(name, angle_type)`)
      .eq("project_id", projectId)
      .eq("client_visible", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("workspace_settings")
      .select("logo_url")
      .eq("id", "default")
      .maybeSingle(),
  ])

  if (projectRes.error || !projectRes.data) notFound()

  const project  = projectRes.data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customer = project.customer as any
  const concepts = conceptsRes.data ?? []
  const assets   = assetsRes.data ?? []

  const clientName  = customer?.company || customer?.name || null
  const projectName = project.name
  const logoUrl     = settingsRes.data?.logo_url ?? null

  // KPIs
  const totalAssets   = assets.length
  const pendingCount  = assets.filter((a) => !a.client_status || a.client_status === "pending_review").length
  const approvedCount = assets.filter((a) => a.client_status === "approved").length
  const changesCount  = assets.filter((a) => a.client_status === "changes_requested").length
  const allReviewed   = totalAssets > 0 && pendingCount === 0
  const reviewedPct   = totalAssets === 0 ? 0 : Math.round(((approvedCount + changesCount) / totalAssets) * 100)
  const hasAssets     = totalAssets > 0
  const hasConcepts   = concepts.length > 0

  // Group assets by concept
  const assetsByConcept = new Map<string | null, typeof assets>()
  for (const a of assets) {
    const key = a.concept_id ?? null
    if (!assetsByConcept.has(key)) assetsByConcept.set(key, [])
    assetsByConcept.get(key)!.push(a)
  }
  const unlinked = assetsByConcept.get(null) ?? []

  // Order: concepts that have pending assets first
  const conceptsWithAssets = concepts
    .map((c) => ({
      concept: c,
      assets: assetsByConcept.get(c.id) ?? [],
    }))
    .filter((g) => g.assets.length > 0 || concepts.length <= 6)
  const conceptsPendingFirst = [...conceptsWithAssets].sort((a, b) => {
    const pa = a.assets.filter((x) => !x.client_status || x.client_status === "pending_review").length
    const pb = b.assets.filter((x) => !x.client_status || x.client_status === "pending_review").length
    return pb - pa
  })

  // Concepts with no assets (strategy-only)
  const strategyOnlyConcepts = concepts.filter((c) => (assetsByConcept.get(c.id) ?? []).length === 0)

  return (
    <ClientPortalShell
      brand="Alpha Marino"
      logoUrl={logoUrl}
      clientName={clientName}
      projectName={projectName}
    >
      {/* ── Hero + KPIs ─────────────────────────────────────────── */}
      <section className="px-4 sm:px-8 pt-8 sm:pt-12 pb-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {clientName && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Alpha Marino × {clientName}
            </p>
          )}
          <h1 className="text-[28px] sm:text-4xl font-bold tracking-tight leading-[1.1] text-slate-900">
            {projectName}
          </h1>

          {hasAssets && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <KpiCard
                label="Por revisar"
                value={pendingCount}
                tone={pendingCount > 0 ? "amber" : "slate"}
              />
              <KpiCard label="Aprobados" value={approvedCount} tone="emerald" />
              <KpiCard label="Cambios solicitados" value={changesCount} tone="sky" />
              <KpiCard label="Progreso" value={`${reviewedPct}%`} tone="violet" />
            </div>
          )}
        </div>
      </section>

      {/* ── Review banner ───────────────────────────────────────── */}
      {hasAssets && (
        <div className="px-4 sm:px-8 pb-4">
          <div className="max-w-6xl mx-auto">
            <ReviewBanner
              allReviewed={allReviewed}
              pendingCount={pendingCount}
              totalAssets={totalAssets}
            />
          </div>
        </div>
      )}

      {/* ── Concepts + Assets (grouped) ─────────────────────────── */}
      {hasAssets && conceptsPendingFirst.length > 0 && (
        <section className="px-4 sm:px-8 pb-10">
          <div className="max-w-6xl mx-auto space-y-10">
            <SectionHeader
              eyebrow="Conceptos en revisión"
              title="Los ángulos y sus piezas"
              subtitle="Cada concepto agrupa las piezas creativas que lo desarrollan. Aprueba o pide cambios pieza por pieza."
            />

            <div className="space-y-12">
              {conceptsPendingFirst.map(({ concept, assets: conceptAssets }) => (
                <ConceptGroup
                  key={concept.id}
                  concept={concept}
                  assets={conceptAssets}
                />
              ))}

              {unlinked.length > 0 && (
                <ConceptGroup concept={null} assets={unlinked} />
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Assets without concepts (fallback) ──────────────────── */}
      {hasAssets && conceptsPendingFirst.length === 0 && unlinked.length > 0 && (
        <section className="px-4 sm:px-8 pb-10">
          <div className="max-w-6xl mx-auto space-y-6">
            <SectionHeader
              eyebrow="Para tu revisión"
              title={allReviewed ? "Todo revisado" : "Piezas esperando tu aprobación"}
            />
            <div className="grid gap-5 xl:grid-cols-2">
              {unlinked.map((a) => <AssetReviewWrap key={a.id} asset={a} />)}
            </div>
          </div>
        </section>
      )}

      {/* ── Strategy-only concepts ──────────────────────────────── */}
      {strategyOnlyConcepts.length > 0 && (
        <section className="px-4 sm:px-8 pb-16 border-t border-slate-200/70 pt-12 mt-4 bg-slate-50/40">
          <div className="max-w-6xl mx-auto space-y-6">
            <SectionHeader
              eyebrow="Estrategia creativa"
              title="Ángulos en desarrollo"
              subtitle="Estos conceptos aún no tienen piezas producidas. Te los compartimos para alinear la dirección."
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {strategyOnlyConcepts.map((c) => <StrategyConceptCard key={c.id} concept={c} />)}
            </div>
          </div>
        </section>
      )}

      {!hasAssets && !hasConcepts && (
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-24 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
              <rect x="4" y="4" width="16" height="16" rx="3" />
              <path d="M4 10h16" />
            </svg>
          </div>
          <p className="text-sm text-slate-500">Sin contenido disponible por el momento.</p>
        </div>
      )}
    </ClientPortalShell>
  )
}

// ─────────────────────────────────────────────────────────────────
// KPI card
// ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, tone }: {
  label: string
  value: string | number
  tone: "amber" | "emerald" | "sky" | "violet" | "slate"
}) {
  const toneStyles: Record<typeof tone, { dot: string; value: string }> = {
    amber:   { dot: "bg-amber-400",   value: "text-amber-700" },
    emerald: { dot: "bg-emerald-400", value: "text-emerald-700" },
    sky:     { dot: "bg-sky-400",     value: "text-sky-700" },
    violet:  { dot: "bg-violet-400",  value: "text-violet-700" },
    slate:   { dot: "bg-slate-300",   value: "text-slate-700" },
  }
  const t = toneStyles[tone]
  return (
    <div className="rounded-xl bg-white border border-slate-200/70 px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
      </div>
      <p className={`text-2xl font-bold tabular-nums tracking-tight ${t.value}`}>{value}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Review banner
// ─────────────────────────────────────────────────────────────────

function ReviewBanner({ allReviewed, pendingCount, totalAssets }: {
  allReviewed: boolean
  pendingCount: number
  totalAssets: number
}) {
  if (allReviewed) {
    return (
      <div className="rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-emerald-50/30 px-4 sm:px-5 py-4 flex items-center gap-3">
        <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
            <path d="m5 12 5 5L20 7" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-900">Revisión completada</p>
          <p className="text-xs text-emerald-700/80 mt-0.5">
            Las {totalAssets} pieza{totalAssets !== 1 ? "s" : ""} han sido revisadas. Gracias.
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-amber-50/30 px-4 sm:px-5 py-4 flex items-center gap-3">
      <span className="relative w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
        <span className="absolute inset-0 rounded-full bg-amber-400/40 animate-ping" />
        <span className="relative text-xs font-bold tabular-nums">{pendingCount}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-900">
          {pendingCount} pieza{pendingCount !== 1 ? "s" : ""} esperan tu revisión
        </p>
        <p className="text-xs text-amber-800/75 mt-0.5">
          Aprueba lo que te convence o solicita cambios puntuales en cada pieza.
        </p>
      </div>
      <a
        href="#first-pending"
        className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-amber-900 bg-white/70 hover:bg-white ring-1 ring-amber-300/60 rounded-lg px-3 py-1.5 transition-colors flex-shrink-0"
      >
        Ir a revisar
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </a>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Section header
// ─────────────────────────────────────────────────────────────────

function SectionHeader({ eyebrow, title, subtitle }: {
  eyebrow: string
  title: string
  subtitle?: string
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-1 h-10 rounded-full bg-gradient-to-b from-slate-300 to-slate-200 mt-1 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 mb-1">
          {eyebrow}
        </p>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm text-slate-500 mt-1.5 max-w-2xl leading-relaxed">{subtitle}</p>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Concept group — strategy card (sticky) + its assets
// ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ConceptGroup({ concept, assets }: { concept: any | null; assets: any[] }) {
  const pending  = assets.filter((a) => !a.client_status || a.client_status === "pending_review").length
  const approved = assets.filter((a) => a.client_status === "approved").length
  const changes  = assets.filter((a) => a.client_status === "changes_requested").length

  const angleEntry = concept && ANGLE_GUIDE.find((a) => a.name === concept.angle_type)

  return (
    <article className="relative">
      <div className="grid lg:grid-cols-[340px_1fr] gap-6 lg:gap-8">

        {/* Strategy card — sticky on lg+ */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
            {concept ? (
              <>
                <div className="px-5 pt-5 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                    {angleEntry && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-slate-900 text-white px-2 py-0.5 rounded-md">
                        <span>{angleEntry.emoji}</span>
                        {concept.angle_type}
                      </span>
                    )}
                    {concept.funnel_stage && (
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${FUNNEL_COLORS[concept.funnel_stage] ?? "bg-slate-100 text-slate-600"}`}>
                        {FUNNEL_LABELS[concept.funnel_stage] ?? concept.funnel_stage}
                      </span>
                    )}
                    {concept.status === "Evergreen" && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/60">
                        ⭐ Validado
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold tracking-tight leading-snug text-slate-900">
                    {concept.name || "Concepto"}
                  </h3>
                </div>

                <div className="px-5 py-4 space-y-4">
                  {concept.product_service && (
                    <StrategyField label="Producto / Servicio" value={concept.product_service} />
                  )}
                  <StrategyField label="A quién le hablamos" value={concept.target_persona} />
                  {concept.pain_point && (
                    <StrategyField label="Problema" value={concept.pain_point} accent="rose" />
                  )}
                  {concept.transformation && (
                    <StrategyField label="Transformación" value={concept.transformation} accent="emerald" />
                  )}
                  {concept.why_it_works && (
                    <StrategyField label="Por qué conecta" value={concept.why_it_works} />
                  )}
                </div>
              </>
            ) : (
              <div className="px-5 py-6">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Piezas sueltas</p>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Contenido adicional que no está vinculado a un concepto específico.
                </p>
              </div>
            )}

            {/* Asset counts footer */}
            <div className="px-5 py-3 bg-slate-50/70 border-t border-slate-100 flex items-center gap-3 text-[11px]">
              <span className="font-semibold text-slate-700">
                {assets.length} pieza{assets.length !== 1 ? "s" : ""}
              </span>
              <span className="text-slate-300">·</span>
              {pending > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  {pending} pendiente{pending !== 1 ? "s" : ""}
                </span>
              )}
              {approved > 0 && (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {approved}
                </span>
              )}
              {changes > 0 && (
                <span className="inline-flex items-center gap-1 text-sky-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                  {changes}
                </span>
              )}
            </div>
          </div>
        </aside>

        {/* Assets column */}
        <div className="space-y-4 min-w-0">
          {assets.map((a, idx) => (
            <div key={a.id} id={idx === 0 && pending > 0 ? "first-pending" : undefined}>
              <AssetReviewWrap asset={a} />
            </div>
          ))}
        </div>
      </div>
    </article>
  )
}

function StrategyField({ label, value, accent }: {
  label: string
  value: string | null | undefined
  accent?: "rose" | "emerald"
}) {
  if (!value) return null
  const dot = accent === "rose" ? "bg-rose-400" : accent === "emerald" ? "bg-emerald-400" : "bg-slate-300"
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-1 flex items-center gap-1.5">
        <span className={`w-1 h-1 rounded-full ${dot}`} />
        {label}
      </p>
      <p className="text-[13px] leading-relaxed text-slate-700">{value}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Asset review wrapper
// ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AssetReviewWrap({ asset: a }: { asset: any }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const concept = a.concept as any
  return (
    <ClientAssetReview
      asset={{
        id:              a.id,
        format:          a.format,
        platform:        a.platform,
        asset_url:       a.asset_url,
        file_path:       a.file_path ?? null,
        thumbnail_path:  a.thumbnail_path ?? null,
        file_type:       a.file_type ?? null,
        client_status:   a.client_status as any,
        client_feedback: a.client_feedback,
        concept_name:    concept?.name ?? null,
        concept_angle:   concept?.angle_type ?? null,
      }}
    />
  )
}

// ─────────────────────────────────────────────────────────────────
// Strategy-only concept card (no assets yet)
// ─────────────────────────────────────────────────────────────────

function StrategyConceptCard({ concept }: {
  concept: {
    id: string
    name: string | null
    angle_type: string | null
    target_persona: string
    product_service: string | null
    pain_point: string | null
    why_it_works: string | null
    transformation: string | null
    funnel_stage: string | null
    status: string
  }
}) {
  const angleEntry  = ANGLE_GUIDE.find((a) => a.name === concept.angle_type)
  const isEvergreen = concept.status === "Evergreen"

  return (
    <div className={`group bg-white rounded-2xl border ${isEvergreen ? "border-amber-200" : "border-slate-200/70"} shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden flex flex-col hover:shadow-md transition-shadow`}>
      <div className={`px-5 pt-5 pb-4 border-b border-slate-100 ${isEvergreen ? "bg-amber-50/30" : ""}`}>
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {angleEntry && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-slate-900 text-white px-2 py-0.5 rounded-md">
              <span>{angleEntry.emoji}</span>{concept.angle_type}
            </span>
          )}
          {concept.funnel_stage && (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${FUNNEL_COLORS[concept.funnel_stage] ?? "bg-slate-100 text-slate-600"}`}>
              {FUNNEL_LABELS[concept.funnel_stage] ?? concept.funnel_stage}
            </span>
          )}
          {isEvergreen && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/60">
              ⭐ Validado
            </span>
          )}
        </div>
        <p className="text-base font-bold leading-snug text-slate-900">{concept.name || "Concepto"}</p>
      </div>
      <div className="px-5 py-4 space-y-3 flex-1 text-[13px]">
        {concept.product_service && <StrategyField label="Producto / Servicio" value={concept.product_service} />}
        <StrategyField label="A quién le hablamos" value={concept.target_persona} />
        {concept.pain_point     && <StrategyField label="Problema" value={concept.pain_point} accent="rose" />}
        {concept.transformation && <StrategyField label="Transformación" value={concept.transformation} accent="emerald" />}
        {concept.why_it_works   && <StrategyField label="Por qué conecta" value={concept.why_it_works} />}
      </div>
    </div>
  )
}
