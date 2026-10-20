"use server"

import { createClient } from "@/lib/supabase/server"
import { interpretStandup } from "@/lib/standup-core"

export interface StandupItem {
  tipo: "tarea" | "nota_proyecto"
  titulo: string | null       // tarea
  descripcion: string | null  // nota_proyecto (cuerpo de la nota)
  fecha: string | null        // tarea — fecha límite
  projectIdGuess: string | null
  projectNameRaw: string | null
  assigneeIdGuess: string | null   // tarea — solo si se mencionó un nombre explícito
  assigneeNameRaw: string | null
  pingear: boolean                 // tarea: avisar al completarla
  pingRecipientIdsGuess: string[]  // vacío = equipo del proyecto
  pingNamesRaw: string[]
  requiereEntregable: boolean      // tarea: pide subir un resultado al completarla
  instruccionesEntregable: string | null
}

// "Captura rápida" en /tasks — un solo texto libre puede describir pendientes
// y notas de varios proyectos y personas a la vez. Solo interpreta y resuelve
// las mejores coincidencias (proyecto/persona por nombre) para que el
// dashboard las muestre en una vista previa editable — nada se crea todavía
// acá, eso pasa cuando el usuario confirma cada item por separado (ver
// components/tasks/standup-dump.tsx), reusando createTask/addLogEntry reales.
export async function processStandup(text: string): Promise<StandupItem[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  return interpretStandup(supabase, text)
}

// Datos para abrir Captura rápida desde cualquier página (botón global):
// mismo criterio que /tasks — proyectos activos; empleados solo los suyos.
export async function getQuickCaptureData() {
  const { getEmployees } = await import("@/lib/actions/employees")
  const { getProjects } = await import("@/lib/actions/projects")
  const { getSops } = await import("@/lib/actions/sops")
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const [employees, rawProjects, sops] = await Promise.all([getEmployees(), getProjects().catch(() => []), getSops().catch(() => [])])
  const active = (rawProjects as { id: string; name: string; status: string; members?: { id: string }[] }[]).filter((p) => p.status === "Active")
  const visible = profile?.role === "admin" ? active : active.filter((p) => (p.members ?? []).some((m) => m.id === user.id))
  return { currentUserId: user.id, employees, sops, projects: visible.map((p) => ({ id: p.id, name: p.name })) }
}
