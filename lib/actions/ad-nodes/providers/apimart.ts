import type { GenerationAdapter, GenerationPollResult } from "./types"

// APIMart (https://api.apimart.ai) — a unified async-task API over many
// image/video models (Seedance, Sora2, Veo3, GPT-Image, etc.). Submit gets a
// task id, poll that id for the result.
//
// Two DIFFERENT response shapes have turned up for this account, and neither
// is trusted as "the" format — parsing below normalizes both:
//   A) Real logs from the user's own playground (flat):
//      { task_id, links: [url, ...], request_body: {...} }
//   B) docs.apimart.ai's documented "unified task" shape (wrapped):
//      { code: 200, data: { id, status, progress, result: { images: [{ url: [url,...] }] } } }
// (B)'s `result.images[].url` is itself documented as an array, not a
// string — handled below. If a THIRD shape shows up in practice, add it to
// `unwrap`/`extractUrls` rather than assuming either of these two is
// authoritative.
const APIMART_BASE = "https://api.apimart.ai/v1"

function apimartHeaders() {
  const token = process.env.APIMART_API_KEY
  if (!token) throw new Error("APIMART_API_KEY no configurado")
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

interface ApimartTaskResponse {
  task_id?: string
  id?: string
  status?: string
  links?: string[]
  result?: { images?: { url: string | string[] }[]; videos?: { url: string | string[] }[] }
  error?: string | { code?: string; message?: string; type?: string }
  error_message?: string
  message?: string
  data?: ApimartTaskResponse // shape (B) wraps everything one level deeper
}

// Shape (B) nests the real payload under `data` — unwrap it once if present
// so the rest of the parsing can treat both shapes identically.
function unwrap(data: ApimartTaskResponse): ApimartTaskResponse {
  return data.data ?? data
}

function urlsOf(field: { url: string | string[] }[] | undefined): string[] {
  return (field ?? []).flatMap((item) => Array.isArray(item.url) ? item.url : [item.url])
}

// APIMart's error field can be a plain string OR a nested object ({code,
// message, type} per their docs) — passing an object straight to
// `new Error()` silently stringifies it to the useless "[object Object]"
// instead of throwing/surfacing the real message. Always resolve to a
// readable string first.
function errorMessageOf(value: unknown): string | null {
  if (!value) return null
  if (typeof value === "string") return value
  if (typeof value === "object" && "message" in value && typeof (value as { message?: unknown }).message === "string") {
    return (value as { message: string }).message
  }
  try { return JSON.stringify(value) } catch { return String(value) }
}

function extractUrls(data: ApimartTaskResponse): string[] {
  if (data.links?.length) return data.links
  const fromImages = urlsOf(data.result?.images)
  if (fromImages.length > 0) return fromImages
  const fromVideos = urlsOf(data.result?.videos)
  if (fromVideos.length > 0) return fromVideos
  return []
}

export function apimartAdapter(kind: "image" | "video", model: string): GenerationAdapter {
  const submitPath = kind === "image" ? "images/generations" : "videos/generations"

  return {
    async submit(input) {
      const res = await fetch(`${APIMART_BASE}/${submitPath}`, {
        method: "POST",
        headers: apimartHeaders(),
        body: JSON.stringify({ model, ...input }),
        cache: "no-store",
      })
      if (!res.ok) {
        const err = unwrap(await res.json().catch(() => ({})) as ApimartTaskResponse)
        throw new Error(errorMessageOf(err.error) ?? errorMessageOf(err.message) ?? `APIMart error ${res.status}`)
      }
      const raw = unwrap(await res.json() as ApimartTaskResponse)
      const jobId = raw.task_id ?? raw.id
      if (!jobId) throw new Error("APIMart no regresó un task_id/id")
      return { jobId }
    },

    async poll(jobId): Promise<GenerationPollResult> {
      const res = await fetch(`${APIMART_BASE}/tasks/${jobId}?language=es`, {
        headers: apimartHeaders(),
        cache: "no-store",
      })
      if (!res.ok) return { state: "running" } // transient poll error — try again next tick
      const data = unwrap(await res.json() as ApimartTaskResponse)

      if (data.status === "failed" || data.status === "cancelled") {
        return { state: "failed", error: errorMessageOf(data.error) ?? data.error_message ?? `APIMart: ${data.status}` }
      }

      const urls = extractUrls(data)
      if (urls.length > 0) return { state: "succeeded", urls }

      return { state: "running" }
    },
  }
}
