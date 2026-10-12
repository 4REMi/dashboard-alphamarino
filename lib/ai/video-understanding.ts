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

const IMAGE_PROMPT = `Analiza esta imagen publicitaria (anuncio estático). Responde SOLO JSON en español con esta forma exacta:
{"resumen":"","formato":"estático|carrusel|meme|testimonio|producto|infografía|otro","personas":"quién sale o 'nadie'","escenario":"dónde/fondo","musica":"no aplica","tono":"tono visual y del copy","efectos_y_transiciones":"composición, colores, jerarquía visual","gancho":"lo primero que atrapa la vista","escenas":[{"t":"imagen","visual":"descripción detallada","audio":"—","texto_en_pantalla":"todo el texto que aparece, literal"}]}
Si no puedes ver la imagen, responde exactamente {"error":"sin_imagen"}.`

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

// Modelos en orden: GEMINI_MODEL (si se define en Vercel), el Flash actual
// que recomienda Google, el alias del Flash vigente y un respaldo. (2.5 Flash
// ya no está disponible para cuentas nuevas.)
const MODELS = [process.env.GEMINI_MODEL, "gemini-3.8-flash", "gemini-flash-latest", "gemini-3-flash-preview"].filter((m, i, a): m is string => !!m && a.indexOf(m) === i)

async function viaGoogle(url: string, kind: "video" | "image"): Promise<{ d: VideoDescription | null; error: string | null }> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return { d: null, error: "Falta GEMINI_API_KEY en el servidor (¿se hizo redeploy después de agregarla?)" }
  try {
    const res0 = await fetch(url)
    if (!res0.ok) return { d: null, error: `No se pudo descargar el archivo (${res0.status})` }
    let mime = res0.headers.get("content-type")?.split(";")[0] || ""
    if (!/^(video|image)\//.test(mime)) mime = kind === "image" ? "image/jpeg" : "video/mp4"
    const buf = Buffer.from(await res0.arrayBuffer())
    const mediaPart = buf.length <= 18_000_000
      ? { inline_data: { mime_type: mime, data: buf.toString("base64") } }
      : { file_data: { mime_type: mime, file_uri: await uploadToGemini(key, buf, mime) } }
    let lastError = "sin respuesta"
    // Saturación (503/429/500) es temporal: se reintenta con espera y, si
    // sigue, se pasa al siguiente modelo. 404/400 (modelo no disponible) → siguiente.
    for (const model of MODELS) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(`${G}/v1beta/models/${model}:generateContent?key=${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [mediaPart, { text: kind === "image" ? IMAGE_PROMPT : PROMPT }] }], generationConfig: { responseMimeType: "application/json" } }),
        })
        const j = await res.json().catch(() => null)
        if (res.ok) {
          const raw = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("")
          const d = parse(raw)
          if (d) return { d, error: null }
          lastError = `Gemini (${model}) respondió sin un análisis válido${j?.candidates?.[0]?.finishReason ? ` (${j.candidates[0].finishReason})` : ""}: ${String(raw ?? "").slice(0, 160)}`
          console.error("[video-understanding]", lastError)
          break
        }
        lastError = `Gemini (${model}) ${res.status}: ${j?.error?.message ?? "error"}`
        console.error("[video-understanding]", lastError)
        if (![429, 500, 503].includes(res.status)) break
        if (attempt < 2) await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)))
      }
    }
    return { d: null, error: lastError }
  } catch (e) {
    return { d: null, error: e instanceof Error ? e.message : String(e) }
  }
}

// Solo la API oficial de Gemini (APIMart no pasa el video al modelo).
export async function describeVideo(url: string, kind: "video" | "image" = "video"): Promise<{ description: VideoDescription | null; provider: "google" | null; error: string | null }> {
  const { d, error } = await viaGoogle(url, kind)
  return { description: d, provider: d ? "google" : null, error }
}
