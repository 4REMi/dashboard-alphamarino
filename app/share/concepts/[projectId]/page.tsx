import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { ANGLE_GUIDE } from "@/lib/constants/creatives"
import { ClientAssetReview } from "@/components/share/client-asset-review"

interface Props {
  params: Promise<{ projectId: string }>
}

const FUNNEL_COLORS: Record<string, string> = {
  TOF: "bg-sky-100 text-sky-700",
  MOF: "bg-violet-100 text-violet-700",
  BOF: "bg-emerald-100 text-emerald-700",
}
const FUNNEL_LABELS: Record<string, string> = {
  TOF: "Audiencia fría",
  MOF: "Audiencia tibia",
  BOF: "Audiencia caliente",
}

export default async function ShareConceptsPage({ params }: Props) {
  const { projectId } = await params
  const supabase = createAdminClient()

  const [projectRes, conceptsRes, assetsRes] = await Promise.all([
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
      .select(`id, format, platform, variant, iteration,
               hook, copy, cta, asset_url, format_meta,
               client_status, client_feedback,
               concept:creative_concepts!concept_id(name, angle_type)`)
      .eq("project_id", projectId)
      .eq("client_visible", true)
      .order("created_at", { ascending: false }),
  ])

  if (projectRes.error || !projectRes.data) notFound()

  const project  = projectRes.data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customer = project.customer as any
  const concepts = conceptsRes.data ?? []
  const assets   = assetsRes.data ?? []

  const evergreen = concepts.filter((c) => c.status === "Evergreen")
  const active    = concepts.filter((c) => c.status === "Active")

  const clientName  = customer?.company || customer?.name || null
  const projectName = project.name

  const pendingCount  = assets.filter((a) => !a.client_status || a.client_status === "pending_review").length
  const allReviewed   = assets.length > 0 && pendingCount === 0
  const hasAssets     = assets.length > 0
  const hasConcepts   = concepts.length > 0

  return (
    <div className="min-h-screen bg-[#f5f6fa] flex flex-col">

      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tracking-tight flex-shrink-0">Alpha Marino</span>
        {clientName && (
          <span className="text-xs text-muted-foreground truncate">
            {clientName} — Portal
          </span>
        )}
      </header>

      <main className="flex-1">

        {/* ── Hero ── */}
        <div className="bg-white border-b">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-4">
            {clientName && (
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Alpha Marino × {clientName}
              </p>
            )}
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{projectName}</h1>

            {/* Status pills */}
            <div className="flex flex-wrap gap-2 pt-1">
              {hasAssets && (
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${
                  allReviewed
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${allReviewed ? "bg-emerald-500" : "bg-amber-500"}`} />
                  {allReviewed
                    ? "Todo revisado"
                    : `${pendingCount} pieza${pendingCount !== 1 ? "s" : ""} esperan tu revisión`}
                </span>
              )}
              {hasConcepts && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-slate-100 text-slate-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  {concepts.length} concepto{concepts.length !== 1 ? "s" : ""} activos
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-14">

          {/* ── Assets para revisión ── */}
          {hasAssets && (
            <section className="space-y-5">
              {/* Section header */}
              <div className={`flex items-center gap-3 pb-3 border-b-2 ${allReviewed ? "border-emerald-300" : "border-amber-300"}`}>
                <div className={`w-1 h-6 rounded-full flex-shrink-0 ${allReviewed ? "bg-emerald-400" : "bg-amber-400"}`} />
                <div>
                  <h2 className="text-base font-semibold">
                    {allReviewed ? "Tu revisión — completada" : "Para tu revisión"}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {allReviewed
                      ? "Todas las piezas han sido revisadas. Gracias."
                      : "Aprueba cada pieza o solicita los cambios que necesites."}
                  </p>
                </div>
              </div>

              {/* Asset grid */}
              <div className="grid gap-4 xl:grid-cols-2">
                {assets.map((a) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const concept = a.concept as any
                  return (
                    <ClientAssetReview
                      key={a.id}
                      asset={{
                        id:              a.id,
                        format:          a.format,
                        platform:        a.platform,
                        variant:         a.variant,
                        iteration:       a.iteration,
                        hook:            a.hook,
                        copy:            a.copy,
                        cta:             a.cta,
                        asset_url:       a.asset_url,
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        format_meta:     a.format_meta as any,
                        client_status:   a.client_status as any,
                        client_feedback: a.client_feedback,
                        concept_name:    concept?.name ?? null,
                        concept_angle:   concept?.angle_type ?? null,
                      }}
                    />
                  )
                })}
              </div>
            </section>
          )}

          {/* ── Estrategia creativa ── */}
          {hasConcepts && (
            <section className="space-y-8">
              {/* Section header */}
              <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-200">
                <div className="w-1 h-6 rounded-full flex-shrink-0 bg-slate-300" />
                <div>
                  <h2 className="text-base font-semibold">Estrategia creativa</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Los ángulos y mensajes que guían tu comunicación.
                  </p>
                </div>
              </div>

              {/* Evergreen */}
              {evergreen.length > 0 && (
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                    <span>⭐</span> Ángulos validados contigo
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {evergreen.map((c) => <ConceptCard key={c.id} concept={c} />)}
                  </div>
                </div>
              )}

              {/* Active */}
              {active.length > 0 && (
                <div className="space-y-4">
                  {evergreen.length > 0 && (
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Propuestas en desarrollo
                    </p>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {active.map((c) => <ConceptCard key={c.id} concept={c} />)}
                  </div>
                </div>
              )}
            </section>
          )}

          {!hasAssets && !hasConcepts && (
            <div className="text-center py-24 text-muted-foreground text-sm">
              Sin contenido disponible por el momento.
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t bg-white mt-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            ¿Tienes dudas?{" "}
            <a href="mailto:remioi622@gmail.com" className="underline hover:text-foreground transition-colors">
              remioi622@gmail.com
            </a>
          </span>
          <span>© {new Date().getFullYear()} Alpha Marino</span>
        </div>
      </footer>

    </div>
  )
}

// ── Concept card ─────────────────────────────────────────────────────────────

function ConceptCard({ concept }: {
  concept: {
    id: string; name: string | null; angle_type: string | null
    target_persona: string; product_service: string | null
    pain_point: string | null; why_it_works: string | null
    transformation: string | null; funnel_stage: string | null; status: string
  }
}) {
  const angleEntry  = ANGLE_GUIDE.find((a) => a.name === concept.angle_type)
  const isEvergreen = concept.status === "Evergreen"

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col ${isEvergreen ? "border-amber-200" : ""}`}>
      <div className={`px-5 pt-5 pb-4 border-b ${isEvergreen ? "bg-amber-50/40" : ""}`}>
        <p className="text-base font-semibold leading-snug mb-2">{concept.name || "Concepto"}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {angleEntry && (
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-foreground/5 px-2.5 py-1 rounded-full">
              <span>{angleEntry.emoji}</span>{concept.angle_type}
            </span>
          )}
          {concept.funnel_stage && (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${FUNNEL_COLORS[concept.funnel_stage] ?? "bg-gray-100 text-gray-600"}`}>
              {FUNNEL_LABELS[concept.funnel_stage] ?? concept.funnel_stage}
            </span>
          )}
        </div>
      </div>
      <div className="px-5 py-4 space-y-3 flex-1">
        {concept.product_service && <MiniField label="Producto / Servicio" value={concept.product_service} />}
        <MiniField label="A quién le hablamos" value={concept.target_persona} />
        {concept.pain_point     && <MiniField label="Problema que resolvemos" value={concept.pain_point} accent="red" />}
        {concept.transformation && <MiniField label="Resultado que prometemos" value={concept.transformation} accent="green" />}
        {concept.why_it_works   && <MiniField label="Por qué conecta" value={concept.why_it_works} />}
      </div>
    </div>
  )
}

function MiniField({ label, value, accent }: { label: string; value: string | null | undefined; accent?: "red" | "green" }) {
  if (!value) return null
  const dot = accent === "red" ? "bg-red-400" : accent === "green" ? "bg-emerald-400" : "bg-border"
  return (
    <div className="flex gap-3">
      <div className={`w-0.5 rounded-full flex-shrink-0 mt-1 self-stretch ${dot}`} />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">{label}</p>
        <p className="text-sm leading-relaxed">{value}</p>
      </div>
    </div>
  )
}
