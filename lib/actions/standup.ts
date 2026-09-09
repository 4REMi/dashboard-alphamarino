"use server"

import { createClient } from "@/lib/supabase/server"
import { classifyStandup } from "@/lib/telegram-bot/classify"
import { findByName } from "@/lib/telegram-bot/match"

export interface StandupItem {
  tipo: "tarea" | "nota_proyecto"
  titulo: string | null       // tarea
  descripcion: string | null  // nota_proyecto (cuerpo de la nota)
  fecha: string | null        // tarea — fecha límite
  projectIdGuess: string | null
  projectNameRaw: string | null
  assigneeIdGuess: string | null   // tarea — solo si se mencionó un nombre explícito
  assigneeNameRaw: string | null
}

// "Volcado rápido" en /tasks — un solo texto libre puede describir pendientes
// y notas de varios proyectos y personas a la vez. Solo interpreta y resuelve
// las mejores coincidencias (proyecto/persona por nombre) para que el
// dashboard las muestre en una vista previa editable — nada se crea todavía
// acá, eso pasa cuando el usuario confirma cada item por separado (ver
// components/tasks/standup-dump.tsx), reusando createTask/addLogEntry reales.
export async function processStandup(text: string): Promise<StandupItem[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")

  const [{ data: projects }, { data: profiles }] = await Promise.all([
    supabase.from("projects").select("id, name").eq("status", "Active"),
    supabase.from("profiles").select("id, full_name"),
  ])

  const today = new Date().toISOString().split("T")[0]
  const movimientos = await classifyStandup(
    text,
    { projects: (projects ?? []).map((p) => p.name) },
    today,
  )

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
    }
  })
}
