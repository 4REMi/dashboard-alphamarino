import type { GenerationAdapter } from "./types"
import { replicateAdapter } from "./replicate"
import { apimartAdapter } from "./apimart"
import { IMAGE_MODELS, VIDEO_MODELS } from "./models"

export { IMAGE_MODELS, VIDEO_MODELS }

function findModel(kind: "image" | "video", modelValue: string) {
  const list = kind === "image" ? IMAGE_MODELS : VIDEO_MODELS
  const model = list.find((m) => m.value === modelValue)
  if (!model) throw new Error(`Modelo de ${kind === "image" ? "imagen" : "video"} desconocido: ${modelValue}`)
  return model
}

export function getModelProvider(kind: "image" | "video", modelValue: string): "replicate" | "apimart" {
  return findModel(kind, modelValue).provider
}

export function getGenerationAdapter(kind: "image" | "video", modelValue: string): GenerationAdapter {
  const model = findModel(kind, modelValue)
  if (model.provider === "replicate") return replicateAdapter(model.value)
  const apimartModel = model.value.replace("apimart:", "")
  return apimartAdapter(kind, apimartModel)
}
