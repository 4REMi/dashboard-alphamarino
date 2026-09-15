import type { GenerationAdapter } from "./types"
import { replicateAdapter } from "./replicate"
import { apimartAdapter } from "./apimart"
import { IMAGE_MODELS, VIDEO_MODELS } from "./models"

export { IMAGE_MODELS, VIDEO_MODELS }

export function getGenerationAdapter(kind: "image" | "video", modelValue: string): GenerationAdapter {
  if (kind === "image") {
    const model = IMAGE_MODELS.find((m) => m.value === modelValue)
    if (!model) throw new Error(`Modelo de imagen desconocido: ${modelValue}`)
    return replicateAdapter(model.value)
  }
  const model = VIDEO_MODELS.find((m) => m.value === modelValue)
  if (!model) throw new Error(`Modelo de video desconocido: ${modelValue}`)
  const apimartModel = model.value.replace("apimart:", "")
  return apimartAdapter("video", apimartModel)
}
