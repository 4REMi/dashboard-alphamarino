import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { ClientPortalShell } from "@/components/share/client-portal-shell"
import { BrandLineTabs } from "@/components/share/brand-line-tabs"
import { ConceptMasterDetail } from "@/components/share/concept-master-detail"
import type { AdCloneLine } from "@/lib/types"

interface Props {
  params: Promise<{ projectId: string }>
}


export default async function ShareConceptsPage({ params }: Props) {
  const { projectId } = await params
  const supabase = createAdminClient()

  const [projectRes, conceptsRes, assetsRes, settingsRes, scriptsRes, activeCycleRes] = await Promise.all([
    supabase
      .from("projects")
      .select("name, brand_brain_id, customer:customers(name, company)")
      .eq("id", projectId)
      .single(),
    supabase
      .from("creative_concepts")
      .select(`id, name, angle_type, organizing_principle, target_persona, product_service,
               pain_point, objection, why_it_works, transformation, funnel_stage, awareness_stage, status, brand_line_id, cycle_id`)
      .eq("project_id", projectId)
      .in("status", ["Active", "Evergreen"])
      .order("status", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("creative_assets")
      .select(`id, format, platform, asset_url, file_path, thumbnail_path, file_type, brief_id,
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
    supabase
      .from("creative_briefs")
      .select("id, concept_id, adapted_script, script_reviews")
      .eq("project_id", projectId)
      .not("adapted_script", "is", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("paid_media_cycles")
      .select("id")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .maybeSingle(),
  ])

  if (projectRes.error || !projectRes.data) notFound()

  const project  = projectRes.data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customer = project.customer as any
  const activeCycleId = activeCycleRes.data?.id ?? null
  // Only show concepts from the current cycle (or evergreen concepts, which
  // live at the project level with no cycle) — otherwise every past month's
  // concepts keep piling up on the client with no way to tell them apart.
  const concepts = (conceptsRes.data ?? []).filter(
    (c: any) => !c.cycle_id || c.cycle_id === activeCycleId
  )
  const assets      = assetsRes.data ?? []
  const briefsData  = scriptsRes.data ?? []

  // Normalize adapted_script (Record<adId, lines[]> or legacy lines[]) into one
  // reviewable card per script, scoped to the fields the client is allowed to see.
  // Each script's review state is looked up independently via script_reviews[scriptKey] —
  // never shared across scripts in the same brief.
  type ClientScript = { key: string; briefId: string; scriptKey: string; conceptId: string; lines: AdCloneLine[]; client_status: any; client_feedback: string | null }
  const scripts: ClientScript[] = []
  for (const b of briefsData) {
    const raw = b.adapted_script as Record<string, AdCloneLine[]> | AdCloneLine[] | null
    if (!raw) continue
    const reviews = (b.script_reviews as Record<string, { client_status: any; client_feedback: string | null }>) ?? {}
    if (Array.isArray(raw)) {
      if (raw.length > 0) {
        const r = reviews["_single"]
        scripts.push({ key: b.id, briefId: b.id, scriptKey: "_single", conceptId: b.concept_id, lines: raw, client_status: r?.client_status ?? null, client_feedback: r?.client_feedback ?? null })
      }
    } else {
      Object.entries(raw).forEach(([adId, lines]) => {
        if (lines?.length) {
          const r = reviews[adId]
          scripts.push({ key: `${b.id}:${adId}`, briefId: b.id, scriptKey: adId, conceptId: b.concept_id, lines, client_status: r?.client_status ?? null, client_feedback: r?.client_feedback ?? null })
        }
      })
    }
  }
  const scriptsByConcept = new Map<string, ClientScript[]>()
  for (const s of scripts) {
    if (!scriptsByConcept.has(s.conceptId)) scriptsByConcept.set(s.conceptId, [])
    scriptsByConcept.get(s.conceptId)!.push(s)
  }
  const pendingScriptsCount = scripts.filter((s) => !s.client_status || s.client_status === "pending_review").length

  // Fetch brand lines for grouping
  const brandLines: { id: string; name: string; color: string | null; position: number }[] =
    (project as any).brand_brain_id
      ? ((await supabase.from("brand_lines").select("id, name, color, position").eq("brand_brain_id", (project as any).brand_brain_id).order("position")).data ?? [])
      : []

  const clientName  = customer?.company || customer?.name || null
  const projectName = project.name
  const logoUrl     = settingsRes.data?.logo_url ?? null

  // KPIs
  const totalAssets   = assets.length
  const pendingCount  = assets.filter((a) => !a.client_status || a.client_status === "pending_review").length
  const approvedCount = assets.filter((a) => a.client_status === "approved").length
  const changesCount  = assets.filter((a) => a.client_status === "changes_requested").length
  const allReviewed   = (totalAssets > 0 || scripts.length > 0) && pendingCount === 0 && pendingScriptsCount === 0
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

  // Order: concepts that have pending assets or scripts first
  const conceptsWithAssets = concepts
    .map((c) => ({
      concept: c,
      assets: assetsByConcept.get(c.id) ?? [],
      scripts: scriptsByConcept.get(c.id) ?? [],
    }))
    .filter((g) => g.assets.length > 0 || g.scripts.length > 0)
  const conceptsPendingFirst = [...conceptsWithAssets].sort((a, b) => {
    const pa = a.assets.filter((x) => !x.client_status || x.client_status === "pending_review").length
      + a.scripts.filter((x) => !x.client_status || x.client_status === "pending_review").length
    const pb = b.assets.filter((x) => !x.client_status || x.client_status === "pending_review").length
      + b.scripts.filter((x) => !x.client_status || x.client_status === "pending_review").length
    return pb - pa
  })

  // Concepts with no assets and no scripts (strategy-only)
  const strategyOnlyConcepts = concepts.filter((c) =>
    (assetsByConcept.get(c.id) ?? []).length === 0 && (scriptsByConcept.get(c.id) ?? []).length === 0
  )

  // Group by brand line
  const hasBrandLines = brandLines.length > 0
  type LineGroup = { line: typeof brandLines[number] | null; items: typeof conceptsPendingFirst; strategyOnly: typeof strategyOnlyConcepts }
  const lineGroups: LineGroup[] = hasBrandLines
    ? [
        ...brandLines.map((l) => ({
          line: l,
          items: conceptsPendingFirst.filter((g) => g.concept.brand_line_id === l.id),
          strategyOnly: strategyOnlyConcepts.filter((c) => c.brand_line_id === l.id),
        })),
        {
          line: null,
          items: conceptsPendingFirst.filter((g) => !g.concept.brand_line_id),
          strategyOnly: strategyOnlyConcepts.filter((c) => !c.brand_line_id),
        },
      ].filter((g) => g.items.length > 0 || g.strategyOnly.length > 0)
    : []

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

          {(hasAssets || scripts.length > 0) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <KpiCard
                label="Por revisar"
                value={pendingCount}
                tone={pendingCount > 0 ? "amber" : "slate"}
              />
              <KpiCard label="Aprobados" value={approvedCount} tone="emerald" />
              <KpiCard label="Cambios solicitados" value={changesCount} tone="sky" />
              {scripts.length > 0 ? (
                <KpiCard label="Guiones por revisar" value={pendingScriptsCount} tone={pendingScriptsCount > 0 ? "amber" : "slate"} />
              ) : (
                <KpiCard label="Progreso" value={`${reviewedPct}%`} tone="violet" />
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Review banner ───────────────────────────────────────── */}
      {(hasAssets || scripts.length > 0) && (
        <div className="px-4 sm:px-8 pb-4">
          <div className="max-w-6xl mx-auto">
            <ReviewBanner
              allReviewed={allReviewed}
              pendingCount={pendingCount}
              totalAssets={totalAssets}
              pendingScriptsCount={pendingScriptsCount}
              totalScripts={scripts.length}
            />
          </div>
        </div>
      )}

      {/* ── Concepts + Assets (grouped by brand line, tabbed) ───── */}
      {hasBrandLines && lineGroups.length > 0 && (
        <section className="px-4 sm:px-8 pb-10">
          <div className="max-w-6xl mx-auto mb-8">
            <SectionHeader
              eyebrow="Conceptos en revisión"
              title="Los ángulos y sus piezas"
              subtitle="Cada concepto agrupa su guión (si aplica) y las piezas creativas que lo desarrollan. Aprueba o pide cambios en cada etapa."
            />
          </div>
          <BrandLineTabs
            tabs={lineGroups.map((group) => {
              const items = [
                ...(group.line === null ? unlinked.length ? [{ id: "__unlinked__", concept: null, assets: unlinked, scripts: [] }] : [] : []),
                ...group.items.map((g) => ({ id: g.concept.id, concept: g.concept, assets: g.assets, scripts: g.scripts })),
                ...group.strategyOnly.map((c: any) => ({ id: c.id, concept: c, assets: [], scripts: [] })),
              ]
              return {
                key:   group.line?.id ?? "__general__",
                label: group.line?.name ?? "General",
                color: group.line?.color ?? null,
                count: items.length,
                content: (
                  <div className="max-w-4xl mx-auto">
                    <ConceptMasterDetail items={items} />
                  </div>
                ),
              }
            })}
          />
        </section>
      )}

      {/* ── Concepts + Assets (flat — no brand lines) ──────────── */}
      {!hasBrandLines && (hasAssets || scripts.length > 0 || strategyOnlyConcepts.length > 0) && (
        <section className="px-4 sm:px-8 pb-10">
          <div className="max-w-6xl mx-auto space-y-10">
            <SectionHeader
              eyebrow="Conceptos en revisión"
              title="Los ángulos y sus piezas"
              subtitle="Cada concepto agrupa su guión (si aplica) y las piezas creativas que lo desarrollan. Aprueba o pide cambios en cada etapa."
            />

            <div className="max-w-4xl mx-auto">
              <ConceptMasterDetail
                items={[
                  ...(unlinked.length ? [{ id: "__unlinked__", concept: null, assets: unlinked, scripts: [] }] : []),
                  ...conceptsPendingFirst.map(({ concept, assets: a, scripts: s }) => ({ id: concept.id, concept, assets: a, scripts: s })),
                  ...strategyOnlyConcepts.map((c: any) => ({ id: c.id, concept: c, assets: [], scripts: [] })),
                ]}
              />
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

function ReviewBanner({ allReviewed, pendingCount, totalAssets, pendingScriptsCount, totalScripts }: {
  allReviewed: boolean
  pendingCount: number
  totalAssets: number
  pendingScriptsCount: number
  totalScripts: number
}) {
  if (allReviewed) {
    const parts = [
      totalAssets > 0 ? `${totalAssets} pieza${totalAssets !== 1 ? "s" : ""}` : null,
      totalScripts > 0 ? `${totalScripts} guión${totalScripts !== 1 ? "es" : ""}` : null,
    ].filter(Boolean).join(" y ")
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
            {parts} han sido revisados. Gracias.
          </p>
        </div>
      </div>
    )
  }
  const totalPending = pendingCount + pendingScriptsCount
  const label = [
    pendingScriptsCount > 0 ? `${pendingScriptsCount} guión${pendingScriptsCount !== 1 ? "es" : ""}` : null,
    pendingCount > 0 ? `${pendingCount} pieza${pendingCount !== 1 ? "s" : ""}` : null,
  ].filter(Boolean).join(" y ")
  return (
    <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-amber-50/30 px-4 sm:px-5 py-4 flex items-center gap-3">
      <span className="relative w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
        <span className="absolute inset-0 rounded-full bg-amber-400/40 animate-ping" />
        <span className="relative text-xs font-bold tabular-nums">{totalPending}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-900">
          {label} esperan tu revisión
        </p>
        <p className="text-xs text-amber-800/75 mt-0.5">
          Aprueba lo que te convence o solicita cambios puntuales en cada etapa.
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


