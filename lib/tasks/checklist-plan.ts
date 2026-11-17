// Plan de edición del checklist de una tarea desde el MCP (editar_tarea).
// SIN "use server": lógica pura, sin base de datos.
//
// Las referencias a ítems son los números (1 = primero) o parte del texto del
// checklist ANTES de editar, así no importa el orden de las operaciones.
// Palomear un ítem cambia el estado de la tarea (syncTaskStatusFromChecklist,
// lib/actions/tasks.ts): todos marcados → Done, algunos → In Progress,
// ninguno → Todo. Agregar o quitar ítems NO lo cambia, igual que en el
// dashboard. statusFromChecklist predice ese resultado para la vista previa.

export interface ChecklistItemRow { id: string; text: string; is_checked: boolean; is_blocking: boolean }

export type ChecklistOp =
  | { accion: "agregar"; texto: string; bloquea?: boolean }
  | { accion: "editar"; item: string | number; texto?: string; bloquea?: boolean }
  | { accion: "marcar" | "desmarcar" | "quitar"; item: string | number }

export interface ChecklistPlan {
  adds: { text: string; is_blocking: boolean }[]
  edits: { id: string; text?: string; is_blocking?: boolean }[]
  toggles: { id: string; checked: boolean }[]
  removes: string[]
  // Cómo queda el checklist (los quitados fuera; los nuevos al final).
  after: { id: string | null; text: string; is_checked: boolean; is_blocking: boolean }[]
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()

function resolveItem(items: ChecklistItemRow[], ref: string | number): ChecklistItemRow {
  if (!items.length) throw new Error("La tarea no tiene checklist.")
  if (typeof ref === "number" || /^#?\d+$/.test(String(ref).trim())) {
    const n = Number(String(ref).replace("#", ""))
    const it = items[n - 1]
    if (!it) throw new Error(`El checklist tiene ${items.length} ítem(s); no existe el ${n}.`)
    return it
  }
  const q = norm(String(ref))
  if (!q) throw new Error("Falta indicar el ítem del checklist.")
  const exact = items.filter((i) => norm(i.text) === q)
  const hits = exact.length ? exact : items.filter((i) => norm(i.text).includes(q))
  if (!hits.length) throw new Error(`No encontré el ítem "${ref}" en el checklist.`)
  if (hits.length > 1) throw new Error(`"${ref}" coincide con varios ítems (${hits.map((h) => `"${h.text}"`).join(", ")}); usa el número.`)
  return hits[0]
}

export function planChecklist(items: ChecklistItemRow[], ops: ChecklistOp[]): ChecklistPlan {
  const state = items.map((i) => ({ ...i }))
  const byId = new Map(state.map((i) => [i.id, i]))
  const plan: ChecklistPlan = { adds: [], edits: [], toggles: [], removes: [], after: [] }
  const removed = new Set<string>()

  for (const op of ops) {
    if (op.accion === "agregar") {
      const text = op.texto.trim()
      if (!text) throw new Error("Un ítem nuevo necesita texto.")
      plan.adds.push({ text, is_blocking: !!op.bloquea })
      continue
    }
    // La referencia se resuelve contra el checklist original.
    const it = resolveItem(items, op.item)
    const cur = byId.get(it.id)!
    if (removed.has(it.id)) throw new Error(`El ítem "${it.text}" ya se quita en este mismo cambio.`)
    if (op.accion === "quitar") { removed.add(it.id); plan.removes.push(it.id) }
    else if (op.accion === "editar") {
      const edit: { id: string; text?: string; is_blocking?: boolean } = { id: it.id }
      if (op.texto !== undefined) {
        const t = op.texto.trim()
        if (!t) throw new Error("El texto del ítem no puede quedar vacío.")
        edit.text = t; cur.text = t
      }
      if (op.bloquea !== undefined) { edit.is_blocking = op.bloquea; cur.is_blocking = op.bloquea }
      if (edit.text === undefined && edit.is_blocking === undefined) throw new Error(`Indica qué cambiar del ítem "${it.text}" (texto o bloquea).`)
      plan.edits.push(edit)
    } else {
      const checked = op.accion === "marcar"
      cur.is_checked = checked
      // Un ítem tocado dos veces queda con la última; y si termina igual que
      // el original (marcar y luego desmarcar), no hay cambio neto.
      plan.toggles = plan.toggles.filter((t) => t.id !== it.id)
      if (checked !== it.is_checked) plan.toggles.push({ id: it.id, checked })
    }
  }

  plan.after = [
    ...state.filter((i) => !removed.has(i.id)).map((i) => ({ id: i.id as string | null, text: i.text, is_checked: i.is_checked, is_blocking: i.is_blocking })),
    ...plan.adds.map((a) => ({ id: null, text: a.text, is_checked: false, is_blocking: a.is_blocking })),
  ]
  return plan
}

// Estado que el dashboard le pone a la tarea tras palomear (null = sin checklist).
export function statusFromChecklist(after: { is_checked: boolean }[]): "Todo" | "In Progress" | "Done" | null {
  if (!after.length) return null
  const checked = after.filter((i) => i.is_checked).length
  return checked === after.length ? "Done" : checked > 0 ? "In Progress" : "Todo"
}
