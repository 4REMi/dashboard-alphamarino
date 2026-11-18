// Tics de escritura de la IA que no queremos en ningún texto de venta:
//   1. Paralelismo negativo  — "No es X, es Y", "no solo X, sino también Y".
//   2. Antítesis simétrica   — "menos X, más Y".
//   3. Frases cortas sueltas — "Sin excusas. Sin vueltas. Solo resultados."
// SIN "use server": lógica pura (regex), sin imports. La usan los prompts
// (WRITING_RULES), el reintento automático del constructor de guiones
// (ticsFeedback) y los avisos de Revisión (lintScript).

export type TicKind = "paralelismo" | "antitesis" | "frase_suelta"
export interface Tic { kind: TicKind; excerpt: string }

export const TIC_LABEL: Record<TicKind, string> = {
  paralelismo: "paralelismo negativo («no es X, es Y»)",
  antitesis: "antítesis simétrica («menos X, más Y»)",
  frase_suelta: "frases cortas sueltas para dar peso",
}

// Bloque que se agrega al system prompt de cualquier generador de copy.
export const WRITING_RULES = `ESTILO — TRES TICS DE IA PROHIBIDOS (delatan que lo escribió una máquina):
1. PARALELISMO NEGATIVO: negar algo para afirmar su opuesto. Prohibido "no es X, es Y", "no es X. Es Y.", "no solo X, sino también Y", "no se trata de X, se trata de Y", "más que un X, es un Y", "lejos de ser X, es Y". Di directamente lo que SÍ es o lo que pasa.
2. ANTÍTESIS SIMÉTRICA: dos mitades espejo que se oponen. Prohibido "menos X, más Y", "más X, menos Y", "poco X, mucho Y". Da un solo beneficio concreto.
3. FRASES CORTAS SUELTAS PARA DAR PESO: remates de 1–4 palabras puestos solo para sonar contundente ("Sin excusas. Sin vueltas. Solo resultados." / "Punto." / "Así de simple."). Escribe oraciones completas, con el ritmo de alguien que habla natural; une las ideas cortas en una sola oración.
Ejemplo — ✗ "No es un colchón, es descanso real. Sin ruido. Sin dolor." ✓ "Duermes seis horas seguidas sin despertar con la espalda cargada."
Antes de responder, revisa tu texto y reescribe cualquier frase que caiga en estos patrones.`

const END = "[^.!?\\n]"
const mk = (src: string) => new RegExp(src, "giu")

// Paralelismo negativo.
const NEG_SOLO = mk(`\\bno\\s+(?:sólo|solo|solamente|únicamente|simplemente|meramente)\\b${END}{0,120}?\\b(?:sino|también|además)\\b${END}{0,60}`)
const NO_SE_TRATA = mk(`\\bno\\s+se\\s+trata\\s+de\\b${END}{0,100}?(?:[,;:—]|\\.\\s*|\\s-\\s)\\s*(?:se\\s+trata\\s+de|sino)\\b${END}{0,40}`)
const NO_ES_ES = mk(`\\b(?:(?:esto|eso|aquí|ahí)\\s+)?no\\s+(?:es|son|fue|fueron|era|eran|será|serán|significa|está|están)\\s+${END}{1,60}?\\s*(?:[,;:—]|\\.\\s+|\\s-\\s)\\s*(?:(?:esto|eso|aquí|ahí|pero)\\s+)?(?:es|son|fue|fueron|era|eran|será|serán|significa|está|están|sino)\\b${END}{0,40}`)
const NO_SINO = mk(`\\bno\\s+${END}{2,50}?,\\s*sino\\b${END}{0,40}`)
const MAS_QUE = mk(`\\bmás\\s+que\\s+(?:un|una|el|la|solo|sólo)\\b${END}{1,50}?,\\s*(?:es|son|se\\s+convierte)\\b${END}{0,40}`)
const LEJOS = mk(`\\blejos\\s+de\\s+ser\\b${END}{1,50}?,\\s*(?:es|son)\\b${END}{0,40}`)
const NO_ES_QUE = mk(`\\bno\\s+es\\s+que\\b${END}{1,60}?,\\s*es\\s+que\\b${END}{0,40}`)

// Antítesis simétrica.
const MENOS_MAS = mk(`\\b(menos|más|mas)\\s+(\\p{L}+)(?:\\s+\\p{L}+){0,2}?\\s*(?:,|;|—|\\sy|\\se)\\s*(menos|más|mas)\\s+(\\p{L}+)`)
const POCO_MUCHO = mk(`\\b(?:poco|poca|pocos|pocas)\\s+\\p{L}+(?:\\s+\\p{L}+)?\\s*(?:,|;|—|\\sy)\\s*(?:mucho|mucha|muchos|muchas)\\s+\\p{L}+`)
const MUCHO_POCO = mk(`\\b(?:mucho|mucha|muchos|muchas)\\s+\\p{L}+(?:\\s+\\p{L}+)?\\s*(?:,|;|—|\\sy)\\s*(?:poco|poca|pocos|pocas)\\s+\\p{L}+`)

const NOT_COMPARATIVE = new Set(["de", "que", "del", "a", "o", "al", "bien", "aún", "aun"])
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")

function collect(text: string, re: RegExp, kind: TicKind, out: Tic[], ok?: (m: RegExpExecArray) => boolean) {
  re.lastIndex = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (!ok || ok(m)) out.push({ kind, excerpt: m[0].trim() })
    if (m[0].length === 0) re.lastIndex++
  }
}

// Frases cortas: una "frase" son ≤4 palabras entre puntuación fuerte.
const STARTERS = /^(sin|solo|sólo|nada|cero|ni|así|asi|punto|simple|fácil|facil|y ya|nada más|fin|listo|resultados?|eso es|nunca|siempre)\b/i
const words = (s: string) => (s.match(/[\p{L}\p{N}]+/gu) ?? []).length

function shortSentences(text: string, out: Tic[]) {
  // Chats ("Ana: hola") son líneas cortas por naturaleza.
  if ((text.match(/^\s*\p{L}[\p{L} ]{0,20}:\s*\S/gmu) ?? []).length >= 2) return
  const sents = (text.match(/[^.!?…\n]+[.!?…]*/g) ?? []).map((s) => s.trim()).filter((s) => words(s) > 0)
  const isShort = (s: string) => words(s) <= 4
  let i = 0
  while (i < sents.length) {
    if (!isShort(sents[i])) { i++; continue }
    let j = i
    while (j < sents.length && isShort(sents[j])) j++
    const run = sents.slice(i, j)
    const rhetorical = run.filter((s) => STARTERS.test(norm(s).replace(/^[¡¿"“']+/, ""))).length
    const afterLong = i > 0 && words(sents[i - 1]) >= 6
    if (run.length >= 3 || (run.length >= 2 && rhetorical >= 1) || (afterLong && rhetorical >= 1)) {
      out.push({ kind: "frase_suelta", excerpt: run.join(" ") })
    }
    i = j
  }
}

export function findWritingTics(text: string, opts: { skipShort?: boolean } = {}): Tic[] {
  const out: Tic[] = []
  if (!text || !text.trim()) return out
  for (const re of [NEG_SOLO, NO_SE_TRATA, NO_ES_ES, NO_SINO, MAS_QUE, LEJOS, NO_ES_QUE]) collect(text, re, "paralelismo", out)
  collect(text, MENOS_MAS, "antitesis", out, (m) => {
    const a = norm(m[1]), b = norm(m[3])
    if (a === b || a.replace("mas", "más") === b) return false
    return !NOT_COMPARATIVE.has(norm(m[2])) && !NOT_COMPARATIVE.has(norm(m[4]))
  })
  collect(text, POCO_MUCHO, "antitesis", out)
  collect(text, MUCHO_POCO, "antitesis", out)
  if (!opts.skipShort) shortSentences(text, out)
  // Sin duplicados (varios patrones pueden cazar la misma frase).
  const seen = new Set<string>()
  return out.filter((t) => { const k = norm(t.excerpt); if (seen.has(k)) return false; seen.add(k); return true })
}

// Instrucción de corrección para el reintento: cita las frases exactas.
export function ticsFeedback(tics: Tic[]): string {
  const lines = tics.slice(0, 12).map((t) => `- ${TIC_LABEL[t.kind]}: «${t.excerpt}»`).join("\n")
  return `CORRECCIÓN OBLIGATORIA: tu respuesta anterior cayó en tics de redacción de IA que están prohibidos:\n${lines}\nVuelve a escribir TODA la respuesta con el mismo formato, reescribiendo esas frases (y cualquier otra similar) afirmando directamente lo que sí es, con oraciones completas y un ritmo natural al hablar.`
}
