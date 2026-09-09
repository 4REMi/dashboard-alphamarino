import { createAdminClient } from "@/lib/supabase/admin"
import { classifyMessage, type Movimiento } from "@/lib/telegram-bot/classify"
import { sendMessage } from "@/lib/telegram-bot/telegram"
import { handleFinanzas } from "@/lib/telegram-bot/handlers/finanzas"
import { handleDominio } from "@/lib/telegram-bot/handlers/dominios"
import { handleRecibo } from "@/lib/telegram-bot/handlers/recibos"
import { handleTarea, handleTareaCompletada } from "@/lib/telegram-bot/handlers/tareas"
import { handleNotaProyecto } from "@/lib/telegram-bot/handlers/notas"
import { handleCliente } from "@/lib/telegram-bot/handlers/clientes"
import { handleProyecto } from "@/lib/telegram-bot/handlers/proyectos"

export interface MessageContext {
  senderName?: string
  photoFileId?: string
}

export type MessageSource = "telegram" | "vowen"

async function logAutomation(
  supabase: ReturnType<typeof createAdminClient>,
  source: MessageSource,
  rawText: string,
  movements: Array<{ tipo: string; error?: string }>,
  errorMessage?: string,
) {
  const hasError = movements.some((m) => m.error) || !!errorMessage
  const allError = movements.length > 0 && movements.every((m) => m.error)
  const status = errorMessage || allError ? "error" : hasError ? "partial" : "ok"
  // Best-effort — never let logging break the actual bot flow, but don't
  // swallow the error silently either (Supabase resolves with {error}
  // rather than rejecting, so a plain .catch() would never see it).
  const { error } = await supabase.from("automation_logs").insert({
    source,
    raw_text: rawText,
    movements,
    status,
    error_message: errorMessage ?? null,
  })
  if (error) console.error("[automation_logs] insert failed:", error.message)
}

export async function handleMessage(
  chatId: number,
  text: string,
  context: MessageContext = {},
  source: MessageSource = "telegram",
) {
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
    await logAutomation(supabase, source, text, [{ tipo: "recibo" }])
    return
  }

  const [{ data: projects }, { data: customers }, { data: profiles }, { data: projectTypes }] = await Promise.all([
    supabase.from("projects").select("id, name").eq("status", "Active"),
    supabase.from("customers").select("id, name"),
    supabase.from("profiles").select("id, full_name"),
    supabase.from("project_types").select("id, name"),
  ])

  let movimientos: Movimiento[]
  try {
    movimientos = await classifyMessage(
      text,
      { projects: (projects ?? []).map((p) => p.name), customers: (customers ?? []).map((c) => c.name) },
      today,
    )
  } catch (err) {
    await logAutomation(supabase, source, text, [], err instanceof Error ? err.message : "Error al clasificar")
    throw err
  }

  // Multiple movements can come from a single message/note (e.g. a dictated
  // Vowen note listing several expenses) — each is dispatched and confirmed
  // independently, so one failing doesn't block the rest.
  const logged: Array<{ tipo: string; error?: string }> = []
  for (const movimiento of movimientos) {
    try {
      switch (movimiento.tipo) {
        case "otro":
          await sendMessage(chatId, movimiento.respuesta || "No entendí ese mensaje. Cuéntame el monto, si es ingreso, gasto o un dominio, y una breve descripción.")
          break
        case "ingreso":
        case "gasto_proyecto":
        case "gasto_general":
          await handleFinanzas(supabase, chatId, movimiento, projects ?? [], today, text)
          break
        case "dominio":
          await handleDominio(supabase, chatId, movimiento, customers ?? [], today)
          break
        case "tarea":
          await handleTarea(supabase, chatId, movimiento, projects ?? [], profiles ?? [])
          break
        case "tarea_completada":
          await handleTareaCompletada(supabase, chatId, movimiento, projects ?? [])
          break
        case "nota_proyecto":
          await handleNotaProyecto(supabase, chatId, movimiento, projects ?? [], text)
          break
        case "cliente":
          await handleCliente(supabase, chatId, movimiento)
          break
        case "proyecto":
          await handleProyecto(supabase, chatId, movimiento, customers ?? [], projectTypes ?? [])
          break
      }
      logged.push({ tipo: movimiento.tipo })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido"
      logged.push({ tipo: movimiento.tipo, error: message })
      await sendMessage(chatId, `⚠️ Error registrando ${movimiento.tipo}: ${message}`)
    }
  }

  await logAutomation(supabase, source, text, logged)
}
