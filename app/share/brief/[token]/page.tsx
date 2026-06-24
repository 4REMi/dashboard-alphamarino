import { notFound } from "next/navigation"
import { getBriefByToken } from "@/lib/actions/creatives"
import type { AdCloneLine } from "@/lib/types"
import { ANGLE_GUIDE } from "@/lib/constants/creatives"
import { BriefReferences } from "@/components/share/brief-references"

interface Props {
  params: Promise<{ token: string }>
}

const AWARENESS_LABELS: Record<string, string> = {
  "1": "Inconsciente",
  "2": "Consciente del problema",
  "3": "Consciente de la solución",
  "4": "Consciente del producto",
  "5": "Totalmente consciente",
}

const FUNNEL_LABELS: Record<string, string> = {
  TOF: "Audiencia fría",
  MOF: "Audiencia tibia",
  BOF: "Audiencia caliente",
}

export default async function ShareBriefPage({ params }: Props) {
  const { token } = await params
  const brief = await getBriefByToken(token)
  if (!brief) notFound()

  const concept = brief.concept as Record<string, string | number | null> | null
  const brain = brief.brand_brain as Record<string, string | null> | null
  const script = brief.adapted_script as AdCloneLine[] | null
  const attachedAds = (brief as any).attached_ads as any[] | undefined

  const angleEntry = concept?.angle_type ? ANGLE_GUIDE.find((a) => a.name === concept.angle_type) : null

  const references: { id: string; type: "video" | "image"; name: string; videoSrc?: string; thumbSrc?: string; script?: AdCloneLine[] }[] = []

  const videoAds = attachedAds?.filter((a) => a.format === "video" || a.cached_video_url || a.video_url) ?? []
  const imageAds = attachedAds?.filter((a) => a.format !== "video" && !a.cached_video_url && !a.video_url) ?? []

  videoAds.forEach((ad) => {
    references.push({
      id: ad.id,
      type: "video",
      name: ad.page_name ?? "Video",
      videoSrc: ad.cached_video_url || ad.video_url || undefined,
      thumbSrc: ad.cached_image_url || ad.image_url || undefined,
      script: script ?? undefined,
    })
  })

  imageAds.forEach((ad) => {
    references.push({
      id: ad.id,
      type: "image",
      name: ad.page_name ?? "Imagen",
      thumbSrc: ad.cached_image_url || ad.image_url || undefined,
    })
  })

  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      <header className="border-b border-gray-200 bg-white sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-0.5">
              Alpha Marino · Creative Brief
            </p>
            <h1 className="text-lg font-bold text-gray-900">
              {concept?.name ?? concept?.angle_type ?? "Brief Creativo"}
            </h1>
          </div>
          {brain && (
            <div className="text-right">
              <p className="text-xs text-gray-500">Brand Brain</p>
              <p className="text-sm font-semibold text-gray-900">{brain.name}</p>
              {brain.industry ? <p className="text-xs text-gray-400">{brain.industry}</p> : null}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        {/* ── Concept Angle Card ── */}
        {concept && (
          <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
              <div className="flex items-center gap-3 flex-wrap">
                {angleEntry && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold bg-gray-900 text-white px-3 py-1 rounded-lg">
                    <span className="text-base">{angleEntry.emoji}</span>
                    {concept.angle_type}
                  </span>
                )}
                {concept.funnel_stage && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200/60">
                    {FUNNEL_LABELS[concept.funnel_stage as string] ?? concept.funnel_stage}
                  </span>
                )}
                {concept.awareness_stage && (
                  <span className="text-xs text-gray-500">
                    Stage {concept.awareness_stage} · {AWARENESS_LABELS[concept.awareness_stage as string] ?? ""}
                  </span>
                )}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
              {concept.target_persona && (
                <AngleField label="Persona objetivo" value={concept.target_persona as string} />
              )}
              {concept.pain_point && (
                <AngleField label="Pain Point" value={concept.pain_point as string} accent="rose" />
              )}
              {concept.transformation && (
                <AngleField label="Transformación" value={concept.transformation as string} accent="emerald" />
              )}
              {concept.why_it_works && (
                <AngleField label="Por qué funciona" value={concept.why_it_works as string} />
              )}
              {concept.product_service && (
                <AngleField label="Producto / Servicio" value={concept.product_service as string} />
              )}
              {concept.organizing_principle && (
                <AngleField label="Principio organizador" value={concept.organizing_principle as string} />
              )}
            </div>
          </section>
        )}

        {/* ── References (accordion) ── */}
        {references.length > 0 ? (
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-1 h-6 rounded-full bg-gray-300" />
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                Referencias ({references.length})
              </p>
            </div>
            <BriefReferences references={references} />
          </section>
        ) : (
          <div className="text-center py-16">
            <p className="text-sm text-gray-400">Brief sin referencias multimedia.</p>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 bg-white mt-8">
        <div className="max-w-5xl mx-auto px-6 py-4 text-center">
          <p className="text-xs text-gray-400">Brief generado por Alpha Marino · Paint Media</p>
        </div>
      </footer>
    </div>
  )
}

function AngleField({ label, value, accent }: { label: string; value: string; accent?: "rose" | "emerald" }) {
  const dot = accent === "rose" ? "bg-rose-400" : accent === "emerald" ? "bg-emerald-400" : "bg-gray-300"
  return (
    <div className="px-6 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 mb-1 flex items-center gap-1.5">
        <span className={`w-1 h-1 rounded-full ${dot}`} />
        {label}
      </p>
      <p className="text-[13px] leading-relaxed text-gray-700">{value}</p>
    </div>
  )
}
