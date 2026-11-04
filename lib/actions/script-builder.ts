"use server"

import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { parseAiJson } from "@/lib/utils/ai-json"
import { MECHANICS, MECHANIC_KEYS, TRIGGERS, AWARENESS, wordBudget, spokenBeats, mechanicBrief, type MechanicKey, type ScriptHook, type ScriptPart } from "@/lib/scripts/framework"

// Constructor de guiones paso a paso: cada función propone opciones para UN
// paso; nada escribe el guion completo de un jalón. Contexto = concepto
// (Dolor × Persona — Ángulo, awareness) + Brand Brain + línea de producto.

const MODEL = "claude-sonnet-4-6"

async function context(conceptId: string, brainId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (me?.role !== "admin" && me?.role !== "subadmin") throw new Error("Permission denied")
  const { data: c } = await supabase.from("creative_concepts")
    .select("name, angle_type, organizing_principle, target_persona, pain_point, objection, why_it_works, transformation, awareness_stage, funnel_stage, brand_line_id").eq("id", conceptId).single()
  if (!c) throw new Error("Concepto no encontrado")
  const { data: b } = await supabase.from("brand_brains")
    .select("name, industry, language, tone_of_voice, usps, key_benefits, pain_points, target_audience, ctas").eq("id", brainId).single()
  if (!b) throw new Error("Brand Brain no encontrado")
  const line = c.brand_line_id ? (await supabase.from("brand_lines").select("name, description, usps, pain_points").eq("id", c.brand_line_id).single()).data : null
  const stage = AWARENESS[c.awareness_stage ?? 2] ?? AWARENESS[2]
  const list = (v: unknown) => (Array.isArray(v) ? v.join("; ") : v ? String(v) : "—")
  const text = `CONCEPTO: ${c.name}
Persona: ${c.target_persona || "—"} · Dolor/deseo: ${c.pain_point || "—"} · Objeción: ${c.objection || "—"}
Transformación: ${c.transformation || "—"} · Por qué funciona: ${c.why_it_works || "—"} · Ángulo: ${c.angle_type || "—"}
Etapa de awareness: ${stage.label}
MARCA: ${b.name} (${b.industry ?? ""}) · Idioma: ${b.language ?? "español"} · Tono: ${b.tone_of_voice ?? "—"}
USPs: ${list(b.usps)} · Beneficios: ${list(b.key_benefits)} · Audiencia: ${b.target_audience ?? "—"} · CTAs de la marca: ${list(b.ctas)}
${line ? `LÍNEA DE PRODUCTO: ${line.name} — ${line.description ?? ""} · USPs: ${list(line.usps)} · Dolores: ${list(line.pain_points)}` : ""}`
  return { text, stage, brandName: b.name as string, language: (b.language as string) || "español" }
}

const budgetFor = (k: MechanicKey, secs: number) => wordBudget(secs, spokenBeats(k), MECHANICS[k].close === "natural")
const STAGE_NAMES: Record<number, string> = { 1: "Unaware", 2: "Problem-aware", 3: "Solution-aware", 4: "Product-aware", 5: "Most-aware" }

const RULES = `REGLAS (Hook Writing, runneth):
- Escribe en la voz del cliente, no de la marca; lenguaje real, nada corporativo ni clínico.
- Detalles y cifras concretas. Que parezca escrito para una sola persona.
- Nunca abras con el nombre de la marca/producto ni con "Descubre", "Conoce", "Te presentamos", "¿Buscas…?".
- Léelo en voz alta: si suena a anuncio, reescríbelo.
- Es VIDEO: cada parte tiene lo que se DICE (spoken), lo que se VE (visual) y, si aplica, TEXTO EN PANTALLA (overlay).`

async function ask<T>(system: string, user: string, ctxName: string): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurado")
  const msg = await new Anthropic({ apiKey }).messages.create({ model: MODEL, max_tokens: 3000, system, messages: [{ role: "user", content: user }] })
  return parseAiJson<T>(msg as never, ctxName)
}

export async function suggestMechanics(conceptId: string, brainId: string): Promise<{ key: MechanicKey; why: string }[]> {
  const ctx = await context(conceptId, brainId)
  const catalog = MECHANIC_KEYS.map((k) => `- ${k}: ${MECHANICS[k].label} — ${MECHANICS[k].desc} Por qué funciona: ${MECHANICS[k].why} Mejor en: ${MECHANICS[k].stages.map((n) => STAGE_NAMES[n]).join(", ")}.`).join("\n")
  const r = await ask<{ mechanics: { key: string; why: string }[] }>(
    `Eres estratega creativo de paid media. Eliges la MECÁNICA creativa (el patrón que conecta hook → cuerpo → cierre) que mejor transmite el ángulo de un concepto en video. Responde SOLO JSON.`,
    `${ctx.text}\n\nMECÁNICAS:\n${catalog}\n\nElige las 3 mejores para este concepto, de la más a la menos recomendable. Prioriza las que funcionan en la etapa de awareness del concepto; usa una fuera de etapa solo si el ángulo lo pide claramente y dilo en el why. "why": una frase concreta de por qué encaja con ESTE ángulo y persona.\n{"mechanics":[{"key":"","why":""}]}`, "suggestMechanics")
  return (r.mechanics ?? []).filter((m) => (MECHANIC_KEYS as string[]).includes(m.key)).slice(0, 3) as { key: MechanicKey; why: string }[]
}

export async function generateHooks(conceptId: string, brainId: string, mechanic: MechanicKey, opts: { like?: ScriptHook; avoid?: string[]; targetSeconds?: number } = {}): Promise<ScriptHook[]> {
  const ctx = await context(conceptId, brainId)
  const m = MECHANICS[mechanic]
  const budget = budgetFor(mechanic, opts.targetSeconds ?? 30)
  const r = await ask<{ hooks: ScriptHook[] }>(
    `Eres redactor experto en hooks de video para paid media. El hook solo tiene un trabajo: detener el scroll en 1–3 segundos con una respuesta psicológica o emocional. ${RULES}\nResponde SOLO JSON.`,
    `${ctx.text}

${mechanicBrief(mechanic)}
EL HOOK ABRE ESTA MECÁNICA: los 6 deben tener la forma "${m.hookShape}" — lo que varía entre ellos es el disparador psicológico, no la forma.
${m.beats.every((b) => b.mode === "visual") ? 'Esta mecánica NO lleva voz: en cada hook "spoken" va VACÍO (""); el hook vive en "visual" y en un "overlay" corto que no juzgue.' : ""}
ESTRATEGIA DE HOOK PARA ${ctx.stage.label.toUpperCase()}: ${ctx.stage.hook}
DISPARADORES: ${TRIGGERS.join(", ")}.
${opts.like ? `Haz variaciones cercanas a este hook que gustó (mismo espíritu, distinta redacción y disparador): "${opts.like.spoken}"` : ""}
${opts.avoid?.length ? `Evita estos hooks ya vistos: ${opts.avoid.map((h) => `"${h}"`).join(" | ")}` : ""}

DURACIÓN DEL VIDEO: ${opts.targetSeconds ?? 30} s en total. Cada hook (lo que se dice) debe tener como MÁXIMO ${budget.hook} palabras.
Escribe 6 hooks, cada uno con un disparador DISTINTO (puedes combinar dos en uno, ej. "Identity call-out + Pain agitation"). En ${ctx.language}.
{"hooks":[{"trigger":"","spoken":"primeras palabras en cámara","visual":"qué pasa en el primer cuadro","overlay":"texto en pantalla (corto)","why":"una frase: por qué detiene a esta persona"}]}`, "generateHooks")
  return (r.hooks ?? []).slice(0, 6)
}

export async function generateBeat(conceptId: string, brainId: string, mechanic: MechanicKey, hook: ScriptHook, beatIndex: number, previous: ScriptPart[], targetSeconds = 30): Promise<ScriptPart[]> {
  const ctx = await context(conceptId, brainId)
  const m = MECHANICS[mechanic]
  const beat = m.beats[beatIndex]
  const budget = budgetFor(mechanic, targetSeconds)
  const sofar = [`HOOK: "${hook.spoken}" (visual: ${hook.visual})`, ...previous.map((p, i) => `${m.beats[i].name}: ${p.spoken ? `"${p.spoken}"` : "(sin voz)"} — visual: ${p.visual}`)].join("\n")
  const modeRule = beat.mode === "visual"
    ? `Este beat es SOLO VISUAL: "spoken" debe ir VACÍO (""), sin voz en off. Describe la toma en "visual" con detalle filmable y, si ayuda, un texto en pantalla MUY corto en "overlay" que NO juzgue ni explique.`
    : beat.mode === "chat"
      ? `Este beat son MENSAJES de un chat/DM: en "spoken" escribe los mensajes, uno por línea, con el formato "Nombre: mensaje" (lenguaje de amigos, informal, sin claims de marketing; máximo ${budget.beat} palabras). En "visual" describe la pantalla (app, hilo, capturas).`
      : `Beat hablado: máximo ${budget.beat} palabras habladas.`
  const r = await ask<{ options: ScriptPart[] }>(
    `Eres guionista de anuncios de video de performance (UGC / VO). ${RULES}\nResponde SOLO JSON.`,
    `${ctx.text}

${mechanicBrief(mechanic)}
GUION HASTA AHORA:
${sofar}

Escribe SOLO el beat ${beatIndex + 1} "${beat.name}": ${beat.guide}
Debe continuar con naturalidad lo anterior. Video de ${targetSeconds} s en total. ${modeRule}
No repitas lo que ya se dijo. Respeta las reglas de la mecánica. Da 2 opciones distintas. Todo (spoken, visual, overlay) en ${ctx.language}.
{"options":[{"spoken":"","visual":"qué se ve","overlay":"texto en pantalla opcional"}]}`, "generateBeat")
  return (r.options ?? []).slice(0, 2).map((o) => ({
    ...o,
    spoken: beat.mode === "visual" ? "" : stripRepeated(o.spoken ?? "", [hook.spoken, ...previous.map((p) => p.spoken)]),
  }))
}

export async function generateCloses(conceptId: string, brainId: string, mechanic: MechanicKey, hook: ScriptHook, body: ScriptPart[], targetSeconds = 30): Promise<ScriptPart[]> {
  const ctx = await context(conceptId, brainId)
  const m = MECHANICS[mechanic]
  const budget = budgetFor(mechanic, targetSeconds)
  const natural = m.close === "natural"
  const silent = m.beats.every((b) => b.mode === "visual")
  const r = await ask<{ options: ScriptPart[] }>(
    `Eres guionista de anuncios de video de performance. ${RULES}\nResponde SOLO JSON.`,
    `${ctx.text}

${mechanicBrief(mechanic)}
GUION: HOOK "${hook.spoken}" → ${body.map((p, i) => `${m.beats[i].name}: ${p.spoken ? `"${p.spoken}"` : `(sin voz) ${p.visual}`}`).join(" → ")}
${natural
  ? `CIERRE NATURAL (lo pide la mecánica): ${m.closeGuide} NO hay CTA hablado ni frase de venta.${silent ? ' "spoken" debe ir VACÍO (""): esta mecánica no lleva voz.' : ` Si hay voz, máximo ${budget.close} palabras y que suene natural, no a anuncio.`} Si hace falta, el CTA va solo como texto corto en "overlay".`
  : `ESTRATEGIA DE CIERRE PARA ${ctx.stage.label.toUpperCase()}: ${ctx.stage.close}`}
Video de ${targetSeconds} s en total${natural ? "" : `: el cierre debe tener como MÁXIMO ${budget.close} palabras habladas`}. Escribe SOLO el cierre: frases NUEVAS que vienen después del último beat. NO repitas ni resumas el hook ni el cuerpo; "spoken" contiene únicamente las frases del cierre. ${natural ? "" : "Usa los CTAs de la marca si encajan."} Da 3 opciones distintas. Todo (spoken, visual, overlay) en ${ctx.language}.
{"options":[{"spoken":"","visual":"","overlay":"texto/CTA en pantalla"}]}`, "generateCloses")
  return (r.options ?? []).slice(0, 3).map((o) => ({ ...o, spoken: silent ? "" : stripRepeated(o.spoken ?? "", [hook.spoken, ...body.map((p) => p.spoken)]) }))
}

// Red de seguridad: si el modelo antepone lo que ya se dijo (hook/beats
// anteriores) a la parte nueva, se quita. Compara sin mayúsculas, acentos ni
// puntuación.
function stripRepeated(text: string, prior: string[]): string {
  const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()
  const sentences = text.match(/[^.!?…]+[.!?…]*\s*/g) ?? [text]
  const priorNorm = prior.map(norm).filter(Boolean)
  const kept = sentences.filter((sen) => {
    const n = norm(sen)
    return !n || !priorNorm.some((p) => p.includes(n) && n.length > 6)
  })
  const out = kept.join("").trim()
  return out || text.trim()
}
