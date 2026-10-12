// "Ver" un video con Gemini 2.5 Flash: escenas con tiempos, lo que se ve,
// lo que se oye (voz, música, efectos), texto en pantalla, formato y tono.
// Solo servidor. API oficial de Gemini (GEMINI_API_KEY): el video va
// embebido si pesa ≤18 MB o por Files API si es más grande. Si falla,
// regresa null y el llamador sigue solo con la transcripción. (APIMart se
// probó y no pasa el video al modelo.)

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

const G = "https://generativelanguage.googleapis.com"

// Videos grandes: Files API (subida resumible) y esperar a que quede ACTIVE.
async function uploadToGemini(key: string, buf: Buffer, mime: string): Promise<string> {
  const start = await fetch(`${G}/upload/v1beta/files?key=${key}`, {
    method: "POST",
    headers: { "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start", "X-Goog-Upload-Header-Content-Length": String(buf.length), "X-Goog-Upload-Header-Content-Type": mime, "Content-Type": "application/json" },
    body: JSON.stringify({ file: { display_name: "creative" } }),
  })
  const uploadUrl = start.headers.get("x-goog-upload-url")
  if (!uploadUrl) throw new Error(`Files API start ${start.status}`)
  const up = await fetch(uploadUrl, { method: "POST", headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize", "Content-Length": String(buf.length) }, body: new Uint8Array(buf) })
  const j = await up.json()
  const name = j.file?.name as string | undefined
  if (!name) throw new Error(`Files API upload ${up.status}`)
  for (let i = 0; i < 40; i++) {
    const f = await (await fetch(`${G}/v1beta/${name}?key=${key}`)).json()
    if (f.state === "ACTIVE") return f.uri as string
    if (f.state === "FAILED") throw new Error("Gemini no pudo procesar el video")
    await new Promise((r) => setTimeout(r, 3000))
  }
  throw new Error("Gemini tardó demasiado en procesar el video")
}

async function viaGoogle(url: string): Promise<VideoDescription | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) { console.error("[video-understanding] falta GEMINI_API_KEY"); return null }
  try {
    const res0 = await fetch(url)
    const mime = res0.headers.get("content-type")?.split(";")[0] || "video/mp4"
    const buf = Buffer.from(await res0.arrayBuffer())
    const videoPart = buf.length <= 18_000_000
      ? { inline_data: { mime_type: mime, data: buf.toString("base64") } }
      : { file_data: { mime_type: mime, file_uri: await uploadToGemini(key, buf, mime) } }
    const res = await fetch(`${G}/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [videoPart, { text: PROMPT }] }], generationConfig: { responseMimeType: "application/json" } }),
    })
    const j = await res.json().catch(() => null)
    if (!res.ok) console.error("[video-understanding] Gemini:", res.status, JSON.stringify(j)?.slice(0, 300))
    return parse(j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join(""))
  } catch (e) { console.error("[video-understanding] Gemini:", e); return null }
}

// Solo la API oficial de Gemini (APIMart no pasa el video al modelo).
export async function describeVideo(url: string): Promise<{ description: VideoDescription | null; provider: "google" | null }> {
  const g = await viaGoogle(url)
  return { description: g, provider: g ? "google" : null }
}
