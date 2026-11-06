import type { SupabaseClient } from "@supabase/supabase-js"
import type { BrandLine } from "@/lib/types"

// Núcleo de brand lines, SIN "use server": recibe el cliente de Supabase de
// quien llama. La UI pasa su cliente con sesión (RLS); el MCP
// (lib/mcp/brand-brain-tools.ts) pasa el admin después de verificar el
// permiso access_brand_brains.

export interface NewBrandLineFields {
  name: string
  description?: string | null
  usps?: string[]
  pain_points?: string[]
  keywords?: string[]
  color?: string
}

export interface BrandLineAutofill {
  description: string
  usps: string[]
  pain_points: string[]
  keywords: string[]
}

export async function insertBrandLine(supabase: SupabaseClient, brainId: string, fields: NewBrandLineFields): Promise<BrandLine> {
  const { data: maxPos } = await supabase
    .from("brand_lines")
    .select("position")
    .eq("brand_brain_id", brainId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabase.from("brand_lines").insert({
    brand_brain_id: brainId,
    name: fields.name,
    description: fields.description || null,
    usps: fields.usps ?? [],
    pain_points: fields.pain_points ?? [],
    keywords: fields.keywords ?? [],
    color: fields.color ?? "#6366f1",
    position: (maxPos?.position ?? -1) + 1,
  }).select("*").single()
  if (error) throw error
  return data as BrandLine
}

// Claude genera descripción, USPs, dolores y keywords de una línea a partir
// de su nombre, una descripción opcional del usuario y el contexto de la marca.
export async function autofillBrandLineCore(
  supabase: SupabaseClient,
  lineName: string,
  brainId: string,
  userDescription?: string,
): Promise<BrandLineAutofill> {

  const { data: brain } = await supabase
    .from("brand_brains")
    .select("name, industry, language, tone_of_voice, usps, key_benefits, pain_points, target_audience, description")
    .eq("id", brainId)
    .single()

  if (!brain) throw new Error("Brand Brain no encontrado")

  const systemPrompt = `Eres un estratega de marca y producto. A partir del nombre de un producto/servicio, una descripción opcional del usuario, y el contexto de la marca, genera la ficha de la línea de producto.

Devuelve ÚNICAMENTE un objeto JSON válido con estos campos:
- description: string — descripción concisa del producto/servicio (1-2 oraciones)
- usps: string[] — 3-5 diferenciadores únicos de esta línea (frases cortas)
- pain_points: string[] — 3-5 dolores del cliente que esta línea resuelve (frases cortas)
- keywords: string[] — 5-8 palabras clave relevantes para esta línea (palabras sueltas o frases de 2-3 palabras)

Si el usuario proporcionó una descripción, trátala como la fuente de verdad sobre qué es este producto/servicio (especialmente si el nombre es un nombre propio o de marca que el contexto general no explica) y redacta una versión pulida y más específica — no te limites a repetirla.

Todo en ${brain.language ?? "español"}. Sin markdown, sin texto extra. Solo el JSON.`

  const context = `MARCA: ${brain.name}
- Industria: ${brain.industry ?? "—"}
- Tono: ${brain.tone_of_voice ?? "—"}
- USPs de marca: ${(brain.usps ?? []).join(", ") || "—"}
- Dolores generales: ${(brain.pain_points ?? []).join(", ") || "—"}
- Audiencia: ${brain.target_audience ?? "—"}
- Descripción de marca: ${brain.description ?? "—"}

LÍNEA DE PRODUCTO/SERVICIO A RELLENAR: "${lineName}"
${userDescription?.trim() ? `DESCRIPCIÓN PROPORCIONADA POR EL USUARIO (fuente de verdad, úsala como base): "${userDescription.trim()}"` : ""}

Genera la ficha de esta línea basándote en el contexto de la marca${userDescription?.trim() ? " y la descripción proporcionada" : ""}.`

  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: context }],
    system: systemPrompt,
  })

  const text = message.content[0].type === "text" ? message.content[0].text : ""

  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    throw new Error("AI returned invalid JSON")
  }
}
