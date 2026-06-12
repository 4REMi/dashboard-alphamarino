import { SupabaseClient } from "@supabase/supabase-js"
import { getExchangeRate } from "@/lib/actions/finances"
import { sendMessage } from "@/lib/telegram-bot/telegram"
import { findByName } from "@/lib/telegram-bot/match"
import type { Movimiento } from "@/lib/telegram-bot/classify"

const CATEGORY_LABELS: Record<string, string> = {
  Payroll: "Nómina",
  Software: "Software",
  Rent: "Renta",
  Services: "Servicios",
  Other: "Otros",
}

function formatMonto(monto: number, moneda: "USD" | "MXN") {
  return moneda === "MXN" ? `MXN ${monto.toLocaleString("es-MX")}` : `USD ${monto.toLocaleString("en-US")}`
}

export async function handleFinanzas(
  supabase: SupabaseClient,
  chatId: number,
  movimiento: Movimiento,
  projects: { id: string; name: string }[],
  today: string,
  rawText: string,
) {
  if (!movimiento.monto || movimiento.monto <= 0) {
    await sendMessage(chatId, "No detecté un monto válido. ¿Puedes repetirlo incluyendo la cantidad?")
    return
  }

  const moneda = movimiento.moneda ?? "MXN"
  const fecha = movimiento.fecha || today
  const descripcion = movimiento.descripcion || rawText

  // Convertir a USD si el monto viene en MXN (todas las tablas guardan montos en USD,
  // excepto income que también conserva el original).
  let amountUsd = movimiento.monto
  let exchangeRate: number | null = null
  if (moneda === "MXN") {
    exchangeRate = await getExchangeRate(fecha)
    if (!exchangeRate) {
      await sendMessage(chatId, "No pude obtener el tipo de cambio para esa fecha, intenta de nuevo en un momento.")
      return
    }
    amountUsd = movimiento.monto / exchangeRate
  }

  if (movimiento.tipo === "ingreso") {
    const project = findByName(projects, movimiento.proyecto)
    const { error } = await supabase.from("income").insert({
      project_id: project?.id ?? null,
      amount: amountUsd,
      currency: moneda,
      original_amount: movimiento.monto,
      exchange_rate: exchangeRate ?? 1,
      date: fecha,
      description: descripcion,
    })
    if (error) throw error

    await sendMessage(
      chatId,
      `✅ Ingreso registrado: ${formatMonto(movimiento.monto, moneda)}${project ? ` · ${project.name}` : ""}\n${descripcion}\n📅 ${fecha}`
    )
    return
  }

  if (movimiento.tipo === "gasto_proyecto") {
    const project = findByName(projects, movimiento.proyecto)
    if (!project) {
      await sendMessage(chatId, `¿De qué proyecto es este gasto? Proyectos activos: ${projects.map((p) => p.name).join(", ") || "(ninguno)"}`)
      return
    }
    const { error } = await supabase.from("project_expenses").insert({
      project_id: project.id,
      amount: amountUsd,
      date: fecha,
      description: descripcion,
      category: movimiento.categoria ?? "Other",
    })
    if (error) throw error

    await sendMessage(chatId, `✅ Gasto registrado: ${formatMonto(movimiento.monto, moneda)} · ${project.name}\n${descripcion}\n📅 ${fecha}`)
    return
  }

  // gasto_general -> recurring_expenses con frequency "One-time"
  const categoria = movimiento.categoria ?? "Other"
  const { error } = await supabase.from("recurring_expenses").insert({
    name: descripcion,
    amount: amountUsd,
    frequency: "One-time",
    category: categoria,
    expense_date: fecha,
    is_active: true,
  })
  if (error) throw error

  await sendMessage(chatId, `✅ Gasto registrado: ${formatMonto(movimiento.monto, moneda)} · ${CATEGORY_LABELS[categoria]}\n${descripcion}\n📅 ${fecha}`)
}
