import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic()

const SUGGEST_TASK_TOOL: Anthropic.Tool = {
  name: "suggest_task",
  description: "Genera una propuesta de tarea estructurada con checklist basada en la descripción del usuario y el contexto del proyecto.",
  input_schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Título conciso y accionable de la tarea. Empieza con un verbo en infinitivo (ej. 'Solicitar', 'Configurar', 'Revisar').",
      },
      description: {
        type: "string",
        description: "Descripción breve (1-2 oraciones) que explica el objetivo o criterio de aceptación de la tarea.",
      },
      is_urgent: {
        type: "boolean",
        description: "true solo si la descripción del usuario indica urgencia explícita o es un bloqueador crítico del proyecto.",
      },
      requires_deliverable: {
        type: "boolean",
        description: "true si la tarea implica que el usuario o cliente debe entregar un archivo, documento, acceso o link.",
      },
      suggested_position: {
        type: "string",
        description: "Nombre del puesto más adecuado para ejecutar esta tarea (debe ser uno de los puestos disponibles). Omitir si ninguno aplica claramente.",
      },
      checklist: {
        type: "array",
        description: "Lista de verificación tipo QA (quality assurance) para validar que la tarea se completó correctamente. NO son pasos de ejecución ni procedimientos — son puntos de control y criterios de aceptación. Cada ítem debe ser una pregunta implícita de '¿se cumplió esto?' Entre 2 y 6 ítems.",
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "Criterio de verificación conciso. Debe poderse responder con sí/no. Ej: 'Enlace funciona correctamente', 'Diseño aprobado por cliente', 'Sin errores en consola'." },
            is_blocking: { type: "boolean", description: "true si este criterio DEBE cumplirse antes de poder marcar la tarea como completada." },
          },
          required: ["text", "is_blocking"],
        },
      },
    },
    required: ["title", "checklist"],
  },
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      userMessage,
      conversationHistory = [],
      context,
    }: {
      userMessage: string
      conversationHistory: { role: "user" | "assistant"; content: string }[]
      context: {
        projectTypeName: string | null
        phaseSetName: string
        allPhases: string[]
        currentPhaseName: string
        currentPhaseIndex: number
        existingTasks: string[]
        availablePositions: string[]
      }
    } = body

    const systemPrompt = `Eres un asistente experto en operaciones de agencia digital. Tu rol es ayudar a crear tareas bien estructuradas para un Ops Lab (sistema de plantillas de tareas para proyectos).

## Contexto actual
- **Tipo de proyecto**: ${context.projectTypeName ?? "General"}
- **Phase Set**: ${context.phaseSetName}
- **Fases del Phase Set (en orden)**: ${context.allPhases.map((p, i) => `${i + 1}. ${p}`).join(" → ")}
- **Fase actual**: ${context.currentPhaseName} (posición ${context.currentPhaseIndex + 1})
- **Tareas ya existentes en esta fase**: ${context.existingTasks.length > 0 ? context.existingTasks.join(", ") : "Ninguna aún"}
- **Puestos disponibles**: ${context.availablePositions.join(", ") || "No hay puestos configurados"}

## Instrucciones
- Las tareas deben ser accionables, específicas y coherentes con la fase y el tipo de proyecto
- El checklist NO es un SOP ni pasos de ejecución — es una lista de verificación tipo QA: criterios de aceptación y puntos de control para validar que la tarea se hizo bien. Piensa en "¿se revisó X?", "¿cumple con Y?", "¿funciona Z?"
- Considera qué tareas ya existen para no duplicar
- Adapta el lenguaje al contexto de agencia digital latinoamericana
- Si el usuario pide ajustes a una propuesta anterior, refínala manteniendo coherencia`

    const messages: Anthropic.MessageParam[] = [
      ...conversationHistory.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user", content: userMessage },
    ]

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      tools: [SUGGEST_TASK_TOOL],
      tool_choice: { type: "auto" },
      messages,
    })

    // Extract tool use result
    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")

    if (toolUse && toolUse.name === "suggest_task") {
      return NextResponse.json({
        type: "proposal",
        proposal: toolUse.input,
        assistantMessage: textBlock?.text ?? null,
      })
    }

    // Fallback: model responded with text only (clarification question)
    return NextResponse.json({
      type: "message",
      message: textBlock?.text ?? "No pude generar una propuesta. ¿Puedes dar más detalles?",
    })
  } catch (e) {
    console.error("[suggest-task]", e)
    return NextResponse.json({ error: "Error al generar propuesta" }, { status: 500 })
  }
}
