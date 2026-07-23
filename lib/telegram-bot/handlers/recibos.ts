import Anthropic from "@anthropic-ai/sdk"
import { sendMessage, getTelegramFileBase64, type TelegramImageMediaType } from "@/lib/telegram-bot/telegram"
import { findByName } from "@/lib/telegram-bot/match"

// ============================================================
// Monto → letras (pesos MXN), determinístico — nunca se le pide a la IA
// que escriba montos legales, para no arriesgar un error de dedo.
// ============================================================

const UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"]
const DIECI = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"]
const VEINTI = ["VEINTE", "VEINTIUNO", "VEINTIDOS", "VEINTITRES", "VEINTICUATRO", "VEINTICINCO", "VEINTISEIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"]
const DECENAS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"]
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"]

function grupoATexto(n: number): string {
  if (n === 0) return ""
  if (n === 100) return "CIEN"

  const centena = Math.floor(n / 100)
  const resto = n % 100
  let resultado = centena > 0 ? CENTENAS[centena] : ""

  if (resto > 0) {
    if (resultado) resultado += " "
    if (resto < 10) resultado += UNIDADES[resto]
    else if (resto < 20) resultado += DIECI[resto - 10]
    else if (resto < 30) resultado += VEINTI[resto - 20]
    else {
      const decena = Math.floor(resto / 10)
      const unidad = resto % 10
      resultado += DECENAS[decena] + (unidad > 0 ? ` Y ${UNIDADES[unidad]}` : "")
    }
  }
  return resultado
}

function numeroATexto(n: number): string {
  if (n === 0) return "CERO"

  const millones = Math.floor(n / 1_000_000)
  const miles = Math.floor((n % 1_000_000) / 1000)
  const resto = n % 1000

  const partes: string[] = []
  if (millones > 0) partes.push(millones === 1 ? "UN MILLON" : `${grupoATexto(millones)} MILLONES`)
  if (miles > 0) partes.push(miles === 1 ? "MIL" : `${grupoATexto(miles)} MIL`)
  if (resto > 0) partes.push(grupoATexto(resto))

  return partes.join(" ")
}

export function montoALetras(monto: number): string {
  const entero = Math.floor(monto)
  const centavos = Math.round((monto - entero) * 100)
  return `${numeroATexto(entero)} PESOS ${String(centavos).padStart(2, "0")}/100 M.N.`
}

// ============================================================
// Extracción de datos del recibo vía Claude (texto y/o imagen)
// ============================================================

interface ReciboExtraido {
  fecha_emision?: string
  recibi_de?: string
  cantidad?: number
  concepto?: string
  forma_pago?: string
  respuesta?: string
}

const EXTRAER_RECIBO_TOOL: Anthropic.Tool = {
  name: "extraer_recibo",
  description: "Extrae los datos de un recibo de pago a partir de texto libre y/o una imagen (foto de comprobante, captura de transferencia, etc.).",
  input_schema: {
    type: "object",
    properties: {
      fecha_emision: { type: "string", description: "Fecha del pago en formato YYYY-MM-DD. Si no se menciona, usa la fecha de hoy." },
      recibi_de: { type: "string", description: "Nombre completo de quien hizo el pago (persona o empresa)." },
      cantidad: { type: "number", description: "Monto numérico del pago, en pesos mexicanos (MXN), sin símbolos ni comas." },
      concepto: { type: "string", description: "Breve descripción de por qué es el pago (ej. 'Diseño y desarrollo web')." },
      forma_pago: { type: "string", description: "Forma de pago mencionada (ej. SPEI, transferencia, efectivo, tarjeta, cheque). Si no se menciona, deja vacío." },
      respuesta: { type: "string", description: "Si falta el nombre de quien pagó o el monto (no se pueden inferir del texto ni de la imagen), escribe aquí qué falta preguntar. Si no falta nada, deja vacío." },
    },
    required: [],
  },
}

async function classifyRecibo(
  text: string,
  today: string,
  image?: { base64: string; mediaType: TelegramImageMediaType },
): Promise<ReciboExtraido> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurado")
  const client = new Anthropic({ apiKey })

  const content: Anthropic.ContentBlockParam[] = []
  if (image) {
    content.push({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } })
  }
  content.push({
    type: "text",
    text: `Fecha de hoy: ${today}.\n\nTexto del mensaje (puede venir vacío si toda la info está en la imagen):\n"""${text}"""`,
  })

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 512,
    tools: [EXTRAER_RECIBO_TOOL],
    tool_choice: { type: "tool", name: "extraer_recibo" },
    messages: [{ role: "user", content }],
  })

  const toolUse = response.content.find((b) => b.type === "tool_use")
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("No se pudo interpretar el recibo")
  return toolUse.input as ReciboExtraido
}

// ============================================================
// Handler principal
// ============================================================

const LUGAR_EMISION = "Aguascalientes, Ags."

export async function handleRecibo(
  chatId: number,
  rawText: string,
  context: { senderName?: string; photoFileId?: string },
  customers: { id: string; name: string; email: string | null }[],
) {
  const today = new Date().toISOString().split("T")[0]

  const image = context.photoFileId ? await getTelegramFileBase64(context.photoFileId) : undefined
  const textoLimpio = rawText.replace(/^\s*\/?recibo\b[:\s]*/i, "").trim()

  const extraido = await classifyRecibo(textoLimpio, today, image)

  if (extraido.respuesta || !extraido.recibi_de || !extraido.cantidad) {
    await sendMessage(chatId, extraido.respuesta || "Me falta el nombre de quien pagó y/o el monto. ¿Puedes repetirlo con esos datos?")
    return
  }

  const webhookUrl = process.env.MAKE_RECIBOS_WEBHOOK_URL
  if (!webhookUrl) throw new Error("MAKE_RECIBOS_WEBHOOK_URL no configurado")

  const cliente = findByName(customers, extraido.recibi_de)
  const timestampRecepcion = new Date().toISOString().slice(0, 16).replace("T", " ")

  const payload = {
    // No es columna de la hoja — se manda para que, al final del escenario de
    // Make, el módulo que regresa el PDF sepa a qué chat de Telegram enviarlo.
    telegram_chat_id: chatId,
    timestamp_recepcion: timestampRecepcion,
    fuente: `Telegram${context.senderName ? ` ${context.senderName}` : ""}`,
    dato_crudo: rawText,
    lugar_emision: LUGAR_EMISION,
    fecha_emision: extraido.fecha_emision || today,
    recibi_de: extraido.recibi_de,
    cantidad: extraido.cantidad,
    monto_escrito: montoALetras(extraido.cantidad),
    concepto: extraido.concepto || "",
    forma_pago: extraido.forma_pago || "",
    estatus_validacion: "Pendiente",
    enviado_a: cliente?.email ?? null,
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`El webhook de Make.com respondió ${res.status}`)

  await sendMessage(
    chatId,
    `🧾 Recibo enviado a validación:\n` +
      `Recibí de: ${payload.recibi_de}\n` +
      `Monto: $${payload.cantidad.toLocaleString("es-MX")} MXN (${payload.monto_escrito})\n` +
      `Concepto: ${payload.concepto || "—"}\n` +
      `Forma de pago: ${payload.forma_pago || "—"}\n` +
      (cliente
        ? `Enviado a: ${payload.enviado_a}\n`
        : `⚠️ No encontré email para "${payload.recibi_de}" — complétalo manualmente en la hoja.\n`) +
      `Estatus: Pendiente de validar`,
  )
}
