"use server"

import { createAdminClient } from "@/lib/supabase/admin"

const REPLICATE_BASE  = "https://api.replicate.com/v1"
const REPLICATE_MODEL = "black-forest-labs/flux-fill-pro"

function replicateHeaders() {
  const token = process.env.REPLICATE_KEY
  if (!token) throw new Error("REPLICATE_KEY no configurado")
  return {
    Authorization:  `Bearer ${token}`,
    "Content-Type": "application/json",
  }
}

/** Submit one outpaint prediction. Returns the Replicate prediction ID. */
export async function submitResizePrediction(paddedImageUrl: string, maskUrl: string): Promise<string> {
  const res = await fetch(`${REPLICATE_BASE}/models/${REPLICATE_MODEL}/predictions`, {
    method:  "POST",
    headers: replicateHeaders(),
    body: JSON.stringify({
      input: {
        prompt:       "Seamlessly extend the background and surroundings only. Continue existing textures, colors, patterns, and lighting conditions. Do not add any new objects, people, animals, text, logos, or graphic elements. Keep the extension minimal, clean, and indistinguishable from the original.",
        image:        paddedImageUrl,
        mask:         maskUrl,
        guidance:     25,
        output_format:     "jpg",
        steps:             50,
        safety_tolerance:  2,
        prompt_upsampling: false,
      },
    }),
    cache: "no-store",
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail ?? `Replicate error ${res.status}`)
  }
  const data = await res.json() as { id: string }
  return data.id
}

/** Poll one prediction. Returns status + output URL when done. */
export async function pollResizePrediction(predictionId: string): Promise<{
  status: string
  url?: string
  error?: string
}> {
  const token = process.env.REPLICATE_KEY
  if (!token) throw new Error("REPLICATE_KEY no configurado")

  const res = await fetch(`${REPLICATE_BASE}/predictions/${predictionId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache:   "no-store",
  })
  if (!res.ok) return { status: "failed" }

  const data = await res.json() as {
    status: string
    output?: string | string[] | null
    error?: string | null
  }
  const raw = data.output
  const url = Array.isArray(raw) ? raw[0] : raw ? String(raw) : undefined

  return { status: data.status, url, error: data.error ?? undefined }
}

/** Mirror a Replicate output URL to Supabase Storage (they expire). Returns stable public URL. */
export async function mirrorResizeResult(replicateUrl: string, sessionId: string, ratio: string): Promise<string> {
  const admin = createAdminClient()
  try {
    const fetched = await fetch(replicateUrl, { signal: AbortSignal.timeout(30_000) })
    if (!fetched.ok) return replicateUrl

    const buffer      = await fetched.arrayBuffer()
    const contentType = fetched.headers.get("content-type") ?? "image/jpeg"
    const ext         = contentType.split("/")[1]?.split(";")[0] ?? "jpg"
    const safeRatio   = ratio.replace(":", "x")
    const path        = `resizes/${sessionId}/${safeRatio}.${ext}`

    const { error } = await admin.storage.from("ad-lab").upload(path, buffer, { contentType, upsert: true })
    if (error) return replicateUrl

    return admin.storage.from("ad-lab").getPublicUrl(path).data.publicUrl
  } catch {
    return replicateUrl
  }
}
