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
