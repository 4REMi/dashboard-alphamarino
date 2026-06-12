import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { createAdminClient } from "@/lib/supabase/admin"
import { getExchangeRate } from "@/lib/actions/finances"

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

async function sendMessage(chatId: number, text: string) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  })
}

const REGISTRAR_MOVIMIENTO_TOOL: Anthropic.Tool = {
  name: "registrar_movimiento",
  description: "Registra un ingreso o gasto financiero a partir de un mensaje en lenguaje natural, o responde si el mensaje no es un movimiento financiero claro.",
  input_schema: {
    type: "object",
    properties: {
      tipo: {
        type: "string",
        enum: ["ingreso", "gasto_proyecto", "gasto_general", "otro"],
        description:
          "'ingreso' = dinero que entra (pago de cliente). 'gasto_proyecto' = gasto asociado a un proyecto específico. 'gasto_general' = gasto operativo sin proyecto (ej. software, renta, nómina). 'otro' = el mensaje no describe un movimiento financiero claro, o falta información esencial (monto).",
      },
      monto: { type: "number", description: "Monto numérico mencionado, sin símbolos." },
      moneda: {
        type: "string",
        enum: ["USD", "MXN"],
        description: "Moneda del monto. Si no se especifica, asume MXN salvo que el contexto indique claramente dólares.",
      },
      descripcion: { type: "string", description: "Descripción breve y clara del movimiento." },
      proyecto: { type: "string", description: "Nombre del proyecto mencionado (tal cual lo dice el usuario), si aplica." },
      categoria: {
        type: "string",
        enum: ["Payroll", "Software", "Rent", "Services", "Other"],
        description: "Categoría del gasto general. Si no es claro, usa 'Other'.",
      },
      fecha: { type: "string", description: "Fecha del movimiento en formato YYYY-MM-DD. Si no se menciona, usa la fecha de hoy." },
      respuesta: { type: "string", description: "Mensaje para responder al usuario cuando tipo es 'otro' (saludo, aclaración o pregunta de qué falta)." },
    },
    required: ["tipo"],
  },
}

interface Movimiento {
  tipo: "ingreso" | "gasto_proyecto" | "gasto_general" | "otro"
  monto?: number
  moneda?: "USD" | "MXN"
  descripcion?: string
  proyecto?: string
  categoria?: "Payroll" | "Software" | "Rent" | "Services" | "Other"
  fecha?: string
  respuesta?: string
}

async function parseMessage(text: string, projectNames: string[], today: string): Promise<Movimiento> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurado")
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    tools: [REGISTRAR_MOVIMIENTO_TOOL],
    tool_choice: { type: "tool", name: "registrar_movimiento" },
    messages: [
      {
        role: "user",
        content: `Fecha de hoy: ${today}.
Proyectos activos conocidos: ${projectNames.length ? projectNames.join(", ") : "(ninguno)"}.

Mensaje del usuario:
"""${text}"""`,
      },
    ],
  })

  const toolUse = response.content.find((b) => b.type === "tool_use")
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("No se pudo interpretar el mensaje")
  return toolUse.input as Movimiento
}

function findProjectId(projects: { id: string; name: string }[], name?: string): { id: string; name: string } | null {
  if (!name) return null
  const norm = (s: string) => s.toLowerCase().trim()
  const target = norm(name)
  return (
    projects.find((p) => norm(p.name) === target) ??
    projects.find((p) => norm(p.name).includes(target) || target.includes(norm(p.name))) ??
    null
  )
}

const CATEGORY_LABELS: Record<string, string> = {
  Payroll: "Nómina",
  Software: "Software",
  Rent: "Renta",
  Services: "Servicios",
  Other: "Otros",
}

async function handleMovimiento(chatId: number, text: string) {
  const supabase = createAdminClient()
  const today = new Date().toISOString().split("T")[0]

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("status", "Active")

  const movimiento = await parseMessage(text, (projects ?? []).map((p) => p.name), today)

  if (movimiento.tipo === "otro") {
    await sendMessage(chatId, movimiento.respuesta || "No entendí ese mensaje. Cuéntame el monto, si es ingreso o gasto, y una breve descripción.")
    return
  }

  if (!movimiento.monto || movimiento.monto <= 0) {
    await sendMessage(chatId, "No detecté un monto válido. ¿Puedes repetirlo incluyendo la cantidad?")
    return
  }

  const moneda = movimiento.moneda ?? "MXN"
  const fecha = movimiento.fecha || today
  const descripcion = movimiento.descripcion || text

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
    const project = findProjectId(projects ?? [], movimiento.proyecto)
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

    const montoFmt = moneda === "MXN" ? `MXN ${movimiento.monto.toLocaleString("es-MX")}` : `USD ${movimiento.monto.toLocaleString("en-US")}`
    await sendMessage(
      chatId,
      `✅ Ingreso registrado: ${montoFmt}${project ? ` · ${project.name}` : ""}\n${descripcion}\n📅 ${fecha}`
    )
    return
  }

  if (movimiento.tipo === "gasto_proyecto") {
    const project = findProjectId(projects ?? [], movimiento.proyecto)
    if (!project) {
      await sendMessage(chatId, `¿De qué proyecto es este gasto? Proyectos activos: ${(projects ?? []).map((p) => p.name).join(", ") || "(ninguno)"}`)
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

    const montoFmt = moneda === "MXN" ? `MXN ${movimiento.monto.toLocaleString("es-MX")}` : `USD ${movimiento.monto.toLocaleString("en-US")}`
    await sendMessage(chatId, `✅ Gasto registrado: ${montoFmt} · ${project.name}\n${descripcion}\n📅 ${fecha}`)
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

  const montoFmt = moneda === "MXN" ? `MXN ${movimiento.monto.toLocaleString("es-MX")}` : `USD ${movimiento.monto.toLocaleString("en-US")}`
  await sendMessage(chatId, `✅ Gasto registrado: ${montoFmt} · ${CATEGORY_LABELS[categoria]}\n${descripcion}\n📅 ${fecha}`)
}

export async function POST(req: NextRequest) {
  const update = await req.json()
  const message = update.message

  if (!message?.text) return NextResponse.json({ ok: true })

  const chatId = message.chat.id as number
  if (String(chatId) !== process.env.TELEGRAM_ALLOWED_CHAT_ID) {
    return NextResponse.json({ ok: true })
  }

  try {
    await handleMovimiento(chatId, message.text as string)
  } catch (err) {
    await sendMessage(chatId, `⚠️ Error: ${err instanceof Error ? err.message : "desconocido"}`)
  }

  return NextResponse.json({ ok: true })
}
