// Extrae el JSON de una respuesta de Claude con errores claros según la
// causa, en vez de un "AI returned invalid JSON" genérico: respuesta
// cortada por max_tokens, rechazo, o texto sin JSON.

interface AiMessage {
  stop_reason?: string | null
  content: { type: string; text?: string }[]
}

export function parseAiJson<T>(message: AiMessage, context: string): T {
  const text = message.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim()
  if (message.stop_reason === "max_tokens") {
    console.error(`[${context}] respuesta cortada por max_tokens (${text.length} caracteres)`)
    throw new Error("La respuesta de la IA salió demasiado larga y se cortó. Intenta de nuevo.")
  }
  if (message.stop_reason === "refusal" || !text) {
    console.error(`[${context}] respuesta vacía o rechazada (stop_reason=${message.stop_reason})`)
    throw new Error("La IA no devolvió contenido. Intenta de nuevo.")
  }
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
  try {
    return JSON.parse(cleaned) as T
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      try { return JSON.parse(match[0]) as T } catch { /* cae al error de abajo */ }
    }
    console.error(`[${context}] JSON inválido. stop_reason=${message.stop_reason}. Inicio: ${text.slice(0, 300)}`)
    throw new Error("La IA devolvió un formato inválido. Intenta de nuevo.")
  }
}
