import { SupabaseClient } from "@supabase/supabase-js"
import { sendMessage } from "@/lib/telegram-bot/telegram"
import { findByName, findAllMatches } from "@/lib/telegram-bot/match"
import type { Movimiento } from "@/lib/telegram-bot/classify"

// Alta rápida de proyecto por voz — igual que "Captura rápida" en el
// dashboard, no intenta resolver el 100% por voz. Solo nombre + cliente/tipo
// opcionales; fases, equipo y Brand Brain se completan después desde el
// dashboard. El cliente/tipo mencionados se resuelven contra lo que ya
// existe (sin inventar registros nuevos) y son ambiguity-safe: si hay
// varias coincidencias, se pregunta en vez de adivinar.
export async function handleProyecto(
  supabase: SupabaseClient,
  chatId: number,
  movimiento: Movimiento,
  customers: { id: string; name: string }[],
  projectTypes: { id: string; name: string }[],
) {
  const nombre = movimiento.nombre_proyecto
  if (!nombre) {
    await sendMessage(chatId, "¿Cuál es el nombre del proyecto nuevo?")
    return
  }

  let customerId: string | null = null
  let customerName: string | null = null
  if (movimiento.cliente) {
    const matches = findAllMatches(customers, (c) => c.name, movimiento.cliente)
    if (matches.length === 0) {
      await sendMessage(chatId, `No encontré ningún cliente llamado "${movimiento.cliente}" — ¿me confirmas el nombre, o creo el proyecto sin cliente?`)
      return
    }
    if (matches.length > 1) {
      await sendMessage(
        chatId,
        `Hay varios clientes que podrían ser "${movimiento.cliente}" — sé más específico:\n${matches.slice(0, 8).map((m) => `• ${m.name}`).join("\n")}`
      )
      return
    }
    customerId = matches[0].id
    customerName = matches[0].name
  }

  // El tipo es opcional incluso si se menciona — no vale la pena bloquear
  // un alta rápida por un tipo mal dicho. Si no hay match, se avisa en la
  // confirmación pero el proyecto se crea de todos modos, sin tipo.
  let typeId: string | null = null
  let typeName: string | null = null
  let typeNotFound: string | null = null
  if (movimiento.tipo_proyecto) {
    const match = findByName(projectTypes, movimiento.tipo_proyecto)
    if (match) {
      typeId = match.id
      typeName = match.name
    } else {
      typeNotFound = movimiento.tipo_proyecto
    }
  }

  const { error } = await supabase.from("projects").insert({
    name: nombre,
    customer_id: customerId,
    project_type_id: typeId,
    status: "Active",
  })
  if (error) throw error

  const lines = [`✅ Proyecto creado: ${nombre}`]
  if (customerName) lines.push(`👥 ${customerName}`)
  if (typeName) lines.push(`🏷️ ${typeName}`)
  if (typeNotFound) lines.push(`⚠️ No encontré el tipo "${typeNotFound}" — se creó sin tipo, agrégalo desde el dashboard.`)
  lines.push("Fases, equipo y Brand Brain se agregan desde el dashboard.")
  await sendMessage(chatId, lines.join("\n"))
}
