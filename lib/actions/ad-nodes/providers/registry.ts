import type { GenerationAdapter } from "./types"
import { apimartAdapter } from "./apimart"
import { IMAGE_MODELS, VIDEO_MODELS } from "./models"

export { IMAGE_MODELS, VIDEO_MODELS }

function findModel(kind: "image" | "video", modelValue: string) {
  const list = kind === "image" ? IMAGE_MODELS : VIDEO_MODELS
  const model = list.find((m) => m.value === modelValue)
  if (!model) throw new Error(`Modelo de ${kind === "image" ? "imagen" : "video"} desconocido: ${modelValue}`)
  return model
}

// Every curated image/video model routes through APIMart today (see
// providers/models.ts) — the Replicate adapter (providers/replicate.ts)
// stays available for a future model that needs it, just unused right now.
export function getGenerationAdapter(kind: "image" | "video", modelValue: string): GenerationAdapter {
  const model = findModel(kind, modelValue)
  const apimartModel = model.value.replace("apimart:", "")
  return apimartAdapter(kind, apimartModel)
}
