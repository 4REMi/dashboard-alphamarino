import type { GenerationAdapter, GenerationPollResult } from "./types"

// APIMart (https://api.apimart.ai) — a unified async-task API over many
// image/video models (Seedance, Sora2, Veo3, GPT-Image, etc.). One envelope
// per operation type (submit → task_id, poll by task_id), model-specific
// params passed through inside the same request body — confirmed against
// real logs from the user's account, not guessed.
//
// Contract confirmed from real playground logs + docs (docs.apimart.ai):
//   POST /v1/videos/generations | POST /v1/images/generations
//     body: { model, prompt, image_urls?, ...model-specific params }
//     response: { task_id }
//   GET /v1/tasks/{task_id}
//     response, once done: { task_id, links: [url, ...], request_body: {...} }
//     (the docs separately describe a { status, progress, result: { images } }
//     shape — the two accounts disagree, so parsing below accepts either:
//     `links`/`result.*` presence means done, an explicit failed/cancelled
//     status means failed, anything else means still running.)
const APIMART_BASE = "https://api.apimart.ai/v1"

function apimartHeaders() {
  const token = process.env.APIMART_API_KEY
  if (!token) throw new Error("APIMART_API_KEY no configurado")
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

interface ApimartTaskResponse {
  task_id?: string
  status?: string
  links?: string[]
  result?: { images?: { url: string }[]; videos?: { url: string }[] }
  error?: string
  error_message?: string
}

function extractUrls(data: ApimartTaskResponse): string[] {
  if (data.links?.length) return data.links
  if (data.result?.images?.length) return data.result.images.map((i) => i.url)
  if (data.result?.videos?.length) return data.result.videos.map((v) => v.url)
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
        const err = await res.json().catch(() => ({})) as { error?: string; message?: string }
        throw new Error(err.error ?? err.message ?? `APIMart error ${res.status}`)
      }
      const data = await res.json() as ApimartTaskResponse
      if (!data.task_id) throw new Error("APIMart no regresó un task_id")
      return { jobId: data.task_id }
    },

    async poll(jobId): Promise<GenerationPollResult> {
      const res = await fetch(`${APIMART_BASE}/tasks/${jobId}?language=es`, {
        headers: apimartHeaders(),
        cache: "no-store",
      })
      if (!res.ok) return { state: "running" } // transient poll error — try again next tick
      const data = await res.json() as ApimartTaskResponse

      if (data.status === "failed" || data.status === "cancelled") {
        return { state: "failed", error: data.error ?? data.error_message ?? `APIMart: ${data.status}` }
      }

      const urls = extractUrls(data)
      if (urls.length > 0) return { state: "succeeded", urls }

      return { state: "running" }
    },
  }
}
