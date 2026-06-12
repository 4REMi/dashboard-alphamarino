import { createAdminClient } from "@/lib/supabase/admin"
import { classifyMessage } from "@/lib/telegram-bot/classify"
import { sendMessage } from "@/lib/telegram-bot/telegram"
import { handleFinanzas } from "@/lib/telegram-bot/handlers/finanzas"
import { handleDominio } from "@/lib/telegram-bot/handlers/dominios"

export async function handleMessage(chatId: number, text: string) {
  const supabase = createAdminClient()
  const today = new Date().toISOString().split("T")[0]

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
