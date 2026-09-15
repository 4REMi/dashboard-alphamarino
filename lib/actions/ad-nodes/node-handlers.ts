import type { AdNodeConfig, AdNodeRunOutput } from "@/lib/types"
import { callApimartChat } from "./providers/apimart"

// Synchronous node handlers — Text, LLM, and Image/Video Analysis all
// resolve in one await, same as generateCreativeConcepts's single-call
// pattern (lib/actions/creatives.ts). Generate Image/Video are async
// (submit + poll a provider job) and live in executor.ts instead, since
// they need to persist a provider_job_id between polls.

// Concatenates whatever TEXT upstream nodes produced. Deliberately does
// NOT try to represent image outputs as text (e.g. "[imagen: url]") — that
// used to be the actual bug: the model only ever saw a URL string, never
// the image itself, so it had nothing real to look at and hallucinated.
// Images are attached as real vision content instead — see
// upstreamImageUrls + downloadImageAsBase64.
function summarizeUpstream(upstream: AdNodeRunOutput[]): string {
  return upstream
    .map((o) => o.text ?? o.analysis ?? "")
    .filter(Boolean)
    .join("\n\n")
}

function upstreamImageUrls(upstream: AdNodeRunOutput[]): string[] {
  return upstream.flatMap((o) => o.image_urls ?? [])
}

// Anthropic's vision API needs the image bytes (base64), not a bare URL —
// download and encode. Capped at 5 images per call so a workflow with many
// reference images doesn't build an enormous request. Throws instead of
// silently returning null on failure: a swallowed download error used to
// mean the node ran text-only with no image and no indication why —
// exactly the kind of silent failure that looked like "Claude hallucinates
// and doesn't see the image" when the real problem was a failed fetch.
async function downloadImageAsBase64(url: string): Promise<{ type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string } }> {
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  } catch (err) {
    throw new Error(`No se pudo descargar la imagen (${url}): ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!res.ok) throw new Error(`No se pudo descargar la imagen (${url}): HTTP ${res.status}`)
  const buffer = await res.arrayBuffer()
  const base64 = Buffer.from(buffer).toString("base64")
  // Content-Type can carry extra params (e.g. "image/png; charset=binary")
  // that Anthropic's media_type field rejects outright — keep only the
  // "image/xxx" portion.
  const rawType = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim()
  const mediaType = (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(rawType) ? rawType : "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif"
  return { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }
}

export async function runTextNode(config: AdNodeConfig): Promise<AdNodeRunOutput> {
  return { text: config.value ?? "" }
}

// Model choice decides the provider — Claude runs through this account's
// own direct Anthropic integration (no APIMart markup), GPT-5 has no such
// direct integration so it goes through APIMart's chat completions.
// Reference images from upstream Image nodes are attached as real vision
// content either way, not just mentioned as a URL in the text prompt.
export async function runLLMNode(config: AdNodeConfig, upstream: AdNodeRunOutput[]): Promise<AdNodeRunOutput> {
  const context = summarizeUpstream(upstream)
  const userPrompt = [context, config.prompt ?? ""].filter(Boolean).join("\n\n")
  const imageUrls = upstreamImageUrls(upstream).slice(0, 5)
  if (!userPrompt.trim() && imageUrls.length === 0) throw new Error("Este nodo LLM no tiene ningún input ni prompt propio")

  const model = config.model || "claude-sonnet-4-6"

  if (model.startsWith("apimart:")) {
    // OpenAI-style vision content takes a plain URL — no download needed.
    const text = await callApimartChat(model.replace("apimart:", ""), userPrompt, config.systemPrompt, imageUrls)
    return { text }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurado")

  const imageBlocks = await Promise.all(imageUrls.map(downloadImageAsBase64))
  // Anthropic rejects a text block with an empty string outright ("text
  // content blocks must be non-empty") — happens whenever a node has
  // upstream images but no text (own prompt or upstream text), e.g. fed
  // only by an Image node. Fall back to a minimal instruction instead of
  // sending "".
  const content = imageBlocks.length > 0
    ? [...imageBlocks, { type: "text" as const, text: userPrompt.trim() || "Describe esta imagen con el mayor detalle posible." }]
    : userPrompt

  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model,
    max_tokens: 2048,
    messages: [{ role: "user", content }],
    ...(config.systemPrompt ? { system: config.systemPrompt } : {}),
  })
  const text = message.content[0].type === "text" ? message.content[0].text : ""
  return { text }
}

export async function runAnalysisNode(config: AdNodeConfig, upstream: AdNodeRunOutput[]): Promise<AdNodeRunOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurado")

  const imageUrls = upstreamImageUrls(upstream)
  if (imageUrls.length === 0) throw new Error("Este nodo de análisis necesita una imagen de un nodo Image conectado")

  const imageBlock = await downloadImageAsBase64(imageUrls[0])

  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: [
        imageBlock,
        { type: "text", text: config.prompt || "Describe esta imagen con el mayor detalle posible." },
      ],
    }],
  })
  const analysis = message.content[0].type === "text" ? message.content[0].text : ""
  return { analysis }
}

export { summarizeUpstream, upstreamImageUrls }
