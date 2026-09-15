import type { AdNodeConfig, AdNodeRunOutput } from "@/lib/types"

// Synchronous node handlers — Text, LLM, and Image/Video Analysis all
// resolve in one await, same as generateCreativeConcepts's single-call
// pattern (lib/actions/creatives.ts). Generate Image/Video are async
// (submit + poll a provider job) and live in executor.ts instead, since
// they need to persist a provider_job_id between polls.

// Concatenates whatever upstream nodes produced (text, analysis text, or
// image urls) into a single context block a text-only node can read.
function summarizeUpstream(upstream: AdNodeRunOutput[]): string {
  return upstream
    .map((o) => o.text ?? o.analysis ?? (o.image_urls?.length ? `[imagen: ${o.image_urls[0]}]` : ""))
    .filter(Boolean)
    .join("\n\n")
}

function upstreamImageUrls(upstream: AdNodeRunOutput[]): string[] {
  return upstream.flatMap((o) => o.image_urls ?? [])
}

export async function runTextNode(config: AdNodeConfig): Promise<AdNodeRunOutput> {
  return { text: config.value ?? "" }
}

export async function runLLMNode(config: AdNodeConfig, upstream: AdNodeRunOutput[]): Promise<AdNodeRunOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurado")

  const context = summarizeUpstream(upstream)
  const userPrompt = [context, config.prompt ?? ""].filter(Boolean).join("\n\n")
  if (!userPrompt.trim()) throw new Error("Este nodo LLM no tiene ningún input ni prompt propio")

  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: userPrompt }],
    ...(config.systemPrompt ? { system: config.systemPrompt } : {}),
  })
  const text = message.content[0].type === "text" ? message.content[0].text : ""
  return { text }
}

export async function runAnalysisNode(config: AdNodeConfig, upstream: AdNodeRunOutput[]): Promise<AdNodeRunOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurado")

  const imageUrls = upstreamImageUrls(upstream)
  const imageUrl = imageUrls[0]
  if (!imageUrl) throw new Error("Este nodo de análisis necesita una imagen de un nodo Image conectado")

  const imageRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) })
  if (!imageRes.ok) throw new Error("No se pudo descargar la imagen a analizar")
  const buffer = await imageRes.arrayBuffer()
  const base64 = Buffer.from(buffer).toString("base64")
  const mediaType = (imageRes.headers.get("content-type") ?? "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif"

  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: config.prompt || "Describe esta imagen con el mayor detalle posible." },
      ],
    }],
  })
  const analysis = message.content[0].type === "text" ? message.content[0].text : ""
  return { analysis }
}

export { summarizeUpstream, upstreamImageUrls }
