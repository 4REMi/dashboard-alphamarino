// Pure data, no provider adapter imports — safe to import from client
// components (the node config panel's model dropdown) without bundling
// server-only fetch/env-var code into the client bundle.
export const IMAGE_MODELS = [
  { value: "google/nano-banana-pro", label: "Nano Banana Pro (Replicate)", provider: "replicate" as const },
  { value: "apimart:gpt-image-2.5-flare", label: "GPT Image 2.5 Flare (APIMart)", provider: "apimart" as const },
] as const

export const VIDEO_MODELS = [
  { value: "apimart:seedance-2.5", label: "Seedance 2.5 (APIMart)", provider: "apimart" as const },
] as const
