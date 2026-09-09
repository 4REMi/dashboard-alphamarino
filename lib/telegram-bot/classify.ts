import Anthropic from "@anthropic-ai/sdk"

export type TipoMovimiento =
  | "ingreso" | "gasto_proyecto" | "gasto_general" | "dominio"
  | "tarea" | "tarea_completada" | "nota_proyecto" | "cliente"
  | "otro"

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
  // tarea / tarea_completada
  titulo?: string
  asignado?: string
  // cliente
  empresa?: string
  email?: string
  telefono?: string
}

const MOVIMIENTO_SCHEMA = {
  type: "object" as const,
  properties: {
    tipo: {
      type: "string",
      enum: ["ingreso", "gasto_proyecto", "gasto_general", "dominio", "tarea", "tarea_completada", "nota_proyecto", "cliente", "otro"],
      description:
        "'ingreso' = dinero que entra (pago de cliente). 'gasto_proyecto' = gasto asociado a un proyecto específico. 'gasto_general' = gasto operativo sin proyecto (ej. software, renta, nómina). 'dominio' = alta o renovación de un dominio web. 'tarea' = crear una tarea nueva. Úsalo tanto para peticiones explícitas ('crea una tarea...', 'recuérdame...') COMO para cualquier pendiente o cosa por hacer que se mencione de forma implícita, aunque no se pida crear una tarea con esas palabras — si el mensaje describe algo que hay que hacer, resolver, dar seguimiento o no se le puede perder la pista, ES una tarea. Si no se menciona proyecto ni persona responsable, deja 'proyecto' y 'asignado' vacíos — el sistema se encarga de asignarla a quien dictó el mensaje. 'tarea_completada' = marcar una tarea existente como hecha (SIEMPRE requiere mencionar el proyecto — no se puede sin eso). 'nota_proyecto' = agregar una nota o comentario a la bitácora de un proyecto (úsalo en vez de 'tarea' SOLO cuando se menciona explícitamente un proyecto Y sea claramente una nota informativa, no un pendiente). 'cliente' = dar de alta un cliente nuevo. 'otro' = SOLO para saludos, mensajes de prueba, texto ininteligible, o una pregunta directa que espera una respuesta — NUNCA uses 'otro' para un pendiente o algo por hacer, eso siempre es 'tarea'.",
    },
    monto: { type: "number", description: "Monto numérico mencionado (costo de renovación si tipo es 'dominio'), sin símbolos." },
    moneda: {
      type: "string",
      enum: ["USD", "MXN"],
      description: "Moneda del monto. Si no se especifica, asume MXN salvo que el contexto indique claramente dólares.",
    },
    descripcion: { type: "string", description: "Descripción breve y clara del movimiento. Notas si tipo es 'dominio'. Cuerpo del comentario si tipo es 'nota_proyecto'." },
    proyecto: { type: "string", description: "Nombre del proyecto mencionado (tal cual lo dice el usuario), si aplica a ingreso, gasto_proyecto, tarea, tarea_completada o nota_proyecto." },
    categoria: {
      type: "string",
      enum: ["Payroll", "Software", "Rent", "Services", "Other"],
      description: "Categoría del gasto general. Si no es claro, usa 'Other'.",
    },
    fecha: { type: "string", description: "Fecha en formato YYYY-MM-DD. Para 'dominio' es la fecha de renovación/vencimiento. Para 'tarea' es la fecha límite si se menciona. Si no se menciona y tipo no es 'dominio' ni 'tarea', usa la fecha de hoy." },
    dominio: { type: "string", description: "Nombre del dominio (ej. ejemplo.com), solo si tipo es 'dominio'." },
    cliente: { type: "string", description: "Nombre del cliente (tal cual lo dice el usuario) — asociado al dominio si tipo es 'dominio', o el nombre del cliente nuevo si tipo es 'cliente'." },
    registrador: { type: "string", description: "Registrador del dominio (ej. GoDaddy, Namecheap, Cloudflare), solo si tipo es 'dominio' y se menciona." },
    respuesta: { type: "string", description: "Mensaje para responder al usuario cuando tipo es 'otro' (saludo, aclaración o pregunta de qué falta)." },
    titulo: { type: "string", description: "Título de la tarea, solo si tipo es 'tarea' o 'tarea_completada'. Para una tarea explícita, un título breve y claro. Para un pendiente implícito, usa el mensaje tal cual (o una versión ligeramente limpia) como título — no lo resumas de más. Para 'tarea_completada', puede ser el título completo o solo una parte reconocible." },
    asignado: { type: "string", description: "Nombre de la persona a la que se le asigna la tarea (tal cual lo dice el usuario), solo si tipo es 'tarea' y se menciona EXPLÍCITAMENTE un nombre propio. Si no se menciona a nadie, déjalo vacío — nunca inventes ni asumas un nombre." },
    empresa: { type: "string", description: "Nombre de la empresa del cliente nuevo, solo si tipo es 'cliente' y se menciona." },
    email: { type: "string", description: "Correo del cliente nuevo, solo si tipo es 'cliente' y se menciona." },
    telefono: { type: "string", description: "Teléfono del cliente nuevo, solo si tipo es 'cliente' y se menciona." },
  },
  required: ["tipo"],
}

// Un solo mensaje/nota puede describir varios movimientos a la vez (ej. una
// nota de voz dictada en Vowen listando varios gastos) — siempre devuelve un
// arreglo, incluso para el caso común de un solo movimiento, para que quien
// llama tenga una sola forma de iterar sin importar el origen.
const REGISTRAR_MOVIMIENTOS_TOOL: Anthropic.Tool = {
  name: "registrar_movimientos",
  description: "Interpreta un mensaje o nota en lenguaje natural y lo desglosa en uno o más movimientos a registrar en el dashboard (finanzas, dominios, tareas, bitácora de proyecto o clientes), o responde si no aplica ninguno.",
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

// Variante restringida para el "Volcado rápido" de /tasks — a diferencia de
// classifyMessage (Telegram/Vowen, cualquier tipo de movimiento), aquí solo
// interesan tareas y notas de bitácora: un solo texto puede volcar
// pendientes de varios proyectos y personas a la vez, que el dashboard
// desglosa y — a diferencia del bot — muestra en una vista previa EDITABLE
// antes de crear nada de verdad (por eso no hace falta un tipo "otro" para
// pedir aclaración; el usuario corrige directo en la UI).
const STANDUP_TOOL: Anthropic.Tool = {
  name: "registrar_pendientes",
  description: "Interpreta un texto de stand-up en lenguaje natural y lo desglosa en tareas y/o notas de bitácora para uno o varios proyectos distintos.",
  input_schema: {
    type: "object",
    properties: {
      movimientos: {
        type: "array",
        description: "Un elemento por cada tarea o nota distinta mencionada en el texto.",
        items: {
          type: "object",
          properties: {
            tipo: {
              type: "string",
              enum: ["tarea", "nota_proyecto"],
              description: "'tarea' = un pendiente o algo por hacer, explícito o implícito. 'nota_proyecto' = un comentario o actualización informativa de un proyecto, no un pendiente.",
            },
            titulo: { type: "string", description: "Para 'tarea': título breve y claro (o el texto tal cual si es un pendiente implícito)." },
            descripcion: { type: "string", description: "Para 'nota_proyecto': el cuerpo de la nota." },
            proyecto: { type: "string", description: "Nombre del proyecto mencionado (tal cual lo dice el usuario). Puede faltar en una 'tarea' (queda sin proyecto); una 'nota_proyecto' SIEMPRE debe tener proyecto." },
            asignado: { type: "string", description: "Nombre de la persona a la que se le asigna la tarea, SOLO si se menciona explícitamente un nombre propio. Si no se menciona a nadie, déjalo vacío." },
            fecha: { type: "string", description: "Fecha límite en formato YYYY-MM-DD, solo si se menciona." },
          },
          required: ["tipo"],
        },
        minItems: 1,
      },
    },
    required: ["movimientos"],
  },
}

export async function classifyStandup(
  text: string,
  context: { projects: string[] },
  today: string,
): Promise<Movimiento[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurado")
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    tools: [STANDUP_TOOL],
    tool_choice: { type: "tool", name: "registrar_pendientes" },
    messages: [
      {
        role: "user",
        content: `Fecha de hoy: ${today}.
Proyectos activos conocidos: ${context.projects.length ? context.projects.join(", ") : "(ninguno)"}.

Texto de stand-up — puede mezclar pendientes y notas de varios proyectos y personas distintas:
"""${text}"""`,
      },
    ],
  })

  const toolUse = response.content.find((b) => b.type === "tool_use")
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("No se pudo interpretar el texto")
  const movimientos = (toolUse.input as { movimientos?: Movimiento[] }).movimientos
  if (!movimientos || movimientos.length === 0) throw new Error("No se pudo interpretar el texto")
  return movimientos
}
