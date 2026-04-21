import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { ANGLE_GUIDE } from "@/lib/constants/creatives"

interface Props {
  params: Promise<{ id: string }>
}

const FUNNEL_LABELS: Record<string, string> = {
  TOF: "Audiencia fría (TOF)",
  MOF: "Audiencia tibia (MOF)",
  BOF: "Audiencia caliente (BOF)",
}

const FUNNEL_COLORS: Record<string, string> = {
  TOF: "bg-sky-100 text-sky-700",
  MOF: "bg-violet-100 text-violet-700",
  BOF: "bg-emerald-100 text-emerald-700",
}

export default async function ShareConceptPage({ params }: Props) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: concept, error } = await supabase
    .from("creative_concepts")
    .select(`
      id, name, angle_type, organizing_principle,
      target_persona, product_service,
      pain_point, why_it_works, transformation, funnel_stage,
      project:projects(name, customer:customers(name, company))
    `)
    .eq("id", id)
    .single()

  if (error || !concept) notFound()

  const angleEntry = ANGLE_GUIDE.find((a) => a.name === concept.angle_type)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project = concept.project as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customer = project?.customer as any

  const clientName  = customer?.company || customer?.name || null
  const projectName = project?.name || null

  return (
    <div className="min-h-screen bg-[#f8f9fc] flex flex-col">

      {/* Top bar */}
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold tracking-tight">Alpha Marino</span>
        <span className="text-xs text-muted-foreground">Concepto Creativo</span>
      </header>

      {/* Content */}
      <main className="flex-1 flex justify-center px-4 py-10">
        <div className="w-full max-w-2xl space-y-6">

          {/* Client context */}
          {(clientName || projectName) && (
            <div className="space-y-0.5">
              {clientName && (
                <p className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">{clientName}</p>
              )}
              {projectName && (
                <p className="text-base font-medium text-foreground">{projectName}</p>
              )}
            </div>
          )}

          {/* Main card */}
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">

            {/* Card header */}
            <div className="px-7 pt-7 pb-5 border-b bg-gradient-to-br from-white to-muted/20">
              <h1 className="text-2xl font-bold leading-tight mb-3">
                {concept.name || "Concepto creativo"}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                {angleEntry && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium bg-foreground/5 px-3 py-1 rounded-full">
                    <span className="text-base">{angleEntry.emoji}</span>
                    {concept.angle_type}
                  </span>
                )}
                {concept.funnel_stage && (
                  <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${FUNNEL_COLORS[concept.funnel_stage] ?? "bg-gray-100 text-gray-600"}`}>
                    {FUNNEL_LABELS[concept.funnel_stage] ?? concept.funnel_stage}
                  </span>
                )}
              </div>
            </div>

            {/* Card body */}
            <div className="px-7 py-6 space-y-6">

              {concept.product_service && (
                <Field
                  label="Producto o servicio"
                  value={concept.product_service}
                />
              )}

              <Field
                label="A quién le hablamos"
                value={concept.target_persona}
              />

              {concept.pain_point && (
                <Field
                  label="Problema que resolvemos"
                  value={concept.pain_point}
                  accent="red"
                />
              )}

              {concept.why_it_works && (
                <Field
                  label="Por qué este mensaje conecta"
                  value={concept.why_it_works}
                />
              )}

              {concept.transformation && (
                <Field
                  label="Resultado que prometemos"
                  value={concept.transformation}
                  accent="green"
                />
              )}

              {angleEntry && (
                <div className="bg-muted/40 rounded-xl px-5 py-4 space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Fundamento del ángulo
                  </p>
                  <p className="text-sm italic text-muted-foreground leading-relaxed">
                    "{angleEntry.guiding_question}"
                  </p>
                  <p className="text-sm leading-relaxed">{angleEntry.mechanism}</p>
                </div>
              )}
            </div>
          </div>

          {/* Footer note */}
          <p className="text-center text-xs text-muted-foreground pb-4">
            Este documento fue generado por el equipo de Alpha Marino.
          </p>
        </div>
      </main>
    </div>
  )
}

function Field({
  label,
  value,
  accent,
}: {
  label: string
  value: string | null | undefined
  accent?: "red" | "green"
}) {
  if (!value) return null

  const accentBar =
    accent === "red"   ? "bg-red-400"   :
    accent === "green" ? "bg-emerald-400" :
    "bg-border"

  return (
    <div className="flex gap-4">
      <div className={`w-0.5 rounded-full flex-shrink-0 mt-1 self-stretch ${accentBar}`} />
      <div className="space-y-0.5 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="text-sm leading-relaxed">{value}</p>
      </div>
    </div>
  )
}
