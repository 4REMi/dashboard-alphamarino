import type { AdCloneLine } from "@/lib/types"

// Lógica pura de los guiones de un brief (creative_briefs). SIN "use server".
// La usan las server actions del dashboard (lib/actions/creatives.ts) y el
// MCP (lib/mcp/script-tools.ts) para que ambos editen igual.
//
// Modelo: adapted_script es un mapa clave → líneas. La clave es el id del
// video de referencia (saved_ads) o una sintética ("manual", "manual_N",
// "gen_N"); los briefs viejos tienen un arreglo plano (clave "_single").
// La misma clave indexa script_titles y script_reviews.

export type ScriptMap = Record<string, AdCloneLine[]>

export interface BriefScriptsRow {
  adapted_script: unknown
  script_titles?: Record<string, string> | null
  script_reviews?: Record<string, unknown> | null
  attached_ad_ids?: string[] | null
  no_transcribe_ad_ids?: string[] | null
}

// null / arreglo plano (legacy) / mapa → siempre mapa.
export function normalizeScriptMap(raw: unknown): ScriptMap {
  if (!raw) return {}
  if (Array.isArray(raw)) return { _single: raw as AdCloneLine[] }
  return { ...(raw as ScriptMap) }
}

// Siguiente clave "<prefix>_N" libre, para no pisar guiones anteriores (ni
// las claves legacy "manual"/"gen" sin número).
export function nextScriptKey(scripts: ScriptMap, prefix: "manual" | "gen"): string {
  let n = 1
  while (scripts[`${prefix}_${n}`] !== undefined || (n === 1 && scripts[prefix] !== undefined)) n++
  return `${prefix}_${n}`
}

// Reemplaza las líneas de un guion. Editar invalida la revisión anterior:
// el cliente debe volver a revisar (queda "pending_review").
export function patchSetScriptLines(brief: BriefScriptsRow, key: string, lines: AdCloneLine[]) {
  const isLegacyArray = Array.isArray(brief.adapted_script)
  const adapted_script = isLegacyArray ? lines : { ...((brief.adapted_script as ScriptMap | null) ?? {}), [key]: lines }
  const reviewKey = isLegacyArray ? "_single" : key
  const script_reviews = { ...(brief.script_reviews ?? {}), [reviewKey]: { client_status: "pending_review", client_feedback: null } }
  return { adapted_script, script_reviews, updated_at: new Date().toISOString() }
}

// Quita una referencia/guion del brief en TODAS las columnas que usan su
// clave, para no dejar entradas huérfanas que se verían en la página
// compartida. Si la clave es un video de referencia, también se quita.
export function patchRemoveReference(brief: BriefScriptsRow, key: string) {
  const adapted_script = normalizeScriptMap(brief.adapted_script)
  delete adapted_script[key]
  const script_reviews = { ...(brief.script_reviews ?? {}) }
  delete script_reviews[key]
  const script_titles = { ...(brief.script_titles ?? {}) }
  delete script_titles[key]
  return {
    attached_ad_ids: (brief.attached_ad_ids ?? []).filter((id) => id !== key),
    no_transcribe_ad_ids: (brief.no_transcribe_ad_ids ?? []).filter((id) => id !== key),
    adapted_script,
    script_reviews,
    script_titles,
    updated_at: new Date().toISOString(),
  }
}

// Título de un guion; vacío lo quita (vuelve a "Guión #N").
export function patchScriptTitle(brief: BriefScriptsRow, key: string, title: string) {
  const script_titles = { ...(brief.script_titles ?? {}) }
  const t = title.trim()
  if (t) script_titles[key] = t
  else delete script_titles[key]
  return { script_titles, updated_at: new Date().toISOString() }
}

// Aprobación interna (sin revisión real del cliente) de los guiones que
// existen; onlyKeys limita a esos.
export function patchApproveScripts(brief: BriefScriptsRow, onlyKeys?: string[]) {
  const raw = brief.adapted_script
  const keys = raw && !Array.isArray(raw) ? Object.keys(raw as ScriptMap) : raw ? ["_single"] : []
  const script_reviews = { ...(brief.script_reviews ?? {}) }
  for (const k of keys.filter((k) => !onlyKeys || onlyKeys.includes(k))) {
    script_reviews[k] = { client_status: "approved", client_feedback: null }
  }
  return { script_reviews, updated_at: new Date().toISOString() }
}

// Guiones del brief en orden, con su título visible ("Guión #N" si no tiene).
export function listScripts(brief: BriefScriptsRow) {
  const raw = brief.adapted_script
  if (!raw) return []
  const entries: [string, AdCloneLine[]][] = Array.isArray(raw) ? [["_single", raw as AdCloneLine[]]] : Object.entries(raw as ScriptMap)
  const withLines = entries.filter(([, l]) => l?.length)
  return withLines.map(([key, lines], i) => ({
    key,
    lines,
    number: i + 1,
    title: brief.script_titles?.[key] || (withLines.length > 1 ? `Guión #${i + 1}` : "Guión"),
  }))
}

// Semillas de variante de "Crear rápido" (generateScriptDrafts): una por
// guion generado, para que las opciones no salgan iguales.
export const SCRIPT_VARIANT_SEEDS = [
  "opción 1 — hook directo, ve al grano",
  "opción 2 — hook narrativo, abre con una escena o pregunta",
  "opción 3 — hook contrastante, abre con una afirmación inesperada",
]

// Aplica a un guion cambios por línea, borrados e inserciones. TODOS los
// números se refieren al guion antes de editar (1 = primera línea; insertar
// después de 0 = al inicio), así no importa el orden de las operaciones.
export function applyLineEdits(
  before: AdCloneLine[],
  ops: {
    cambios?: ({ line: number } & Partial<Pick<AdCloneLine, "speaker" | "adapted" | "visual" | "overlay">>)[]
    quitar?: number[]
    insertar?: { after: number; line: AdCloneLine }[]
  },
): AdCloneLine[] {
  const n = before.length
  const check = (i: number) => { if (!Number.isInteger(i) || i < 1 || i > n) throw new Error(`El guion tiene ${n} líneas; no existe la línea ${i}.`) }
  const working = before.map((l) => ({ ...l }))
  for (const { line, ...fields } of ops.cambios ?? []) {
    check(line)
    Object.assign(working[line - 1], fields)
  }
  const removed = new Set(ops.quitar ?? [])
  removed.forEach(check)
  const inserts = new Map<number, AdCloneLine[]>()
  for (const ins of ops.insertar ?? []) {
    if (!Number.isInteger(ins.after) || ins.after < 0 || ins.after > n) throw new Error(`El guion tiene ${n} líneas; no se puede insertar después de la ${ins.after}.`)
    inserts.set(ins.after, [...(inserts.get(ins.after) ?? []), ins.line])
  }
  const after: AdCloneLine[] = [...(inserts.get(0) ?? [])]
  working.forEach((l, i) => {
    if (!removed.has(i + 1)) after.push(l)
    after.push(...(inserts.get(i + 1) ?? []))
  })
  return after
}
