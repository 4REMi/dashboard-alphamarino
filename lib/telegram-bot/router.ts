import { createAdminClient } from "@/lib/supabase/admin"
import { classifyMessage } from "@/lib/telegram-bot/classify"
import { sendMessage } from "@/lib/telegram-bot/telegram"
import { handleFinanzas } from "@/lib/telegram-bot/handlers/finanzas"
import { handleDominio } from "@/lib/telegram-bot/handlers/dominios"
import { handleRecibo } from "@/lib/telegram-bot/handlers/recibos"

export interface MessageContext {
  senderName?: string
  photoFileId?: string
}

export async function handleMessage(chatId: number, text: string, context: MessageContext = {}) {
  const supabase = createAdminClient()
  const today = new Date().toISOString().split("T")[0]

  // "recibo" dispara el flujo de recibo de pago, aparte del clasificador de finanzas/dominios.
  const esRecibo = /^\s*\/?recibo\b/i.test(text)
  if (esRecibo || context.photoFileId) {
    if (!esRecibo) {
      await sendMessage(chatId, 'Si es un recibo, agrega la palabra "recibo" en el texto o pie de foto.')
      return
    }
    const { data: customers } = await supabase.from("customers").select("id, name, email")
    await handleRecibo(chatId, text, context, customers ?? [])
    return
  }

  const [{ data: projects }, { data: customers }] = await Promise.all([
    supabase.from("projects").select("id, name").eq("status", "Active"),
    supabase.from("customers").select("id, name"),
  ])

  const movimiento = await classifyMessage(
    text,
    { projects: (projects ?? []).map((p) => p.name), customers: (customers ?? []).map((c) => c.name) },
    today,
  )

  switch (movimiento.tipo) {
    case "otro":
      await sendMessage(chatId, movimiento.respuesta || "No entendí ese mensaje. Cuéntame el monto, si es ingreso, gasto o un dominio, y una breve descripción.")
      return
    case "ingreso":
    case "gasto_proyecto":
    case "gasto_general":
      await handleFinanzas(supabase, chatId, movimiento, projects ?? [], today, text)
      return
    case "dominio":
      await handleDominio(supabase, chatId, movimiento, customers ?? [], today)
      return
  }
}
