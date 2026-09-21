// Color determinístico por nombre de categoría de oferta — mismo criterio
// que split-colors.ts en Ad Nodes (una paleta fija, elegida por hash del
// nombre en vez de por orden de aparición, para que una categoría siempre
// se vea del mismo color sin tener que guardar un mapeo aparte). Se usa
// tanto en los tiles de categoría como en el acento de cada tarjeta de
// oferta, para que el catálogo se lea por color de un vistazo.
const CATEGORY_COLORS = [
  "#6366f1", // indigo
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#06b6d4", // cyan
  "#8b5cf6", // violet
  "#ef4444", // red
  "#14b8a6", // teal
  "#f97316", // orange
  "#3b82f6", // blue
]

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[hashString(category) % CATEGORY_COLORS.length]
}
