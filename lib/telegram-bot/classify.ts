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

const MOVIMIENTO_SCHEMA = {
  type: "object" as const,
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
}

// A single message/note can describe several movements at once (e.g. a
// dictated Vowen note listing multiple expenses) — always returns an array,
// even for the common one-movement case, so callers have one shape to loop
// over regardless of source.
const REGISTRAR_MOVIMIENTOS_TOOL: Anthropic.Tool = {
  name: "registrar_movimientos",
  description: "Interpreta un mensaje o nota en lenguaje natural y lo desglosa en uno o más movimientos a registrar en el dashboard (finanzas o dominios), o responde si no aplica ninguno.",
  input_schema: {
    type: "object",
    properties: {
      movimientos: {
        type: "array",
        description: "Un elemento por cada movimiento distinto mencionado en el texto. Si el texto describe un solo movimiento, devuelve un arreglo de un solo elemento. Si no describe ningún movimiento válido, devuelve un solo elemento con tipo 'otro'.",
        items: MOVIMIENTO_SCHEMA,
        minItems: 1,
      },
    },
    required: ["movimientos"],
  },
}

export async function classifyMessage(
  text: string,
  context: { projects: string[]; customers: string[] },
  today: string,
): Promise<Movimiento[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurado")
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    tools: [REGISTRAR_MOVIMIENTOS_TOOL],
    tool_choice: { type: "tool", name: "registrar_movimientos" },
    messages: [
      {
        role: "user",
        content: `Fecha de hoy: ${today}.
Proyectos activos conocidos: ${context.projects.length ? context.projects.join(", ") : "(ninguno)"}.
Clientes conocidos: ${context.customers.length ? context.customers.join(", ") : "(ninguno)"}.

Mensaje o nota del usuario — puede describir uno o varios movimientos distintos:
"""${text}"""`,
      },
    ],
  })

  const toolUse = response.content.find((b) => b.type === "tool_use")
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("No se pudo interpretar el mensaje")
  const movimientos = (toolUse.input as { movimientos?: Movimiento[] }).movimientos
  if (!movimientos || movimientos.length === 0) throw new Error("No se pudo interpretar el mensaje")
  return movimientos
}
