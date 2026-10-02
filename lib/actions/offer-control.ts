"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { parseAiJson } from "@/lib/utils/ai-json"
import type { DeliverableCadence, ServiceDeliverable } from "@/lib/types"

// Revisión de control de las ofertas: la IA propone, por línea de
// entregable, un texto de control corto y verificable + cadencia + cantidad.
// Nada se guarda sin aprobación (applyControlReview). El texto de venta no
// se toca. Líneas con el mismo texto de venta en otras ofertas reutilizan
// el control ya aprobado (las 6 de Paid Media comparten la mayoría).

export interface ControlSuggestion {
  lineId: string
  text: string                      // texto de venta (no cambia)
  current: { control_text: string | null; cadence: DeliverableCadence; quantity: number | null }
  suggested: { control_text: string; cadence: DeliverableCadence; quantity: number | null }
  note: string | null               // ej. "No es un entregable: servicio continuo"
  source: "existing" | "reused" | "ai"
}

const CADENCES: DeliverableCadence[] = ["once", "monthly", "quarterly", "biannual", "continuous"]
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ")

async function requireEditor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (data?.role !== "admin" && data?.role !== "subadmin") throw new Error("Sin permiso")
  return supabase
}

export async function getControlCoverage(): Promise<{ id: string; name: string; category: string; status: string; total: number; withControl: number }[]> {
  const supabase = await requireEditor()
  const { data } = await supabase.from("service_offers").select("id, name, category, status, deliverables").order("category").order("name")
  return (data ?? []).map((o) => {
    const d = (o.deliverables ?? []) as ServiceDeliverable[]
    return { id: o.id, name: o.name, category: o.category, status: o.status, total: d.length, withControl: d.filter((x) => x.control_text?.trim()).length }
  })
}

export async function suggestControlForOffer(offerId: string, opts: { onlyMissing?: boolean } = {}): Promise<{ offerName: string; suggestions: ControlSuggestion[] }> {
  const supabase = await requireEditor()
  const [{ data: offer }, { data: all }] = await Promise.all([
    supabase.from("service_offers").select("id, name, category, description, deliverables").eq("id", offerId).single(),
    supabase.from("service_offers").select("id, deliverables"),
  ])
  if (!offer) throw new Error("Oferta no encontrada")
  let lines = (offer.deliverables ?? []) as ServiceDeliverable[]
  // Líneas guardadas antes de que existiera el id: se les asigna uno y se
  // guarda, para poder aplicar la revisión por línea.
  if (lines.some((d) => !d.id)) {
    lines = lines.map((d) => (d.id ? d : { ...d, id: crypto.randomUUID() }))
    await supabase.from("service_offers").update({ deliverables: lines }).eq("id", offerId)
  }

  // Control ya aprobado en otra oferta para el mismo texto de venta.
  const known = new Map<string, ServiceDeliverable>()
  for (const o of all ?? []) for (const d of (o.deliverables ?? []) as ServiceDeliverable[]) {
    if (d.control_text?.trim() && !known.has(norm(d.text))) known.set(norm(d.text), d)
  }
  // Buenos ejemplos (control ya escrito) para el prompt.
  const examples = [...known.values()].slice(0, 12).map((d) => `"${d.text.slice(0, 120)}" → "${d.control_text}"`).join("\n")

  const out: ControlSuggestion[] = []
  const toAsk: ServiceDeliverable[] = []
  for (const d of lines) {
    const current = { control_text: d.control_text ?? null, cadence: d.cadence, quantity: d.quantity }
    if (d.control_text?.trim() && opts.onlyMissing) {
      out.push({ lineId: d.id, text: d.text, current, suggested: { control_text: d.control_text, cadence: d.cadence, quantity: d.quantity }, note: null, source: "existing" })
      continue
    }
    const k = known.get(norm(d.text))
    if (k && !d.control_text?.trim()) {
      out.push({ lineId: d.id, text: d.text, current, suggested: { control_text: k.control_text!, cadence: k.cadence, quantity: k.quantity }, note: "Mismo texto que en otra oferta ya revisada", source: "reused" })
      continue
    }
    toAsk.push(d)
  }

  if (toAsk.length) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurado")
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: `Eres el responsable de operaciones de una agencia. Para cada entregable de una oferta de servicio escribe un TEXTO DE CONTROL: lo que el equipo palomea en el proyecto para verificar que se entregó.

Reglas del texto de control:
- 2 a 6 palabras, sustantivo concreto y verificable (algo que se entrega o se puede comprobar). Ej: "Auditoría inicial PDF", "6 piezas visuales", "Reporte quincenal PDF", "Pixel + API de conversiones".
- Sin justificaciones ni beneficios ("para que…"), sin adjetivos de venta.
- Si la línea trae una cantidad, inclúyela en el texto y en quantity.

Cadencia (cadence):
- "once": se entrega una vez (setup, auditoría inicial, onboarding, documento de cierre).
- "monthly": se repite cada periodo del proyecto (piezas por ciclo, copies, reportes, videollamada mensual). En servicios recurrentes (paid media, retainers) los entregables que se repiten son "monthly".
- "quarterly"/"biannual": cada 3/6 periodos.
- "continuous": servicio continuo que NO se entrega en unidades (gestión de campaña, optimización continua, monitoreo, soporte). quantity = null.
quantity: unidades por periodo (número) o null si es un solo entregable sin cantidad.
note: solo si algo es raro (ej. "No es un entregable: es un acceso/configuración" o "Parece servicio continuo"), si no null.

Responde ÚNICAMENTE JSON: {"items": [{"id": "", "control_text": "", "cadence": "", "quantity": null, "note": null}]}`,
      messages: [{ role: "user", content: `OFERTA: ${offer.name} (categoría: ${offer.category})${offer.description ? `\nDescripción: ${offer.description}` : ""}
${examples ? `\nEJEMPLOS YA APROBADOS (texto de venta → control):\n${examples}\n` : ""}
ENTREGABLES:
${toAsk.map((d) => JSON.stringify({ id: d.id, texto: d.text, cadencia_actual: d.cadence, cantidad_actual: d.quantity })).join("\n")}` }],
    })
    const parsed = parseAiJson<{ items: { id: string; control_text: string; cadence: string; quantity: number | null; note: string | null }[] }>(msg, "suggestControlForOffer")
    const byId = new Map(parsed.items.map((i) => [i.id, i]))
    for (const d of toAsk) {
      const s = byId.get(d.id)
      const cadence = CADENCES.includes(s?.cadence as DeliverableCadence) ? (s!.cadence as DeliverableCadence) : d.cadence
      out.push({
        lineId: d.id, text: d.text,
        current: { control_text: d.control_text ?? null, cadence: d.cadence, quantity: d.quantity },
        suggested: { control_text: s?.control_text?.trim() || d.control_text || "", cadence, quantity: cadence === "continuous" ? null : (s?.quantity ?? d.quantity) },
        note: s?.note ?? null, source: "ai",
      })
    }
  }
  // Mismo orden que la oferta.
  const order = new Map(lines.map((d, i) => [d.id, i]))
  out.sort((a, b) => (order.get(a.lineId)! - order.get(b.lineId)!))
  return { offerName: offer.name, suggestions: out }
}

// Aplica lo aprobado: solo control_text, cadencia y cantidad de cada línea.
export async function applyControlReview(offerId: string, updates: { lineId: string; control_text: string; cadence: DeliverableCadence; quantity: number | null }[]): Promise<void> {
  const supabase = await requireEditor()
  const { data: offer } = await supabase.from("service_offers").select("deliverables").eq("id", offerId).single()
  if (!offer) throw new Error("Oferta no encontrada")
  const byId = new Map(updates.map((u) => [u.lineId, u]))
  const next = ((offer.deliverables ?? []) as ServiceDeliverable[]).map((d) => {
    const u = byId.get(d.id)
    if (!u) return d
    return { ...d, control_text: u.control_text.trim() || null, cadence: CADENCES.includes(u.cadence) ? u.cadence : d.cadence, quantity: u.cadence === "continuous" ? null : u.quantity }
  })
  const { error } = await supabase.from("service_offers").update({ deliverables: next }).eq("id", offerId)
  if (error) throw new Error(error.message)
  revalidatePath("/services")
}
