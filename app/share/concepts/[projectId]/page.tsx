import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { ANGLE_GUIDE } from "@/lib/constants/creatives"

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

  const [projectRes, conceptsRes] = await Promise.all([
    supabase
      .from("projects")
      .select("name, customer:customers(name, company)")
      .eq("id", projectId)
      .single(),
    supabase
      .from("creative_concepts")
      .select(`
        id, name, angle_type, organizing_principle,
        target_persona, product_service,
        pain_point, why_it_works, transformation,
        funnel_stage, status
      `)
      .eq("project_id", projectId)
      .in("status", ["Active", "Evergreen"])
      .order("status", { ascending: false })   // Evergreen sorts before Active
      .order("created_at", { ascending: false }),
  ])

  if (projectRes.error || !projectRes.data) notFound()

  const project   = projectRes.data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customer  = project.customer as any
  const concepts  = conceptsRes.data ?? []

  const evergreen = concepts.filter((c) => c.status === "Evergreen")
  const active    = concepts.filter((c) => c.status === "Active")

  const clientName  = customer?.company || customer?.name || null
  const projectName = project.name

  return (
    <div className="min-h-screen bg-[#f8f9fc] flex flex-col">

      {/* Top bar */}
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold tracking-tight">Alpha Marino</span>
        <span className="text-xs text-muted-foreground">Conceptos Creativos</span>
      </header>

      <main className="flex-1 px-4 py-10">
        <div className="max-w-4xl mx-auto space-y-8">

          {/* Project context */}
          <div className="space-y-1">
            {clientName && (
              <p className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">{clientName}</p>
            )}
            <h1 className="text-2xl font-bold">{projectName}</h1>
            <p className="text-sm text-muted-foreground">
              {concepts.length} concepto{concepts.length !== 1 ? "s" : ""} activos
              {evergreen.length > 0 && ` · ${evergreen.length} evergreen`}
            </p>
          </div>

          {/* Evergreen group */}
          {evergreen.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-base">⭐</span>
                <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wider">
                  Ángulos Evergreen — validados con este cliente
                </h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {evergreen.map((c) => (
                  <ConceptCard key={c.id} concept={c} />
                ))}
              </div>
            </section>
          )}

          {/* Active group */}
          {active.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Conceptos activos en desarrollo
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {active.map((c) => (
                  <ConceptCard key={c.id} concept={c} />
                ))}
              </div>
            </section>
          )}

          {concepts.length === 0 && (
            <div className="text-center py-20 text-muted-foreground text-sm">
              Sin conceptos activos en este momento.
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

const FUNNEL_LABELS_LOCAL = FUNNEL_LABELS
const FUNNEL_COLORS_LOCAL = FUNNEL_COLORS

function ConceptCard({ concept }: {
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
  const angleEntry = ANGLE_GUIDE.find((a) => a.name === concept.angle_type)
  const isEvergreen = concept.status === "Evergreen"

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col ${isEvergreen ? "border-amber-200" : ""}`}>

      {/* Card header */}
      <div className={`px-5 pt-5 pb-4 border-b ${isEvergreen ? "bg-amber-50/40" : "bg-gradient-to-br from-white to-muted/10"}`}>
        <p className="text-base font-semibold leading-snug mb-2">
          {concept.name || "Concepto"}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {angleEntry && (
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-foreground/5 px-2.5 py-1 rounded-full">
              <span>{angleEntry.emoji}</span>
              {concept.angle_type}
            </span>
          )}
          {concept.funnel_stage && (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${FUNNEL_COLORS_LOCAL[concept.funnel_stage] ?? "bg-gray-100 text-gray-600"}`}>
              {FUNNEL_LABELS_LOCAL[concept.funnel_stage] ?? concept.funnel_stage}
            </span>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="px-5 py-4 space-y-3 flex-1">
        {concept.product_service && (
          <MiniField label="Producto / Servicio" value={concept.product_service} />
        )}
        <MiniField label="A quién le hablamos" value={concept.target_persona} />
        {concept.pain_point && (
          <MiniField label="Problema que resolvemos" value={concept.pain_point} accent="red" />
        )}
        {concept.transformation && (
          <MiniField label="Resultado que prometemos" value={concept.transformation} accent="green" />
        )}
        {concept.why_it_works && (
          <MiniField label="Por qué conecta" value={concept.why_it_works} />
        )}
      </div>
    </div>
  )
}

function MiniField({
  label,
  value,
  accent,
}: {
  label: string
  value: string | null | undefined
  accent?: "red" | "green"
}) {
  if (!value) return null
  const dot =
    accent === "red"   ? "bg-red-400"      :
    accent === "green" ? "bg-emerald-400"  :
    "bg-border"

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
