import { notFound } from "next/navigation"
import { getBriefByToken } from "@/lib/actions/creatives"
import type { BriefContent, AdCloneLine } from "@/lib/types"
import { Brain, Target, Palette, MessageCircle, CheckCircle2, XCircle, Sparkles, FileText } from "lucide-react"

interface Props {
  params: Promise<{ token: string }>
}

export default async function ShareBriefPage({ params }: Props) {
  const { token } = await params
  const brief = await getBriefByToken(token)
  if (!brief) notFound()

  const content = brief.brief_content as BriefContent
  const concept = brief.concept as Record<string, string | number | null> | null
  const brain = brief.brand_brain as Record<string, string | null> | null
  const script = brief.adapted_script as AdCloneLine[] | null

  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      <header className="border-b border-gray-200 bg-white sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
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

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Concept strategy card */}
        {concept && (
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Concepto Estratégico</h2>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {concept.angle_type && <Field label="Ángulo" value={concept.angle_type } />}
              {concept.organizing_principle && <Field label="Principio" value={concept.organizing_principle } />}
              {concept.target_persona && <Field label="Persona objetivo" value={concept.target_persona } />}
              {concept.product_service && <Field label="Producto/Servicio" value={concept.product_service } />}
              {concept.pain_point && <Field label="Pain Point" value={concept.pain_point } />}
              {concept.transformation && <Field label="Transformación" value={concept.transformation } />}
              {concept.why_it_works && <Field label="Por qué funciona" value={concept.why_it_works } />}
              {concept.funnel_stage && <Field label="Funnel" value={concept.funnel_stage } />}
            </div>
          </section>
        )}

        {/* Brief content */}
        {content.summary && (
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Resumen</h2>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{content.summary}</p>
          </section>
        )}

        {content.strategy_rationale && (
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-4 h-4 text-violet-600" />
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Racional Estratégico</h2>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{content.strategy_rationale}</p>
          </section>
        )}

        {content.key_messages?.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-3">
              <MessageCircle className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Mensajes Clave</h2>
            </div>
            <ul className="space-y-2">
              {content.key_messages.map((msg, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-1 w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">{i + 1}</span>
                  {msg}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {content.tone_direction && (
            <section className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-3">
                <MessageCircle className="w-4 h-4 text-amber-600" />
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Tono</h2>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{content.tone_direction}</p>
            </section>
          )}

          {content.visual_direction && (
            <section className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-3">
                <Palette className="w-4 h-4 text-pink-600" />
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Dirección Visual</h2>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{content.visual_direction}</p>
            </section>
          )}
        </div>

        {content.reference_insights && (
          <section className="bg-blue-50 rounded-xl border border-blue-200 p-6">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-blue-900 uppercase tracking-wider">Insights de Referencias</h2>
            </div>
            <p className="text-sm text-blue-800 leading-relaxed">{content.reference_insights}</p>
          </section>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {content.do_list?.length > 0 && (
            <section className="bg-white rounded-xl border border-emerald-200 p-6">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Hacer</h2>
              </div>
              <ul className="space-y-1.5">
                {content.do_list.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {content.dont_list?.length > 0 && (
            <section className="bg-white rounded-xl border border-red-200 p-6">
              <div className="flex items-center gap-2 mb-3">
                <XCircle className="w-4 h-4 text-red-600" />
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">No Hacer</h2>
              </div>
              <ul className="space-y-1.5">
                {content.dont_list.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {content.suggested_formats?.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Formatos Sugeridos</h2>
            <div className="flex flex-wrap gap-2">
              {content.suggested_formats.map((f, i) => (
                <span key={i} className="px-3 py-1 rounded-full bg-gray-100 text-sm text-gray-700 font-medium">{f}</span>
              ))}
            </div>
          </section>
        )}

        {/* Adapted script */}
        {script && script.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Guión Tropicalizado</h2>
            <div className="space-y-2">
              {script.map((line, i) => (
                <div key={i} className="grid grid-cols-2 gap-4 py-2 border-b border-gray-100 last:border-0">
                  <p className="text-sm text-gray-400 line-through">{line.original}</p>
                  <p className="text-sm text-gray-900 font-medium">{line.adapted}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-gray-200 bg-white mt-12">
        <div className="max-w-4xl mx-auto px-6 py-4 text-center">
          <p className="text-xs text-gray-400">Brief generado por Alpha Marino · Paint Media</p>
        </div>
      </footer>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-gray-900">{value}</p>
    </div>
  )
}
