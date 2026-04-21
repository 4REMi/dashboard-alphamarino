import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { ANGLE_GUIDE } from "@/lib/constants/creatives"
import { ClientAssetReview } from "@/components/share/client-asset-review"

interface Props {
  params: Promise<{ projectId: string }>
}

const FUNNEL_LABELS: Record<string, string> = {
  TOF: "TOF — Audiencia fría",
  MOF: "MOF — Audiencia tibia",
  BOF: "BOF — Audiencia caliente",
}

const FUNNEL_COLORS: Record<string, string> = {
  TOF: "bg-sky-100 text-sky-700",
  MOF: "bg-violet-100 text-violet-700",
  BOF: "bg-emerald-100 text-emerald-700",
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
      .select(`id, name, angle_type, organizing_principle,
        target_persona, product_service, pain_point, why_it_works,
        transformation, funnel_stage, status`)
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

  return (
    <div className="min-h-screen bg-[#f8f9fc] flex flex-col">

      {/* Top bar */}
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold tracking-tight">Alpha Marino</span>
        <span className="text-xs text-muted-foreground">Portal de cliente</span>
      </header>

      <main className="flex-1 px-4 py-10">
        <div className="max-w-4xl mx-auto space-y-12">

          {/* Project context */}
          <div className="space-y-1">
            {clientName && (
              <p className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">{clientName}</p>
            )}
            <h1 className="text-2xl font-bold">{projectName}</h1>
          </div>

          {/* ── Assets para aprobación ── */}
          {assets.length > 0 && (
            <section className="space-y-5">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">Assets para tu aprobación</h2>
                <p className="text-sm text-muted-foreground">
                  Revisa cada pieza y apruébala o solicita cambios directamente.
                </p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
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

          {/* ── Conceptos creativos ── */}
          {concepts.length > 0 && (
            <section className="space-y-8">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">Conceptos creativos</h2>
                <p className="text-sm text-muted-foreground">
                  {concepts.length} concepto{concepts.length !== 1 ? "s" : ""} activos
                  {evergreen.length > 0 && ` · ${evergreen.length} evergreen`}
                </p>
              </div>

              {evergreen.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⭐</span>
                    <h3 className="text-sm font-semibold text-amber-700 uppercase tracking-wider">
                      Ángulos Evergreen — validados
                    </h3>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {evergreen.map((c) => <ConceptCard key={c.id} concept={c} />)}
                  </div>
                </div>
              )}

              {active.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    En desarrollo
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {active.map((c) => <ConceptCard key={c.id} concept={c} />)}
                  </div>
                </div>
              )}
            </section>
          )}

          {concepts.length === 0 && assets.length === 0 && (
            <div className="text-center py-20 text-muted-foreground text-sm">
              Sin contenido disponible en este momento.
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground pt-4 pb-8">
            Generado por el equipo de Alpha Marino
          </p>
        </div>
      </main>
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
      <div className={`px-5 pt-5 pb-4 border-b ${isEvergreen ? "bg-amber-50/40" : "bg-gradient-to-br from-white to-muted/10"}`}>
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
