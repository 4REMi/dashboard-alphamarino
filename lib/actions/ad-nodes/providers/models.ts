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
  // Slugs de Veo corregidos: "veo-3.1-fast"/"veo-3.1"/"veo-3.1-lite" (los
  // adivinados originalmente) NO EXISTEN — el endpoint de precios los
  // regresaba con la plantilla genérica. Los reales, confirmados en
  // apimart.ai/model/veo-3-1 y contra el endpoint de precios (traen
  // resolution_prices real, no la plantilla), son "veo3.1-fast" y
  // "veo3.1-quality" (sin guion entre "veo" y "3.1"). No existe una
  // variante "Lite" — se quita del catálogo.
  { value: "apimart:veo3.1-fast", label: "Veo 3.1 Fast (APIMart)", provider: "apimart" as const },
  { value: "apimart:veo3.1-quality", label: "Veo 3.1 Quality (APIMart)", provider: "apimart" as const },
  { value: "apimart:seedance-2.5", label: "Seedance 2.5 (APIMart)", provider: "apimart" as const },
  { value: "apimart:seedance-2.0", label: "Seedance 2.0 (APIMart)", provider: "apimart" as const },
  { value: "apimart:seedance-2.0-fast", label: "Seedance 2.0 Fast (APIMart)", provider: "apimart" as const },
  // Slug corregido: "seedance-1.5-pro" (adivinado) no existe — el real es
  // "doubao-seedance-1-5-pro" (apimart.ai/model/doubao-seedance-1-5-pro).
  { value: "apimart:doubao-seedance-1-5-pro", label: "Seedance 1.5 Pro (APIMart)", provider: "apimart" as const },
  // "Kling Video O3 Pro" no existe en APIMart — el modelo real es
  // "Kling Video O1" (kling-video-o1). Se cobra por "billing_tiers"
  // (pro/pro-video/video), no por resolution_prices como los demás — el
  // selector de "Resolución" no aplica para este modelo (se oculta en el
  // panel de config si el modelo no trae resolution_prices).
  { value: "apimart:kling-video-o1", label: "Kling Video O1 (APIMart)", provider: "apimart" as const },
  // Confirmado en apimart.ai/model/gemini-omni-1-1-flash y contra el
  // endpoint de precios (regresa resolution_prices reales para
  // 360P/720P/1080P/4K, no la plantilla genérica) — el slug real es
  // "gemini-omni-1.1-flash", NO "omniflash-1.1" como se había adivinado.
  { value: "apimart:gemini-omni-1.1-flash", label: "Gemini Omni 1.1 Flash (APIMart)", provider: "apimart" as const },
] as const
