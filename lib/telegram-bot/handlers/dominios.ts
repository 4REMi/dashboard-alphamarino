import { SupabaseClient } from "@supabase/supabase-js"
import { getExchangeRate } from "@/lib/actions/finances"
import { sendMessage } from "@/lib/telegram-bot/telegram"
import { findByName } from "@/lib/telegram-bot/match"
import type { Movimiento } from "@/lib/telegram-bot/classify"

export async function handleDominio(
  supabase: SupabaseClient,
  chatId: number,
  movimiento: Movimiento,
  customers: { id: string; name: string }[],
  today: string,
) {
  if (!movimiento.dominio) {
    await sendMessage(chatId, "¿Cuál es el nombre del dominio? (ej. ejemplo.com)")
    return
  }

  const moneda = movimiento.moneda ?? "MXN"
  let renewalCostUsd: number | null = null
  if (movimiento.monto && movimiento.monto > 0) {
    renewalCostUsd = movimiento.monto
    if (moneda === "MXN") {
      const rate = await getExchangeRate(movimiento.fecha || today)
      if (!rate) {
        await sendMessage(chatId, "No pude obtener el tipo de cambio, intenta de nuevo en un momento.")
        return
      }
      renewalCostUsd = movimiento.monto / rate
    }
  }

  const customer = findByName(customers, movimiento.cliente)

  const { error } = await supabase.from("domains").insert({
    domain: movimiento.dominio,
    customer_id: customer?.id ?? null,
    registrar: movimiento.registrador ?? null,
    renewal_date: movimiento.fecha ?? null,
    renewal_cost: renewalCostUsd,
    notes: movimiento.descripcion ?? null,
  })
  if (error) throw error

  const detalles = [
    customer ? `Cliente: ${customer.name}` : null,
    movimiento.registrador ? `Registrador: ${movimiento.registrador}` : null,
    movimiento.fecha ? `Vence: ${movimiento.fecha}` : null,
    movimiento.monto ? `Costo: ${moneda === "MXN" ? `MXN ${movimiento.monto.toLocaleString("es-MX")}` : `USD ${movimiento.monto.toLocaleString("en-US")}`}` : null,
  ].filter(Boolean).join("\n")

  await sendMessage(chatId, `✅ Dominio registrado: ${movimiento.dominio}${detalles ? `\n${detalles}` : ""}`)
}
