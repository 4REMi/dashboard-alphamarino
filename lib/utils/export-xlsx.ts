import * as XLSX from "xlsx"
import type { TaskSet, TaskSetTask, TaskSetChecklistItem } from "@/lib/types"

interface ExportPhase {
  id: string
  name: string
  description?: string | null
  phase_order: number
  default_task_set_id?: string | null
}

export function exportToXlsx(
  typeName: string,
  typeDescription: string | null,
  phaseSetName: string | null,
  phases: ExportPhase[],
  taskSets: TaskSet[],
) {
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Tipo de Proyecto ─────────────────────────────────────────────
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Campo", "Valor"],
      ["Nombre", typeName],
      ["Descripción", typeDescription ?? ""],
      ["Phase Set", phaseSetName ?? ""],
    ]),
    "Tipo de Proyecto",
  )

  // ── Sheet 2: Fases ────────────────────────────────────────────────────────
  const phaseRows: unknown[][] = [["#", "Nombre", "Descripción", "Task Set vinculado"]]
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i]
    const ts = ph.default_task_set_id ? taskSets.find((t) => t.id === ph.default_task_set_id) : null
    phaseRows.push([i + 1, ph.name, ph.description ?? "", ts?.name ?? ""])
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(phaseRows), "Fases")

  // ── One sheet per phase (tasks) ───────────────────────────────────────────
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i]
    const ts = ph.default_task_set_id ? taskSets.find((t) => t.id === ph.default_task_set_id) : null
    const tasks = (ts?.tasks ?? []) as TaskSetTask[]

    const taskRows: unknown[][] = [
      ["#", "Tarea", "Descripción", "Urgente", "Requiere entregable", "Checklist"],
    ]
    for (let j = 0; j < tasks.length; j++) {
      const t = tasks[j]
      const items = (t.checklist_items ?? []) as TaskSetChecklistItem[]
      const checklistStr = items
        .sort((a, b) => a.item_order - b.item_order)
        .map((ci) => (ci.is_blocking ? `${ci.text}*` : ci.text))
        .join(" | ")
      taskRows.push([
        j + 1,
        t.title,
        t.description ?? "",
        t.is_urgent ? "Sí" : "No",
        t.requires_deliverable ? "Sí" : "No",
        checklistStr,
      ])
    }

    // Sheet name max 31 chars, strip invalid chars
    const sheetName = `${i + 1} - ${ph.name}`.slice(0, 31).replace(/[:\\/?*[\]]/g, "")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(taskRows), sheetName)
  }

  // ── Download ──────────────────────────────────────────────────────────────
  const filename = `${typeName.replace(/\s+/g, "-").toLowerCase()}-template.xlsx`
  XLSX.writeFile(wb, filename)
}
