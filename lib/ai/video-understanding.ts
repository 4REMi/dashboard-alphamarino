// "Ver" un video con Gemini 2.5 Flash: escenas con tiempos, lo que se ve,
// lo que se oye (voz, música, efectos), texto en pantalla, formato y tono.
// Solo servidor. Proveedores en orden: APIMart (formato OpenAI, el soporte
// de video no está documentado — se valida la respuesta) → Google directo
// (GEMINI_API_KEY, formato nativo con el video embebido) → null (el
// llamador sigue solo con la transcripción).

export interface VideoScene { t: string; visual: string; audio: string; texto_en_pantalla?: string | null }
export interface VideoDescription {
  resumen: string
  formato: string            // UGC, testimonio, talking head, b-roll, demo…
  personas: string
  escenario: string
  musica: string
  tono: string
  efectos_y_transiciones: string
  gancho: string             // primeros ~3 s
  escenas: VideoScene[]
}

const PROMPT = `Analiza este video publicitario COMPLETO (imagen y audio). Responde SOLO JSON en español:
{"resumen":"","formato":"UGC|testimonio|talking head|b-roll|demo|animación|otro","personas":"quién sale","escenario":"dónde","musica":"tipo/ánimo o 'sin música'","tono":"cómo se dice (energía, emoción)","efectos_y_transiciones":"cortes, zooms, textos animados, etc.","gancho":"qué pasa y qué se dice en los primeros 3 segundos","escenas":[{"t":"0:00-0:03","visual":"","audio":"voz/música/efecto","texto_en_pantalla":null}]}
Si no puedes ver el video, responde exactamente {"error":"sin_video"}.`

function parse(raw: string | null | undefined): VideoDescription | null {
  if (!raw) return null
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const j = JSON.parse(m[0])
    if (j.error || !Array.isArray(j.escenas) || !j.escenas.length || !j.resumen) return null
    return j as VideoDescription
  } catch { return null }
}

async function viaApimart(url: string): Promise<VideoDescription | null> {
  const key = process.env.APIMART_API_KEY
  if (!key) return null
  // Dos formas de mandar el video que aceptan los proxies de Gemini.
  for (const part of [{ type: "video_url", video_url: { url } }, { type: "image_url", image_url: { url } }]) {
    try {
      const res = await fetch("https://api.apimart.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gemini-2.5-flash", messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, part] }], max_tokens: 4096 }),
      })
      const j = await res.json().catch(() => null)
      const out = parse(j?.choices?.[0]?.message?.content)
      if (out) return out
      console.error("[video-understanding] APIMart sin video válido:", res.status, JSON.stringify(j)?.slice(0, 300))
    } catch (e) { console.error("[video-understanding] APIMart:", e) }
  }
  return null
}

async function viaGoogle(url: string): Promise<VideoDescription | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  try {
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
    if (buf.length > 19_000_000) { console.error("[video-understanding] video >19 MB para envío directo"); return null }
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: "video/mp4", data: buf.toString("base64") } }, { text: PROMPT }] }], generationConfig: { responseMimeType: "application/json" } }),
    })
    const j = await res.json().catch(() => null)
    return parse(j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join(""))
  } catch (e) { console.error("[video-understanding] Google:", e); return null }
}

export async function describeVideo(url: string): Promise<{ description: VideoDescription | null; provider: "apimart" | "google" | null }> {
  const a = await viaApimart(url)
  if (a) return { description: a, provider: "apimart" }
  const g = await viaGoogle(url)
  if (g) return { description: g, provider: "google" }
  return { description: null, provider: null }
}
