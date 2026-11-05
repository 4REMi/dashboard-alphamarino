import { z } from "zod"
import type { McpServer, AuthInfo } from "@modelcontextprotocol/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireFinance } from "@/lib/mcp/finance-tools"
import { montoALetras, sendReciboToMake } from "@/lib/telegram-bot/handlers/recibos"
import { findByName } from "@/lib/telegram-bot/match"

// Recibo de ingreso desde el MCP: mismo webhook de Make que el bot de
// Telegram. El PDF lo sigue regresando Make al chat de Telegram autorizado
// (TELEGRAM_ALLOWED_CHAT_ID), igual que cuando se pide por el bot.

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] })
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" })

export function registerReceiptTools(server: McpServer) {
  server.registerTool("generar_recibo", {
    title: "Generar recibo de ingreso",
    description: "Genera un recibo de pago (el mismo flujo que /recibo en Telegram): manda los datos a Make, que llena la hoja con estatus Pendiente de validar y envía el PDF al chat de Telegram. El monto en letras se calcula solo. Si el comprobante viene en una imagen, extrae tú los datos antes de llamar. Sin confirmar: true solo muestra la vista previa. Permiso de Finanzas.",
    inputSchema: z.object({
      recibi_de: z.string().min(2).describe("Nombre de quien pagó (persona o empresa)"),
      cantidad: z.number().positive().describe("Monto en MXN"),
      concepto: z.string().optional().describe("Por qué es el pago, ej. Diseño y desarrollo web"),
      forma_pago: z.string().optional().describe("SPEI, transferencia, efectivo, tarjeta, cheque"),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Fecha del pago; default hoy"),
      confirmar: z.boolean().default(false),
    }),
  }, async (a, ctx: { http?: { authInfo?: AuthInfo } }) => {
    await requireFinance(ctx)
    const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID
    if (!chatId) throw new Error("TELEGRAM_ALLOWED_CHAT_ID no configurado: Make no sabría a dónde mandar el PDF.")
    const { data: customers } = await createAdminClient().from("customers").select("id, name, email")
    const cliente = findByName(customers ?? [], a.recibi_de)
    const fecha = a.fecha ?? today()
    const resumen = [
      `Recibí de: ${a.recibi_de}`,
      `Monto: $${a.cantidad.toLocaleString("es-MX")} MXN (${montoALetras(a.cantidad)})`,
      `Concepto: ${a.concepto || "—"}`,
      `Forma de pago: ${a.forma_pago || "—"}`,
      `Fecha: ${fecha}`,
      cliente?.email ? `Enviado a: ${cliente.email}` : `⚠️ No encontré email para "${a.recibi_de}"; habría que completarlo en la hoja.`,
    ].join("\n")
    if (!a.confirmar) return text(`Recibo a generar:\n${resumen}\n\nNo se envió nada. Si es correcto, vuelve a llamar con confirmar: true.`)
    await sendReciboToMake({
      chatId: Number(chatId), fuente: "Claude (MCP)",
      datoCrudo: `generar_recibo: ${a.recibi_de} · ${a.cantidad} · ${a.concepto ?? ""} · ${a.forma_pago ?? ""} · ${fecha}`,
      fecha, recibiDe: a.recibi_de, cantidad: a.cantidad, concepto: a.concepto ?? "", formaPago: a.forma_pago ?? "",
    }, customers ?? [])
    return text(`🧾 Recibo enviado a validación. El PDF llegará al chat de Telegram.\n${resumen}\nEstatus: Pendiente de validar`)
  })
}
