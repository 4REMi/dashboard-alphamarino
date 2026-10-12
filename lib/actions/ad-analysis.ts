"use server"

import { createClient } from "@/lib/supabase/server"
import { aaiPost, aaiGet } from "@/lib/actions/ad-clone"
import { describeVideo, type VideoDescription } from "@/lib/ai/video-understanding"
import { parseAiJson } from "@/lib/utils/ai-json"

// Análisis de concepto de un anuncio de la librería (Ad Lab). Sin Brand
// Brain: el contexto de la marca se INFIERE de lo que hay — nombre de la
// página, copy, título, CTA, el texto de su landing y lo que se ve/oye en el
// creativo (Gemini) — y la IA dice qué tan segura está de esa inferencia.

const ANGULOS = ["Desired Outcome", "Objection", "Feature / Benefit", "Use Case", "Consequence", "Misconception", "Education", "Acceptance", "Failed Solutions", "Identity"]

export interface LibraryAdInput {
  pageName: string
  body: string | null
  title: string | null
  caption: string | null
  cta: string | null
  linkUrl: string | null
  videoUrl: string | null
  imageUrl: string | null
  isActive: boolean
  startDate: number | null
}

export interface LibraryAdAnalysis {
  marca: { que_vende: string; audiencia: string; oferta: string; posicionamiento: string; confianza: "alta" | "media" | "baja"; basado_en: string }
  concepto: { nombre: string; angle_type: string; organizing_principle: string; target_persona: string; pain_point: string; objection: string; why_it_works: string; transformation: string; funnel_stage: string; awareness_stage: number }
  gancho: { texto: string; tipo: string; por_que_atrapa: string }
  estructura: { t: string; momento: string; que_pasa: string }[]
  mecanica: string
  formato: string
  por_que_funciona: string[]
  debilidades: string[]
  como_adaptarlo: string[]
  transcript: string | null
  media: VideoDescription | null
  landingLeida: boolean
  diasCorriendo: number | null
}

async function transcribe(url: string): Promise<string | null> {
  try {
    const t = await aaiPost("/transcript", { audio_url: url, language_detection: true })
    let r: { status: string; text?: string } = { status: "queued" }
    for (let i = 0; i < 40 && r.status !== "completed" && r.status !== "error"; i++) {
      await new Promise((x) => setTimeout(x, 3000))
      r = await aaiGet(`/transcript/${t.id}`)
    }
    return r.status === "completed" ? (r.text?.trim() || null) : null
  } catch { return null }
}

// Texto visible de la landing (para entender qué vende la marca).
async function landingText(url: string | null): Promise<string | null> {
  if (!url || !/^https?:/.test(url)) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0" } })
    if (!res.ok) return null
    const html = (await res.text()).slice(0, 400_000)
    const title = html.match(/<title[^>]*>([^<]*)/i)?.[1] ?? ""
    const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] ?? ""
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#\d+;|&\w+;/g, " ").replace(/\s+/g, " ").trim()
    return `${title}\n${desc}\n${text}`.slice(0, 3500)
  } catch { return null }
}

export async function analyzeLibraryAd(ad: LibraryAdInput): Promise<LibraryAdAnalysis> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  const mediaUrl = ad.videoUrl ?? ad.imageUrl
  if (!mediaUrl) throw new Error("Este anuncio no tiene video ni imagen para analizar")

  const [transcript, { description: media }, landing] = await Promise.all([
    ad.videoUrl ? transcribe(ad.videoUrl) : Promise.resolve(null),
    describeVideo(mediaUrl, ad.videoUrl ? "video" : "image"),
    landingText(ad.linkUrl),
  ])
  const dias = ad.startDate ? Math.max(1, Math.round((Date.now() / 1000 - ad.startDate) / 86400)) : null

  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: `Eres estratega creativo senior de paid media. Desarmas un anuncio de la competencia para entender su CONCEPTO y por qué funciona. No tienes ficha de la marca: infiere su contexto SOLO de la evidencia (nombre de la página, copy, landing, lo que se ve y se oye) y di qué tan segura es la inferencia y en qué te basas. No inventes datos que no estén en la evidencia; si algo no se puede saber, dilo.
Un anuncio que lleva muchos días activo es señal de que le funciona a la marca.
angle_type debe ser EXACTAMENTE uno de: ${ANGULOS.join(", ")}. funnel_stage: TOF, MOF o BOF. organizing_principle: Pain-First o Desire-First. awareness_stage: 1-5.
Responde SOLO JSON en español:
{"marca":{"que_vende":"","audiencia":"","oferta":"","posicionamiento":"","confianza":"alta|media|baja","basado_en":""},
"concepto":{"nombre":"","angle_type":"","organizing_principle":"","target_persona":"","pain_point":"","objection":"","why_it_works":"","transformation":"","funnel_stage":"","awareness_stage":3},
"gancho":{"texto":"lo que se dice/ve en los primeros 3 s","tipo":"pregunta|afirmación polémica|dato|demostración|historia|otro","por_que_atrapa":""},
"estructura":[{"t":"0:00-0:03","momento":"gancho|problema|demostración|prueba social|oferta|CTA","que_pasa":""}],
"mecanica":"el mecanismo creativo central en una frase","formato":"",
"por_que_funciona":["3-5 razones concretas"],"debilidades":["2-3"],"como_adaptarlo":["3-5 ideas para usar este concepto en otra marca sin copiarlo"]}`,
    messages: [{
      role: "user",
      content: `PÁGINA: ${ad.pageName}
ESTADO: ${ad.isActive ? "activo" : "inactivo"}${dias ? ` · ${dias} días desde que empezó` : ""}
COPY: ${ad.body ?? "—"}
TÍTULO: ${ad.title ?? "—"} · CTA: ${ad.cta ?? "—"} · DESTINO: ${ad.linkUrl ?? "—"}
${ad.caption ? `CAPTION: ${ad.caption}\n` : ""}TIPO DE CREATIVO: ${ad.videoUrl ? "video" : "imagen"}
TRANSCRIPCIÓN: ${ad.videoUrl ? transcript ?? "(sin voz o no disponible)" : "(no aplica)"}
LO QUE SE VE Y SE OYE: ${media ? JSON.stringify(media) : "(no se pudo analizar el creativo)"}
TEXTO DE LA LANDING: ${landing ?? "(no disponible)"}`,
    }],
  })
  const parsed = parseAiJson<Omit<LibraryAdAnalysis, "transcript" | "media" | "landingLeida" | "diasCorriendo">>(msg, "analyzeLibraryAd")
  return { ...parsed, transcript, media, landingLeida: !!landing, diasCorriendo: dias }
}
