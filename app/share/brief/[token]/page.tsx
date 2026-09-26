import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getBriefByToken } from "@/lib/actions/creatives"
import { can } from "@/lib/permissions"
import type { AdCloneLine } from "@/lib/types"
import { ANGLE_GUIDE } from "@/lib/constants/creatives"
import { BriefReferences } from "@/components/share/brief-references"
import { BriefNotes } from "@/components/share/brief-notes"
import { ClampText } from "@/components/share/clamp-text"

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

  let canEdit = false
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
      canEdit = profile?.role === "admin" || profile?.role === "subadmin"
    }
  } catch {}

  const concept = brief.concept as Record<string, string | number | null> | null
  const brain = brief.brand_brain as Record<string, string | string[] | null> | null
  const rawScript = brief.adapted_script as Record<string, AdCloneLine[]> | AdCloneLine[] | null
  const scriptMap = rawScript && !Array.isArray(rawScript) ? rawScript : null
  const legacyScript = rawScript && Array.isArray(rawScript) ? rawScript : null
  const scriptReviews = (brief.script_reviews ?? {}) as Record<string, { client_status?: string | null; client_feedback?: string | null }>
  const scriptTitles = brief.script_titles ?? {}
  const attachedAds = (brief as any).attached_ads as any[] | undefined

  const angleEntry = concept?.angle_type ? ANGLE_GUIDE.find((a) => a.name === concept.angle_type) : null

  const references: { id: string; type: "video" | "image" | "text"; name: string; videoSrc?: string; thumbSrc?: string; script?: AdCloneLine[]; clientStatus?: string | null; clientFeedback?: string | null }[] = []

  const videoAds = attachedAds?.filter((a) => a.format === "video" || a.cached_video_url || a.video_url) ?? []
  const imageAds = attachedAds?.filter((a) => a.format !== "video" && !a.cached_video_url && !a.video_url) ?? []

  videoAds.forEach((ad) => {
    const reviewKey = legacyScript ? "_single" : ad.id
    const review = scriptReviews[reviewKey]
    references.push({
      id: ad.id,
      type: "video",
      name: scriptTitles[ad.id] || ad.page_name || "Video",
      videoSrc: ad.cached_video_url || ad.video_url || undefined,
      thumbSrc: ad.cached_image_url || ad.image_url || undefined,
      script: scriptMap?.[ad.id] ?? legacyScript ?? undefined,
      clientStatus: review?.client_status ?? null,
      clientFeedback: review?.client_feedback ?? null,
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

  // Scripts written from scratch (Quick Create AI drafts, or a manual paste)
  // have no attached reference ad — surface them as their own entry so
  // editors can still see them here.
  if (scriptMap) {
    const coveredIds = new Set(references.map((r) => r.id))
    let genIndex = 0
    Object.entries(scriptMap).forEach(([key, lines]) => {
      if (coveredIds.has(key) || !lines?.length) return
      const review = scriptReviews[key]
      // Always advance genIndex for non-manual keys (even when a custom
      // title overrides the display name) so later untitled entries keep
      // consistent numbering instead of skipping ahead.
      const fallbackName = key === "manual" ? "Guión manual" : `Guión generado — opción ${++genIndex}`
      references.push({
        id: key,
        type: "text",
        name: scriptTitles[key] || fallbackName,
        script: lines,
        clientStatus: review?.client_status ?? null,
        clientFeedback: review?.client_feedback ?? null,
      })
    })
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      <header className="border-b border-gray-200 bg-white sticky top-0 z-20">
        <div className="max-w-[1500px] mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-0.5">
              Alpha Marino · Creative Brief
            </p>
            <h1 className="text-lg font-bold text-gray-900">
              {brief.title || concept?.name || concept?.angle_type || "Brief Creativo"}
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

      <main className="max-w-[1500px] mx-auto px-6 py-6 space-y-5">
        <BriefNotes
          briefId={brief.id}
          projectId={brief.project_id}
          initialNotes={brief.important_notes}
          editable={canEdit}
        />

        {/* Contexto: concepto + marca en una franja compacta y plegable —
            antes una columna lateral fija que le quitaba ancho a los guiones. */}
        {(concept || brain) && (
          <details open className="group bg-white rounded-2xl border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <summary className="list-none cursor-pointer px-5 py-3.5 flex items-center gap-2 flex-wrap [&::-webkit-details-marker]:hidden">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 mr-1">Contexto</span>
              {angleEntry && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-gray-900 text-white px-2.5 py-1 rounded-lg">
                  <span>{angleEntry.emoji}</span>{concept?.angle_type}
                </span>
              )}
              {concept?.funnel_stage && (
                <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-violet-100 text-violet-700">{FUNNEL_LABELS[concept.funnel_stage as string] ?? concept.funnel_stage}</span>
              )}
              {concept?.organizing_principle && <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-700">{concept.organizing_principle}</span>}
              {concept?.awareness_stage && (
                <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600">Stage {concept.awareness_stage} · {AWARENESS_LABELS[concept.awareness_stage as string] ?? ""}</span>
              )}
              <span className="ml-auto text-xs text-gray-400 group-open:hidden">Mostrar</span>
              <span className="ml-auto text-xs text-gray-400 hidden group-open:inline">Ocultar</span>
            </summary>
            <div className="border-t border-gray-100 p-4 grid gap-3 lg:grid-cols-[1fr_320px]">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 items-start">
                {concept?.target_persona && <AngleField label="Persona objetivo" value={concept.target_persona as string} accent="sky" icon="👤" />}
                {concept?.pain_point && <AngleField label="Pain Point" value={concept.pain_point as string} accent="rose" icon="⚡" />}
                {concept?.transformation && <AngleField label="Transformación" value={concept.transformation as string} accent="emerald" icon="✦" />}
                {concept?.why_it_works && <AngleField label="Por qué funciona" value={concept.why_it_works as string} accent="amber" icon="💡" />}
                {concept?.product_service && <AngleField label="Producto / Servicio" value={concept.product_service as string} accent="slate" icon="🛍" />}
              </div>
              {brain && (
                <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                  <div className="flex items-center gap-2.5">
                    {brain.logo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={brain.logo_url as string} alt="" className="w-8 h-8 rounded-lg object-contain bg-gray-50 border border-gray-100" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">Sobre la marca</p>
                      <p className="text-sm font-semibold text-gray-900 truncate">{brain.name}</p>
                    </div>
                  </div>
                  {brain.description && <ClampText text={brain.description as string} lines={3} className="text-[13px] text-gray-700 leading-relaxed" />}
                  {brain.tone_of_voice && (
                    <div className="rounded-lg bg-indigo-50/70 border border-indigo-100 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-600 mb-0.5">🎙 Tono de voz</p>
                      <p className="text-[13px] text-gray-700 leading-relaxed">{brain.tone_of_voice as string}</p>
                    </div>
                  )}
                  {Array.isArray(brain.usps) && brain.usps.length > 0 && (
                    <details>
                      <summary className="cursor-pointer text-[11px] font-semibold text-gray-500">Puntos únicos de venta ({(brain.usps as string[]).length})</summary>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(brain.usps as string[]).map((u, i) => (
                          <span key={i} className="text-[11px] font-medium px-2 py-1 rounded-md bg-teal-50 text-teal-700 border border-teal-100">{u}</span>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          </details>
        )}

        {references.length > 0 ? (
          <BriefReferences references={references} briefId={canEdit ? brief.id : undefined} projectId={canEdit ? brief.project_id : undefined} editable={canEdit} />
        ) : (
          <div className="text-center py-16"><p className="text-sm text-gray-400">Brief sin referencias multimedia.</p></div>
        )}
      </main>

      <footer className="border-t border-gray-200 bg-white mt-8">
        <div className="max-w-[1400px] mx-auto px-6 py-4 text-center">
          <p className="text-xs text-gray-400">Brief generado por Alpha Marino · Paint Media</p>
        </div>
      </footer>
    </div>
  )
}

type Accent = "sky" | "rose" | "emerald" | "amber" | "slate"

const ACCENT_STYLE: Record<Accent, { bg: string; border: string; label: string }> = {
  sky:     { bg: "bg-sky-50/70",     border: "border-sky-200",     label: "text-sky-700" },
  rose:    { bg: "bg-rose-50/70",    border: "border-rose-200",    label: "text-rose-700" },
  emerald: { bg: "bg-emerald-50/70", border: "border-emerald-200", label: "text-emerald-700" },
  amber:   { bg: "bg-amber-50/70",   border: "border-amber-200",   label: "text-amber-700" },
  slate:   { bg: "bg-slate-50",      border: "border-slate-200",   label: "text-slate-600" },
}

// Independently-bordered cards in a flex-wrap (not a shared-height grid) — a
// short field like "Transformación" no longer stretches to match a long
// neighbor like "Por qué funciona" in the same row, which used to leave a
// slab of dead white space under the shorter one.
function AngleField({ label, value, accent, icon }: { label: string; value: string; accent: Accent; icon: string }) {
  const s = ACCENT_STYLE[accent]
  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} px-4 py-3.5`}>
      <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${s.label} mb-1.5 flex items-center gap-1.5`}>
        <span className="text-xs leading-none">{icon}</span>
        {label}
      </p>
      <ClampText text={value} lines={3} className="text-[13px] leading-relaxed text-gray-700" />
    </div>
  )
}
