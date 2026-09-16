"use server"

// APIMart's official pricing endpoint — public, no API key required.
// Fetched live (not cached in our DB) so it always reflects whatever
// APIMart's current rates are, since the user was explicit prices change
// over time and a hardcoded number would go stale.
const PRICING_BASE = "https://api.apimart.ai/api/pricing/model"

interface ApimartPricingResponse {
  success?: boolean
  data?: {
    billing_type?: string
    resolution_prices?: Record<string, number>
    size_quality_prices?: Record<string, Record<string, number>>
    // Solo presente para algunos modelos (ej. gpt-image-2.5-flare, que no
    // está en nuestro catálogo hoy) — cuando existe, es la lista real y
    // completa de aspect ratios que ese modelo acepta. Confirmado que
    // NINGUNO de los modelos actuales de nuestro catálogo (imagen o video)
    // la trae — ver getModelAspectRatioOptions.
    supported_sizes?: string[]
  }
}

async function fetchModelPricing(model: string): Promise<ApimartPricingResponse["data"] | null> {
  try {
    const res = await fetch(`${PRICING_BASE}?model=${encodeURIComponent(model)}`, { cache: "no-store" })
    if (!res.ok) return null
    const json = await res.json() as ApimartPricingResponse
    return json.data ?? null
  } catch {
    return null
  }
}

// Video (Seedance-style): billing_type "per_second" — resolution_prices is
// USD per second at that resolution, multiplied by the requested duration.
export async function estimateVideoCostUsd(model: string, resolution: string, durationSeconds: number): Promise<number | null> {
  const data = await fetchModelPricing(model)
  const perSecond = data?.resolution_prices?.[resolution]
  if (perSecond === undefined) return null
  return perSecond * durationSeconds
}

// Resoluciones REALES que un modelo de video acepta — sacadas directo de
// las keys de resolution_prices en vez de una lista fija que asume que
// todos los modelos soportan lo mismo (ese fue exactamente el bug: se
// mandaba "480P" a gemini-omni-1.1-flash, que solo acepta
// 360P/720P/1080P/4K, y APIMart lo rechazaba). Confirmado que esto
// coincide con el propio selector de resolución de apimart.ai para ese
// modelo (captura del usuario). Las keys con sufijo "-input" (precio
// distinto cuando el request trae una imagen de referencia) no son
// resoluciones separadas — se filtran y deduplican.
export async function getVideoModelResolutionOptions(model: string): Promise<string[]> {
  const data = await fetchModelPricing(model)
  if (!data?.resolution_prices) return []
  const keys = Object.keys(data.resolution_prices).filter((k) => !k.endsWith("-input"))
  return Array.from(new Set(keys))
}

// Image models each key resolution_prices by a DIFFERENT convention —
// confirmed by checking all four flagships directly against the pricing
// endpoint:
//   gpt-image-2.5-flare → aspect ratio ("1:1", "9:16@2k", ...)
//   nano-banana-pro/2, gpt-image-2 → resolution tier ("1K", "2K", "4K")
//   flux-2-pro → megapixels ("1MP".."4MP")
// Our node only exposes an aspect ratio picker today, so for the
// non-aspect-ratio models this tries the aspect ratio key first, then
// falls back to the first tier it recognizes — an approximation, not an
// exact match to whatever tier the node will actually request.
const FALLBACK_RESOLUTION_KEYS = ["2K", "1K", "4K", "0.5K", "2MP", "1MP", "3MP", "4MP"]

export async function estimateImageCostUsd(model: string, aspectRatio: string): Promise<number | null> {
  const data = await fetchModelPricing(model)
  if (!data?.resolution_prices) return null
  if (data.resolution_prices[aspectRatio] !== undefined) return data.resolution_prices[aspectRatio]
  for (const key of FALLBACK_RESOLUTION_KEYS) {
    if (data.resolution_prices[key] !== undefined) return data.resolution_prices[key]
  }
  return null
}

// Aspect ratios REALES de un modelo, cuando APIMart los publica — igual
// idea que getVideoModelResolutionOptions pero para "size" en vez de
// "resolution". A diferencia de la resolución, NINGÚN modelo de nuestro
// catálogo actual (imagen o video) trae `supported_sizes` ni usa keys de
// resolution_prices con forma de ratio ("9:16", etc.) — se confirmó
// consultando el endpoint uno por uno. Por eso esto regresa `[]` para
// todos ellos hoy: NO hay una fuente en vivo que confirme sus aspect
// ratios reales, a diferencia de la resolución. Se deja implementado para
// cuando algún modelo sí la publique (o si APIMart la agrega después) —
// mientras tanto, el panel de config cae a una lista estática amplia
// cuando esto regresa vacío, y el error real de APIMart al correr el nodo
// es la señal definitiva si un ratio específico no es válido.
export async function getModelAspectRatioOptions(model: string): Promise<string[]> {
  const data = await fetchModelPricing(model)
  if (data?.supported_sizes?.length) {
    const bare = data.supported_sizes.filter((s) => /^\d+:\d+$/.test(s))
    if (bare.length > 0) return Array.from(new Set(bare))
  }
  if (data?.resolution_prices) {
    const ratioKeys = Object.keys(data.resolution_prices).filter((k) => /^\d+:\d+$/.test(k))
    if (ratioKeys.length > 0) return Array.from(new Set(ratioKeys))
  }
  return []
}
