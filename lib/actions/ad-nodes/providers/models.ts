// Pure data, no provider adapter imports — safe to import from client
// components (the node config panel's model dropdowns) without bundling
// server-only fetch/env-var code into the client bundle.
//
// Deliberately curated, not "every model APIMart offers" — the user was
// explicit: pick the industry flagships so the UI revolves around a small,
// stable set instead of an ever-changing catalog. Adding a model later is
// just a new entry here, nothing else needs to change structurally.

export const LLM_MODELS = [
  // Claude goes through the existing direct Anthropic integration
  // (lib/actions/ad-nodes/node-handlers.ts) — this account's own API key,
  // no APIMart markup on top. GPT-5 has no equivalent direct integration,
  // so it goes through APIMart.
  { value: "claude-sonnet-4-6", label: "Claude Sonnet (directo, sin margen de APIMart)", provider: "anthropic" as const },
  { value: "apimart:gpt-5", label: "GPT-5 (APIMart)", provider: "apimart" as const },
] as const

export const IMAGE_MODELS = [
  { value: "apimart:nano-banana-pro", label: "Nano Banana Pro (APIMart)", provider: "apimart" as const },
  { value: "apimart:nano-banana-2", label: "Nano Banana 2 (APIMart)", provider: "apimart" as const },
  { value: "apimart:gpt-image-2", label: "GPT Image 2 (APIMart)", provider: "apimart" as const },
  { value: "apimart:flux-2-pro", label: "Flux 2 Pro (APIMart)", provider: "apimart" as const },
] as const

export const VIDEO_MODELS = [
  { value: "apimart:veo-3.1-fast", label: "Veo 3.1 Fast (APIMart)", provider: "apimart" as const },
  { value: "apimart:veo-3.1", label: "Veo 3.1 (APIMart)", provider: "apimart" as const },
  { value: "apimart:veo-3.1-lite", label: "Veo 3.1 Lite (APIMart)", provider: "apimart" as const },
  { value: "apimart:seedance-2.5", label: "Seedance 2.5 (APIMart)", provider: "apimart" as const },
  { value: "apimart:seedance-2.0", label: "Seedance 2.0 (APIMart)", provider: "apimart" as const },
  { value: "apimart:seedance-2.0-fast", label: "Seedance 2.0 Fast (APIMart)", provider: "apimart" as const },
  { value: "apimart:seedance-1.5-pro", label: "Seedance 1.5 Pro (APIMart)", provider: "apimart" as const },
  { value: "apimart:kling-video-o3-pro", label: "Kling Video O3 Pro (APIMart)", provider: "apimart" as const },
  // Slug sin confirmar — no aparece en la documentación pública de APIMart
  // ni el endpoint de precios lo valida (regresa la misma plantilla
  // genérica para cualquier string). Se corrige si al correrlo real
  // APIMart tira "modelo no encontrado" — mismo patrón ya usado para
  // Seedance/GPT-Image antes de confirmarlos.
  { value: "apimart:omniflash-1.1", label: "OmniFlash 1.1 (APIMart)", provider: "apimart" as const },
] as const
