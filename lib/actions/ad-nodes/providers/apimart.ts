import type { GenerationAdapter } from "./types"

// BLOQUEADO — ver docs/agent-guides/ad-lab-ad-nodes.md, sección APIMart.
// La documentación pública de APIMart no da los nombres exactos de campos
// JSON de sus endpoints (POST /v1/images/generations, POST
// /v1/videos/generations, GET /v1/tasks/{task_id}) — adivinarlos rompería
// en producción sin aviso. Antes de implementar esto de verdad, se necesita
// un ejemplo real de request/respuesta de esos tres endpoints (de la cuenta
// de APIMart del usuario, o un curl que ya se haya probado).
export function apimartAdapter(_kind: "image" | "video", _model: string): GenerationAdapter {
  return {
    async submit() {
      throw new Error("APIMart todavía no está integrado — falta confirmar el formato real de su API antes de construir este adaptador.")
    },
    async poll() {
      throw new Error("APIMart todavía no está integrado.")
    },
  }
}
