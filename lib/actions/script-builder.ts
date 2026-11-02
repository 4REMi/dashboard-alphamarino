"use server"

import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { parseAiJson } from "@/lib/utils/ai-json"
import { MECHANICS, MECHANIC_KEYS, TRIGGERS, AWARENESS, type MechanicKey, type ScriptHook, type ScriptPart } from "@/lib/scripts/framework"

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
  const catalog = MECHANIC_KEYS.map((k) => `- ${k}: ${MECHANICS[k].label} — ${MECHANICS[k].desc}`).join("\n")
  const r = await ask<{ mechanics: { key: string; why: string }[] }>(
    `Eres estratega creativo de paid media. Eliges la MECÁNICA creativa (el patrón que conecta hook → cuerpo → cierre) que mejor transmite el ángulo de un concepto en video. Responde SOLO JSON.`,
    `${ctx.text}\n\nMECÁNICAS:\n${catalog}\n\nElige las 3 mejores para este concepto y etapa, de la más a la menos recomendable. "why": una frase concreta de por qué encaja con ESTE ángulo y persona.\n{"mechanics":[{"key":"","why":""}]}`, "suggestMechanics")
  return (r.mechanics ?? []).filter((m) => (MECHANIC_KEYS as string[]).includes(m.key)).slice(0, 3) as { key: MechanicKey; why: string }[]
}

export async function generateHooks(conceptId: string, brainId: string, mechanic: MechanicKey, opts: { like?: ScriptHook; avoid?: string[] } = {}): Promise<ScriptHook[]> {
  const ctx = await context(conceptId, brainId)
  const m = MECHANICS[mechanic]
  const r = await ask<{ hooks: ScriptHook[] }>(
    `Eres redactor experto en hooks de video para paid media. El hook solo tiene un trabajo: detener el scroll en 1–3 segundos con una respuesta psicológica o emocional. ${RULES}\nResponde SOLO JSON.`,
    `${ctx.text}

MECÁNICA ELEGIDA: ${m.label} — ${m.desc} (el hook es la entrada a esta mecánica).
ESTRATEGIA DE HOOK PARA ${ctx.stage.label.toUpperCase()}: ${ctx.stage.hook}
DISPARADORES: ${TRIGGERS.join(", ")}.
${opts.like ? `Haz variaciones cercanas a este hook que gustó (mismo espíritu, distinta redacción y disparador): "${opts.like.spoken}"` : ""}
${opts.avoid?.length ? `Evita estos hooks ya vistos: ${opts.avoid.map((h) => `"${h}"`).join(" | ")}` : ""}

Escribe 6 hooks, cada uno con un disparador DISTINTO (puedes combinar dos en uno, ej. "Identity call-out + Pain agitation"). En ${ctx.language}.
{"hooks":[{"trigger":"","spoken":"primeras palabras en cámara","visual":"qué pasa en el primer cuadro","overlay":"texto en pantalla (corto)","why":"una frase: por qué detiene a esta persona"}]}`, "generateHooks")
  return (r.hooks ?? []).slice(0, 6)
}

export async function generateBeat(conceptId: string, brainId: string, mechanic: MechanicKey, hook: ScriptHook, beatIndex: number, previous: ScriptPart[]): Promise<ScriptPart[]> {
  const ctx = await context(conceptId, brainId)
  const m = MECHANICS[mechanic]
  const beat = m.beats[beatIndex]
  const sofar = [`HOOK: "${hook.spoken}" (visual: ${hook.visual})`, ...previous.map((p, i) => `${m.beats[i]}: "${p.spoken}"`)].join("\n")
  const r = await ask<{ options: ScriptPart[] }>(
    `Eres guionista de anuncios de video de performance (UGC / VO, 20–45 s). ${RULES}\nResponde SOLO JSON.`,
    `${ctx.text}

MECÁNICA: ${m.label} — ${m.desc}
BEATS DEL CUERPO: ${m.beats.map((b, i) => `${i + 1}. ${b}`).join(" → ")}
GUION HASTA AHORA:
${sofar}

Escribe SOLO el beat ${beatIndex + 1} "${beat}". Debe continuar con naturalidad lo anterior y cumplir la función del beat dentro de la mecánica. 1–3 frases habladas NUEVAS: no repitas lo que ya se dijo; "spoken" contiene solo este beat. Da 2 opciones distintas. Todo (spoken, visual, overlay) en ${ctx.language}.
{"options":[{"spoken":"","visual":"qué se ve","overlay":"texto en pantalla opcional"}]}`, "generateBeat")
  return (r.options ?? []).slice(0, 2).map((o) => ({ ...o, spoken: stripRepeated(o.spoken, [hook.spoken, ...previous.map((p) => p.spoken)]) }))
}

export async function generateCloses(conceptId: string, brainId: string, mechanic: MechanicKey, hook: ScriptHook, body: ScriptPart[]): Promise<ScriptPart[]> {
  const ctx = await context(conceptId, brainId)
  const m = MECHANICS[mechanic]
  const r = await ask<{ options: ScriptPart[] }>(
    `Eres guionista de anuncios de video de performance. ${RULES}\nResponde SOLO JSON.`,
    `${ctx.text}

MECÁNICA: ${m.label}
GUION: HOOK "${hook.spoken}" → ${body.map((p, i) => `${m.beats[i]}: "${p.spoken}"`).join(" → ")}
ESTRATEGIA DE CIERRE PARA ${ctx.stage.label.toUpperCase()}: ${ctx.stage.close}
Escribe SOLO el cierre: 1–2 frases NUEVAS que vienen después del último beat. NO repitas ni resumas el hook ni el cuerpo; "spoken" contiene únicamente las frases del cierre. Usa los CTAs de la marca si encajan. Da 3 opciones distintas. Todo (spoken, visual, overlay) en ${ctx.language}.
{"options":[{"spoken":"","visual":"","overlay":"texto/CTA en pantalla"}]}`, "generateCloses")
  return (r.options ?? []).slice(0, 3).map((o) => ({ ...o, spoken: stripRepeated(o.spoken, [hook.spoken, ...body.map((p) => p.spoken)]) }))
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
