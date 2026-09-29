// Nombre legible del tipo de resultado de Meta (según el objetivo).
export function resultLabel(type: string | null | undefined): string {
  if (!type) return "Resultados"
  if (type.includes("messaging")) return "Conversaciones iniciadas"
  if (type.includes("lead")) return "Leads"
  if (type.includes("purchase")) return "Compras"
  if (type.includes("link_click")) return "Clics"
  if (type.includes("registration")) return "Registros"
  return "Resultados"
}

export const RESULT_SINGULAR: Record<string, string> = {
  "Conversaciones iniciadas": "conversación", Leads: "lead", Compras: "compra", Clics: "clic", Registros: "registro", Resultados: "resultado",
}
