// Partes de un creativo: gancho, cuerpo y cierre. SIN "use server".
//
// El análisis de concepto (lib/actions/ad-analysis.ts) marca de qué segundo
// a qué segundo va cada parte y la clasifica con un tipo de ESTAS listas
// fijas. Las listas son cerradas a propósito: así los anuncios se pueden
// agrupar ("los ganchos de producto en uso detienen 33 %") en vez de que
// cada análisis invente su propio nombre. Agregar un tipo = una entrada aquí.

export type PartKey = "gancho" | "cuerpo" | "cierre"

export const PART_LABEL: Record<PartKey, string> = { gancho: "Gancho", cuerpo: "Cuerpo", cierre: "Cierre" }

export const PART_TYPES: Record<PartKey, string[]> = {
  gancho: [
    "Producto en uso",
    "Resultado primero",
    "Pregunta",
    "Afirmación o dato llamativo",
    "Problema o dolor",
    "Persona a cámara",
    "Testimonio",
    "Texto u oferta en pantalla",
    "Unboxing",
    "Tendencia o humor",
    "Otro",
  ],
  cuerpo: [
    "Demostración continua",
    "Paso a paso o tutorial",
    "Testimonio",
    "Historia u origen",
    "Problema y solución",
    "Lista de beneficios",
    "Comparación",
    "Detrás de cámaras",
    "Otro",
  ],
  cierre: [
    "Oferta o descuento",
    "Urgencia o fecha límite",
    "Paquete o kit completo",
    "Envío gratis",
    "Garantía",
    "Prueba social",
    "Precio visible",
    "Llamado simple",
    "Sin cierre claro",
    "Otro",
  ],
}

export interface CreativePart {
  desde: number | null      // segundos; null en imágenes
  hasta: number | null
  tipo: string              // uno de PART_TYPES[parte]
  que_pasa: string
}

export type CreativeParts = Record<PartKey, CreativePart>

// Normaliza lo que devuelve la IA: tipo fuera de la lista → "Otro";
// tiempos fuera de rango → null.
export function normalizeParts(raw: unknown): CreativeParts | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, Record<string, unknown> | undefined>
  const out = {} as CreativeParts
  for (const key of ["gancho", "cuerpo", "cierre"] as PartKey[]) {
    const p = r[key] ?? {}
    const tipo = typeof p.tipo === "string" ? p.tipo.trim() : ""
    const match = PART_TYPES[key].find((t) => t.toLowerCase() === tipo.toLowerCase())
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 600 ? v : null)
    out[key] = {
      desde: num(p.desde),
      hasta: num(p.hasta),
      tipo: match ?? "Otro",
      que_pasa: typeof p.que_pasa === "string" ? p.que_pasa.slice(0, 200) : "",
    }
  }
  return out
}

// Instrucciones para el prompt del análisis de concepto.
export const PARTS_PROMPT = `"partes": divide el creativo en GANCHO (lo que detiene: normalmente los primeros 1-3 s), CUERPO (lo que sostiene la atención y explica) y CIERRE (lo que pide la acción: oferta, CTA, precio). En video, "desde" y "hasta" en SEGUNDOS (números, sin huecos: el cuerpo empieza donde acaba el gancho y el cierre termina al final). En imagen, desde/hasta = null; gancho = lo visual que detiene, cuerpo = el texto del anuncio, cierre = precio/CTA/oferta.
"tipo" EXACTAMENTE uno de estas listas (si ninguno encaja, "Otro"):
gancho: ${PART_TYPES.gancho.join(" | ")}
cuerpo: ${PART_TYPES.cuerpo.join(" | ")}
cierre: ${PART_TYPES.cierre.join(" | ")}`

export const PARTS_JSON_SHAPE = `"partes":{"gancho":{"desde":0,"hasta":3,"tipo":"","que_pasa":"máx. 12 palabras"},"cuerpo":{"desde":3,"hasta":18,"tipo":"","que_pasa":"máx. 12"},"cierre":{"desde":18,"hasta":21,"tipo":"","que_pasa":"máx. 12"}}`

// Clave del análisis de un creativo de auditoría en ad_analyses: uno por
// video (se repiten entre anuncios); en imágenes, uno por anuncio.
export function auditAnalysisKey(ad: { meta_video_id?: string | null; meta_ad_id: string; format: string }): string {
  return ad.format === "video" && ad.meta_video_id ? `audit:v:${ad.meta_video_id}` : `audit:i:${ad.meta_ad_id}`
}
