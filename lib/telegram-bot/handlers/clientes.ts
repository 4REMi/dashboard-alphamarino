import { SupabaseClient } from "@supabase/supabase-js"
import { sendMessage } from "@/lib/telegram-bot/telegram"
import type { Movimiento } from "@/lib/telegram-bot/classify"

export async function handleCliente(
  supabase: SupabaseClient,
  chatId: number,
  movimiento: Movimiento,
) {
  const nombre = movimiento.cliente
  if (!nombre) {
    await sendMessage(chatId, "¿Cuál es el nombre del cliente?")
    return
  }

  const { error } = await supabase.from("customers").insert({
    name: nombre,
    status: "Prospect",
    company: movimiento.empresa ?? null,
    email: movimiento.email ?? null,
    phone: movimiento.telefono ?? null,
  })
  if (error) throw error

  await sendMessage(chatId, `✅ Cliente agregado: ${nombre}${movimiento.empresa ? ` · ${movimiento.empresa}` : ""}`)
}
