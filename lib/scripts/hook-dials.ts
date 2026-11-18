import { TRIGGERS } from "@/lib/scripts/framework"

// Ajustes del hook en el constructor de guiones (paso Hooks). Lógica pura, SIN
// "use server": la usan la pantalla (sliders, chips, presets) y la acción de IA
// (lib/actions/script-builder.ts), que la vuelve a sanear porque llega del
// navegador.
//
// Regla de oro: con todo en automático el prompt NO cambia (hookDialsBrief
// devuelve ""). Solo lo que el usuario mueve entra al prompt, para no
// sobre-restringir a la IA. Nivel 3 de cada slider = automático.

export const LEVELS = [1, 2, 3, 4, 5] as const
export type DialKey = "persona" | "intensidad" | "concretud" | "curiosidad" | "longitud"
export type HookForm = "pregunta" | "afirmacion" | "dato" | "escena" | "demostracion"

export interface HookDials {
  persona: number      // 1 amplia … 5 una persona y su escena
  intensidad: number   // 1 suave/empático … 5 crudo/confrontador
  concretud: number    // 1 evocador … 5 muy concreto
  curiosidad: number   // 1 claro y directo … 5 misterioso
  longitud: number     // 1 mínimo … 5 usa todo el presupuesto de palabras
  triggers: string[]   // vacío = todos (varía entre los 6)
  formas: HookForm[]   // vacío = cualquiera
  sinSonido: boolean   // debe funcionar con el sonido apagado
}

export const DEFAULT_DIALS: HookDials = { persona: 3, intensidad: 3, concretud: 3, curiosidad: 3, longitud: 3, triggers: [], formas: [], sinSonido: false }

export const DIAL_DEFS: { key: DialKey; label: string; short: string; low: string; high: string; levels: [string, string, string, string, string] }[] = [
  { key: "persona", label: "Especificidad de persona", short: "Persona", low: "Amplia", high: "Hiperespecífica",
    levels: ["Cualquiera con el problema", "El grupo en general", "Automático", "Subgrupo en su situación", "Una persona y su escena"] },
  { key: "intensidad", label: "Intensidad emocional", short: "Intensidad", low: "Suave", high: "Cruda",
    levels: ["Suave y empático", "Calmado", "Automático", "Fuerte", "Crudo y confrontador"] },
  { key: "concretud", label: "Concretud", short: "Concretud", low: "Evocador", high: "Muy concreto",
    levels: ["Evocador, sin datos", "Más imagen que dato", "Automático", "Con detalles concretos", "Muy concreto"] },
  { key: "curiosidad", label: "Curiosidad", short: "Curiosidad", low: "Directo", high: "Misterioso",
    levels: ["Claro y directo", "Bastante directo", "Automático", "Con bucle abierto", "Misterioso"] },
  { key: "longitud", label: "Longitud", short: "Longitud", low: "Mínima", high: "Máxima",
    levels: ["Mínima", "Corta", "Automático", "Larga", "Usa todo el presupuesto"] },
]

export const HOOK_FORMS: { key: HookForm; label: string; guide: string }[] = [
  { key: "pregunta", label: "Pregunta", guide: "una pregunta que suena a observación sobre la persona" },
  { key: "afirmacion", label: "Afirmación", guide: "una afirmación directa o polémica" },
  { key: "dato", label: "Dato", guide: "un dato o cifra (SOLO uno que venga del contexto; si no hay, un marcador [dato])" },
  { key: "escena", label: "Escena", guide: "una escena o mini-historia ya en curso (\"Anoche, a las 3 a. m., …\")" },
  { key: "demostracion", label: "Demostración", guide: "una demostración visual: el hook es lo que se VE y lo hablado solo lo complementa" },
]

// Atajos: parten de automático y mueven solo lo que dicen.
export const HOOK_PRESETS: { key: string; label: string; hint: string; dials: Partial<HookDials> }[] = [
  { key: "callout", label: "Call-out a una persona", hint: "Habla a un perfil muy concreto y su escena", dials: { persona: 5, concretud: 4, curiosidad: 2 } },
  { key: "scroll", label: "Rompe-scroll", hint: "Corto, intenso y con bucle abierto; sirve sin sonido", dials: { intensidad: 4, curiosidad: 5, longitud: 1, sinSonido: true } },
  { key: "empatico", label: "Empático", hint: "Valida sin agitar", dials: { intensidad: 1, persona: 4, curiosidad: 2 } },
  { key: "directo", label: "Directo al grano", hint: "Dice de qué va desde la primera frase", dials: { curiosidad: 1, concretud: 4, longitud: 2 } },
]
export const applyPreset = (key: string): HookDials => ({ ...DEFAULT_DIALS, ...(HOOK_PRESETS.find((p) => p.key === key)?.dials ?? {}) })

// Ajustes sobre UN hook que ya gustó ("Más como este, pero…").
export type HookRefine = "specific" | "short" | "bold" | "curious"
export const HOOK_REFINES: { key: HookRefine; label: string; instruction: string }[] = [
  { key: "specific", label: "Más específico", instruction: "MÁS ESPECÍFICOS que el original: más detalle de la persona y de la escena concreta que vive." },
  { key: "short", label: "Más corto", instruction: "MÁS CORTOS que el original: recorta a lo esencial (la mitad de palabras si se puede) sin perder la idea." },
  { key: "bold", label: "Más fuerte", instruction: "MÁS FUERTES que el original: más directos y emocionales, sin humillar ni culpar a la persona." },
  { key: "curious", label: "Más curioso", instruction: "MÁS CURIOSOS que el original: abre más el bucle, sin revelar la respuesta." },
]
export const refineBrief = (r?: HookRefine): string => HOOK_REFINES.find((x) => x.key === r)?.instruction ?? ""

// Lo que llega del navegador no es de fiar: niveles 1–5, listas solo con
// valores válidos, booleano real.
export function sanitizeDials(raw: unknown): HookDials {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const level = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 3 }
  const pick = <T extends string>(v: unknown, allowed: readonly T[]): T[] =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is T => typeof x === "string" && (allowed as readonly string[]).includes(x)))] : []
  return {
    persona: level(r.persona ?? 3), intensidad: level(r.intensidad ?? 3), concretud: level(r.concretud ?? 3), curiosidad: level(r.curiosidad ?? 3), longitud: level(r.longitud ?? 3),
    triggers: pick(r.triggers, TRIGGERS), formas: pick(r.formas, HOOK_FORMS.map((f) => f.key)), sinSonido: r.sinSonido === true,
  }
}

export const isDefaultDials = (d: HookDials) =>
  d.persona === 3 && d.intensidad === 3 && d.concretud === 3 && d.curiosidad === 3 && d.longitud === 3 && !d.triggers.length && !d.formas.length && !d.sinSonido

// Resumen corto para el encabezado del panel.
export function dialsSummary(d: HookDials): string {
  if (isDefaultDials(d)) return "Automático"
  const parts: string[] = []
  for (const def of DIAL_DEFS) if (d[def.key] !== 3) parts.push(`${def.short}: ${def.levels[d[def.key] - 1]}`)
  if (d.triggers.length) parts.push(`Disparadores: ${d.triggers.join(", ")}`)
  if (d.formas.length) parts.push(`Formas: ${d.formas.map((f) => HOOK_FORMS.find((x) => x.key === f)!.label).join(", ")}`)
  if (d.sinSonido) parts.push("Sin sonido")
  return parts.join(" · ")
}

// Instrucciones para el prompt de los hooks. "" si todo está en automático.
// hookWords = máximo de palabras del hook según la duración del video.
export function hookDialsBrief(d: HookDials, o: { hookWords: number }): string {
  const L: string[] = []
  if (d.persona !== 3) {
    L.push("ESPECIFICIDAD DE PERSONA: " + ({
      1: "AMPLIA. El hook le habla a cualquiera que tenga el problema; no segmentes ni nombres a un grupo.",
      2: "GRUPO. Dirígete al grupo general de la persona (su rol o identidad), sin detalles de su situación.",
      4: "SUBGRUPO EN SU SITUACIÓN. Nombra quién es y en qué momento está, para que quien encaja se sienta descrito.",
      5: "UNA PERSONA Y SU ESCENA. Call-out hiperespecífico: quién es, qué hace y una escena concreta (hora, lugar, detalle cotidiano) que solo vive alguien así. Quien no encaja debe sentir que no es para él. Parte de la persona del concepto; no inventes demografía que contradiga la marca.",
    } as Record<number, string>)[d.persona])
  }
  if (d.intensidad !== 3) {
    L.push("INTENSIDAD EMOCIONAL: " + ({
      1: "SUAVE. Tono empático y cálido; valida sin agitar ni dramatizar.",
      2: "CALMADA. Reconoce el dolor sin elevar el tono.",
      4: "FUERTE. Agita el dolor con crudeza y consecuencias reales; directo.",
      5: "CRUDA. Confrontadora y provocadora, sin suavizar; que incomode. Sin insultar, sin humillar y sin culpar a la persona.",
    } as Record<number, string>)[d.intensidad])
  }
  if (d.concretud !== 3) {
    L.push("CONCRETUD: " + ({
      1: "EVOCADORA. Imagen y sensación; sin cifras ni datos.",
      2: "Más imagen que dato; pocos detalles.",
      4: "CONCRETA. Incluye detalles específicos de escena (hora, lugar, objeto, gesto).",
      5: "MUY CONCRETA. Carga el hook de detalles específicos y tangibles.",
    } as Record<number, string>)[d.concretud])
  }
  if (d.concretud >= 4) {
    L.push("DATOS: detalles de ESCENA (hora, lugar, objeto, gesto) sí puedes inventarlos para que se vea real; ESTADÍSTICAS, porcentajes, resultados y testimonios NO, salvo que vengan en el contexto de la marca; si hace falta uno, deja un marcador [dato].")
  }
  if (d.curiosidad !== 3) {
    L.push("CURIOSIDAD: " + ({
      1: "CLARO Y DIRECTO. Dice de qué va desde la primera frase; sin misterio ni bucle abierto.",
      2: "Bastante directo; poco misterio.",
      4: "CON BUCLE ABIERTO. Deja algo que falta o sorprende y que el espectador quiere cerrar; no reveles la respuesta.",
      5: "MISTERIOSO. Una pregunta fuerte sin respuesta o una contradicción: hay que seguir viendo para entenderla. Sin clickbait vacío: la respuesta debe existir en el cuerpo del guion.",
    } as Record<number, string>)[d.curiosidad])
  }
  if (d.longitud !== 3) {
    const w = (f: number) => Math.max(3, Math.round(o.hookWords * f))
    L.push("LONGITUD: " + ({
      1: `MÍNIMA. Apunta a ~${w(0.4)} palabras o menos.`,
      2: `CORTA. Apunta a ~${w(0.65)} palabras.`,
      4: `LARGA. Apunta a ~${w(0.85)} palabras.`,
      5: `USA TODO el presupuesto: hasta ${o.hookWords} palabras.`,
    } as Record<number, string>)[d.longitud] + ` (Nunca más de ${o.hookWords}.)`)
  }
  if (d.triggers.length) {
    L.push(`DISPARADORES PERMITIDOS: usa SOLO ${d.triggers.join(", ")}. Si son menos de 6, reparte los 6 hooks entre ellos con escenas y redacciones distintas (no repitas el mismo hook).`)
  }
  if (d.formas.length) {
    L.push(`FORMA DE LA PRIMERA FRASE (reparte los 6 entre estas): ${d.formas.map((f) => `${HOOK_FORMS.find((x) => x.key === f)!.label.toUpperCase()} = ${HOOK_FORMS.find((x) => x.key === f)!.guide}`).join("; ")}.`)
  }
  if (d.sinSonido) {
    L.push('DEBE FUNCIONAR SIN SONIDO: la mayoría ve el video en silencio. El "overlay" lleva el hook COMPLETO como texto en pantalla (legible en 1–2 s) y el "visual" lo sostiene por sí solo; lo hablado repite o refuerza, nunca es lo único.')
  }
  // Los extremos pueden rozar la política de atributos personales de Meta.
  if (d.persona >= 4 || d.intensidad >= 4) {
    L.push('SEGURIDAD DE ANUNCIOS: usa encuadre CONDICIONAL ("Si eres…", "Para quien…", "Si te pasa que…"); nunca afirmes ni insinúes que sabes algo personal del espectador (salud, deudas o dinero, edad exacta, identidad, orientación, religión, etc.): Meta rechaza esos anuncios. No humilles ni culpes a la persona.')
  }
  return L.join("\n")
}
