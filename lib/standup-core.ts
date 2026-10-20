import type { SupabaseClient } from "@supabase/supabase-js"
import { classifyStandup } from "@/lib/telegram-bot/classify"
import { findByName } from "@/lib/telegram-bot/match"
import type { StandupItem } from "@/lib/actions/standup"

// Interpretación de "Captura rápida" (texto libre → tareas y notas), común
// al dashboard (processStandup) y al MCP (captura_rapida). Solo interpreta y
// resuelve proyecto/persona por nombre; no crea nada.
export async function interpretStandup(db: SupabaseClient, text: string): Promise<StandupItem[]> {
  const [{ data: projects }, { data: profiles }] = await Promise.all([
    db.from("projects").select("id, name").eq("status", "Active"),
    db.from("profiles").select("id, full_name"),
  ])
  const today = new Date().toISOString().split("T")[0]
  const movimientos = await classifyStandup(text, { projects: (projects ?? []).map((p) => p.name) }, today)
  const projectList = projects ?? []
  const profileList = (profiles ?? []).map((p) => ({ ...p, name: p.full_name }))
  return movimientos.map((m) => {
    const project = findByName(projectList, m.proyecto)
    const assignee = m.tipo === "tarea" && m.asignado ? findByName(profileList, m.asignado) : null
    return {
      tipo: (m.tipo === "nota_proyecto" ? "nota_proyecto" : "tarea") as "tarea" | "nota_proyecto",
      titulo: m.titulo ?? null,
      descripcion: m.descripcion ?? null,
      fecha: m.fecha ?? null,
      projectIdGuess: project?.id ?? null,
      projectNameRaw: m.proyecto ?? null,
      assigneeIdGuess: assignee?.id ?? null,
      assigneeNameRaw: m.asignado ?? null,
      pingear: m.tipo === "tarea" && !!m.pingear,
      pingRecipientIdsGuess: m.tipo === "tarea" && m.pingear ? (m.avisar_a ?? []).map((n) => findByName(profileList, n)?.id).filter((x): x is string => !!x) : [],
      pingNamesRaw: m.tipo === "tarea" && m.pingear ? m.avisar_a ?? [] : [],
      requiereEntregable: m.tipo === "tarea" && !!m.requiere_entregable,
      instruccionesEntregable: m.tipo === "tarea" && m.requiere_entregable ? m.instrucciones_entregable?.trim() || null : null,
    }
  })
}
