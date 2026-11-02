// Constructor de guiones de video paso a paso — conocimiento del framework
// (runneth.com: Creative Strategy Engine, Hook Writing, Creative Mechanics).
// Orden: Ángulo → Mecánica → Hook → Cuerpo (beats de la mecánica) → Cierre.

export type MechanicKey = "reframe" | "implied_answer" | "social_witness" | "overheard" | "borrowed_enemy" | "trojan_horse" | "contrast" | "this_and_a"

export const MECHANICS: Record<MechanicKey, { label: string; desc: string; beats: string[] }> = {
  reframe: { label: "The Reframe", desc: "Valida una creencia que el espectador ya tiene y luego la redefine.", beats: ["Validar la creencia", "El nuevo encuadre", "La prueba"] },
  implied_answer: { label: "The Implied Answer", desc: "El hook plantea una pregunta (juicio leve, confusión, curiosidad) y los visuales la responden sin decirla.", beats: ["La situación", "La respuesta en imágenes"] },
  social_witness: { label: "The Social Witness", desc: "Alguien distinto al cliente nota el cambio: un cumplido, una mirada, una pregunta no solicitada.", beats: ["La reacción del tercero", "El cambio que notaron", "Qué lo causó"] },
  overheard: { label: "The Overheard Conversation", desc: "Se presenta como algo que no debías ver: un chat, un DM, una conversación ajena.", beats: ["La conversación ajena", "Dónde aparece el producto"] },
  borrowed_enemy: { label: "The Borrowed Enemy", desc: "Atribuye el problema a un enemigo claro (alternativa, hábito, competencia) y el producto es la salida.", beats: ["El problema", "El culpable", "La alternativa"] },
  trojan_horse: { label: "The Trojan Horse", desc: "Parece contenido de valor, entretenimiento o historia personal hasta el último 20 %, donde aparece el producto.", beats: ["El contenido de valor", "El desarrollo", "El giro: aparece el producto"] },
  contrast: { label: "The Contrast Without Comment", desc: "Dos realidades en paralelo (antes/después, con/sin) sin narrar la diferencia.", beats: ["Realidad A (sin / antes)", "Realidad B (con / después)"] },
  this_and_a: { label: "This and a…", desc: "Pone el producto junto a algo aspiracional, inesperado o emocional.", beats: ["La combinación inesperada", "La asociación desarrollada"] },
}
export const MECHANIC_KEYS = Object.keys(MECHANICS) as MechanicKey[]

export const TRIGGERS = [
  "Pattern interrupt", "Identity call-out", "Pain agitation", "Curiosity gap",
  "Prueba social", "Contrarian / mito", "Aspiración", "Urgencia / riesgo",
] as const

export const AWARENESS: Record<number, { label: string; hook: string; close: string }> = {
  1: { label: "Unaware", hook: "No menciones el producto ni la solución. Describe el dolor o deseo como si leyeras su mente.", close: "Cierre suave: invita a conocer más, sin presión de compra." },
  2: { label: "Problem-aware", hook: "Agita el dolor sin suavizarlo; que sienta que lo entiendes por completo.", close: "Presenta la solución como alivio y un CTA claro de bajo compromiso." },
  3: { label: "Solution-aware", hook: "Diferénciate de lo que ya probó; posiciónate contra las alternativas.", close: "Por qué esta solución y no otra + CTA." },
  4: { label: "Product-aware", hook: "Elimina objeciones con prueba social y FOMO.", close: "Quita la última objeción (garantía, prueba, testimonio) + CTA." },
  5: { label: "Most-aware", hook: "Directo: oferta, urgencia, garantía, CTA.", close: "Oferta concreta, urgencia real y CTA directo." },
}

export interface ScriptHook { key?: string; trigger: string; spoken: string; visual: string; overlay: string; why?: string }
export interface ScriptPart { spoken: string; visual: string; overlay?: string }

// ~2.5 palabras por segundo hablando a ritmo de anuncio.
export const estimateSeconds = (text: string) => Math.round(text.trim().split(/\s+/).filter(Boolean).length / 2.5)

// Revisión con las reglas de Hook Writing. Ayuda, no bloquea.
export function lintScript(input: { hooks: ScriptHook[]; body: ScriptPart[]; close: ScriptPart | null; brandName?: string | null }): { level: "warn" | "info"; text: string; fix: string }[] {
  const out: { level: "warn" | "info"; text: string; fix: string }[] = []
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  const adWords = /^(descubre|conoce|te presentamos|presentamos|introducing|discover|¿?buscas|¿?estas buscando|¿?quieres)/
  for (const [i, h] of input.hooks.entries()) {
    const s = norm(h.spoken.trim())
    if (adWords.test(s)) out.push({ level: "warn", text: `Hook ${i + 1} suena a anuncio ("${h.spoken.split(" ").slice(0, 3).join(" ")}…").`, fix: "Empieza por el dolor o deseo, en la voz del cliente." })
    if (input.brandName && s.startsWith(norm(input.brandName))) out.push({ level: "warn", text: `Hook ${i + 1} abre con la marca.`, fix: "La marca nunca va primero: abre con la persona o el problema." })
    if (!/\d/.test(h.spoken) && h.trigger.toLowerCase().includes("prueba")) out.push({ level: "info", text: `Hook ${i + 1} es de prueba social pero no trae un dato concreto.`, fix: "Agrega una cifra o resultado específico." })
  }
  const triggers = input.hooks.map((h) => h.trigger)
  const dup = triggers.find((t, i) => triggers.indexOf(t) !== i)
  if (dup) out.push({ level: "info", text: `Dos hooks usan el mismo disparador (${dup}).`, fix: "Para testear, varía el disparador manteniendo el ángulo." })
  const all = [...input.body.map((b) => b.spoken), input.close?.spoken ?? ""].join(" ")
  if (all && !/\d/.test(all)) out.push({ level: "info", text: "El guion no tiene ningún dato concreto (cifra, tiempo, precio, resultado).", fix: "Los detalles específicos hacen creíble el mensaje." })
  if (input.close && !input.close.spoken.trim()) out.push({ level: "warn", text: "Falta el cierre.", fix: "Elige o escribe un cierre con CTA." })
  return out
}
