import type { GenerationAdapter, GenerationPollResult } from "./types"

// Generic Replicate adapter, parameterized by model slug — unlike
// lib/actions/image-clone.ts's replicateSubmit/replicatePoll (hard-coded to
// google/nano-banana-pro), a node here can pick any Replicate model. The
// retry/backoff logic is duplicated rather than imported: image-clone.ts's
// version isn't exported, and per this repo's own precedent (ad-scratch.ts),
// duplicating a small, stable routine is safer than coupling two features
// through a shared internal helper.
const REPLICATE_BASE = "https://api.replicate.com/v1"

function replicateHeaders() {
  const token = process.env.REPLICATE_KEY
  if (!token) throw new Error("REPLICATE_KEY no configurado")
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function submitWithRetry(model: string, input: Record<string, unknown>): Promise<string> {
  let delay = 12_000
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(`${REPLICATE_BASE}/models/${model}/predictions`, {
        method: "POST",
        headers: replicateHeaders(),
        body: JSON.stringify({ input }),
        cache: "no-store",
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { detail?: string }).detail ?? `Replicate error ${res.status}`)
      }
      const data = await res.json() as { id: string }
      return data.id
    } catch (err) {
      const msg = String(err).toLowerCase()
      const isThrottled = msg.includes("throttled") || msg.includes("rate limit") || msg.includes("429")
      if (!isThrottled || attempt === 4) throw err
      await sleep(delay)
      delay = Math.min(Math.floor(delay * 1.5), 60_000)
    }
  }
  throw new Error("Max retries exceeded")
}

export function replicateAdapter(modelSlug: string): GenerationAdapter {
  return {
    async submit(input) {
      const jobId = await submitWithRetry(modelSlug, input)
      return { jobId }
    },
    async poll(jobId): Promise<GenerationPollResult> {
      const res = await fetch(`${REPLICATE_BASE}/predictions/${jobId}`, {
        headers: replicateHeaders(),
        cache: "no-store",
      })
      if (!res.ok) return { state: "running" } // transient poll error — try again next tick
      const data = await res.json() as { status: string; output?: string | string[] | null; error?: string | null }
      if (data.status === "succeeded") {
        const raw = data.output
        const urls = Array.isArray(raw) ? raw : raw ? [String(raw)] : []
        return { state: "succeeded", urls }
      }
      if (data.status === "failed" || data.status === "canceled") {
        return { state: "failed", error: data.error ?? `Replicate: ${data.status}` }
      }
      return { state: "running" }
    },
  }
}
