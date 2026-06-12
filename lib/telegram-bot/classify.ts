import Anthropic from "@anthropic-ai/sdk"

export type TipoMovimiento = "ingreso" | "gasto_proyecto" | "gasto_general" | "dominio" | "otro"

export interface Movimiento {
  tipo: TipoMovimiento
  monto?: number
  moneda?: "USD" | "MXN"
  descripcion?: string
  proyecto?: string
  categoria?: "Payroll" | "Software" | "Rent" | "Services" | "Other"
  fecha?: string
  dominio?: string
  cliente?: string
  registrador?: string
  respuesta?: string
}

const REGISTRAR_MOVIMIENTO_TOOL: Anthropic.Tool = {
  name: "registrar_movimiento",
  description: "Interpreta un mensaje en lenguaje natural y lo clasifica como un movimiento a registrar en el dashboard (finanzas o dominios), o responde si no aplica.",
  input_schema: {
    type: "object",
    properties: {
      tipo: {
        type: "string",
        enum: ["ingreso", "gasto_proyecto", "gasto_general", "dominio", "otro"],
        description:
          "'ingreso' = dinero que entra (pago de cliente). 'gasto_proyecto' = gasto asociado a un proyecto específico. 'gasto_general' = gasto operativo sin proyecto (ej. software, renta, nómina). 'dominio' = alta o renovación de un dominio web. 'otro' = el mensaje no describe ninguno de los anteriores, o falta información esencial.",
      },
      monto: { type: "number", description: "Monto numérico mencionado (costo de renovación si tipo es 'dominio'), sin símbolos." },
      moneda: {
        type: "string",
        enum: ["USD", "MXN"],
        description: "Moneda del monto. Si no se especifica, asume MXN salvo que el contexto indique claramente dólares.",
      },
      descripcion: { type: "string", description: "Descripción breve y clara del movimiento, o notas si tipo es 'dominio'." },
      proyecto: { type: "string", description: "Nombre del proyecto mencionado (tal cual lo dice el usuario), si aplica a ingreso o gasto_proyecto." },
      categoria: {
        type: "string",
        enum: ["Payroll", "Software", "Rent", "Services", "Other"],
        description: "Categoría del gasto general. Si no es claro, usa 'Other'.",
      },
      fecha: { type: "string", description: "Fecha en formato YYYY-MM-DD. Para 'dominio' es la fecha de renovación/vencimiento. Si no se menciona y tipo no es 'dominio', usa la fecha de hoy." },
      dominio: { type: "string", description: "Nombre del dominio (ej. ejemplo.com), solo si tipo es 'dominio'." },
      cliente: { type: "string", description: "Nombre del cliente asociado al dominio (tal cual lo dice el usuario), solo si tipo es 'dominio'." },
      registrador: { type: "string", description: "Registrador del dominio (ej. GoDaddy, Namecheap, Cloudflare), solo si tipo es 'dominio' y se menciona." },
      respuesta: { type: "string", description: "Mensaje para responder al usuario cuando tipo es 'otro' (saludo, aclaración o pregunta de qué falta)." },
    },
    required: ["tipo"],
  },
}

export async function classifyMessage(
  text: string,
  context: { projects: string[]; customers: string[] },
  today: string,
): Promise<Movimiento> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurado")
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 512,
    tools: [REGISTRAR_MOVIMIENTO_TOOL],
    tool_choice: { type: "tool", name: "registrar_movimiento" },
    messages: [
      {
        role: "user",
        content: `Fecha de hoy: ${today}.
Proyectos activos conocidos: ${context.projects.length ? context.projects.join(", ") : "(ninguno)"}.
Clientes conocidos: ${context.customers.length ? context.customers.join(", ") : "(ninguno)"}.

Mensaje del usuario:
"""${text}"""`,
      },
    ],
  })

  const toolUse = response.content.find((b) => b.type === "tool_use")
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("No se pudo interpretar el mensaje")
  return toolUse.input as Movimiento
}
