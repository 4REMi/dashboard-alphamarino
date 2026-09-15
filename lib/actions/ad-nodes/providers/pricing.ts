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

// Image (GPT-Image-style): resolution_prices is already a flat per-image
// USD cost at "auto" quality for a given aspect ratio — the same aspect
// ratio key our node config already uses (e.g. "1:1", "9:16").
export async function estimateImageCostUsd(model: string, aspectRatio: string): Promise<number | null> {
  const data = await fetchModelPricing(model)
  const price = data?.resolution_prices?.[aspectRatio]
  return price ?? null
}
