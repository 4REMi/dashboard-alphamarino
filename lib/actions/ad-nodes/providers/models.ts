// Pure data, no provider adapter imports — safe to import from client
// components (the node config panel's model dropdown) without bundling
// server-only fetch/env-var code into the client bundle.
export const IMAGE_MODELS = [
  { value: "google/nano-banana-pro", label: "Nano Banana Pro (Replicate)", provider: "replicate" as const },
] as const

export const VIDEO_MODELS = [
  { value: "apimart:sora2", label: "Sora 2 (APIMart) — pendiente de integrar", provider: "apimart" as const },
  { value: "apimart:veo3", label: "Veo 3 (APIMart) — pendiente de integrar", provider: "apimart" as const },
] as const
