import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createProject } from "@/lib/actions/projects"
import { can } from "@/lib/permissions"
import { requireEditor, text, confirmHint, type ToolCtx } from "@/lib/mcp/meta-tools"

// Crear proyectos desde Claude: misma función que el modal "Nuevo proyecto"
// (createProject), con el perfil de quien llama. Todo se busca por nombre y
// nunca adivina (0 o 2+ coincidencias → error con opciones). Dos pasos: sin
// `confirmar: true` solo describe lo que crearía. Solo admin/subadmin; valor
// y fee solo si esa persona puede ver finanzas de proyecto.

const db = () => createAdminClient()

function pick<T extends Record<string, unknown>>(rows: T[], q: string, label: string, field = "name"): T {
  const v = (r: T) => String(r[field] ?? "").toLowerCase()
  const s = q.trim().toLowerCase()
  const exact = rows.filter((r) => v(r) === s)
  if (exact.length === 1) return exact[0]
  const part = rows.filter((r) => v(r).includes(s))
  if (part.length === 1) return part[0]
  if (!part.length) throw new Error(`No encontré ${label} "${q}".${rows.length ? ` Opciones: ${rows.slice(0, 15).map((r) => String(r[field])).join(", ")}` : ""}`)
  throw new Error(`"${q}" coincide con varios (${label}): ${part.map((r) => String(r[field])).join(", ")}. Sé más específico.`)
}

export function registerProjectTools(server: McpServer) {
  server.registerTool(
    "crear_proyecto",
    {
      title: "Crear proyecto",
      description: "Crea un proyecto como el modal 'Nuevo proyecto': nombre, tipo (define fases y tareas), cliente, Brand Brain, equipo (se agrega antes de crear las tareas para que se asignen solas por puesto), fases (todas las del tipo salvo las que se quiten), fechas, valor y fee mensual, y el ALCANCE (obligatorio): ofertas del catálogo por nombre, entregables propios, o interno: true para proyectos internos sin alcance de cliente. Todo por nombre. Sin confirmar: true solo muestra el plan. Solo admin/subadmin.",
      inputSchema: z.object({
        nombre: z.string().min(2),
        tipo: z.string().optional().describe("Tipo de proyecto, ej. Paid Media, Shopify"),
        cliente: z.string().optional(),
        brand_brain: z.string().optional(),
        equipo: z.array(z.string()).optional().describe("Nombres de las personas (quien llama se agrega siempre)"),
        quitar_fases: z.array(z.string()).optional().describe("Fases del tipo que NO se incluyen"),
        fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        valor: z.number().nonnegative().optional().describe("Valor del proyecto (USD)"),
        fee_mensual: z.number().nonnegative().optional().describe("Fee mensual (USD)"),
        descripcion: z.string().optional(),
        ofertas: z.array(z.string()).optional().describe("Ofertas del catálogo por nombre (ver listar_ofertas)"),
        entregables_propios: z.array(z.object({
          texto: z.string().min(1),
          cadencia: z.enum(["once", "monthly", "quarterly", "biannual"]).default("monthly").describe("once = una vez; monthly = por periodo; quarterly/biannual = cada 3/6 periodos"),
          cantidad: z.number().int().positive().default(1),
        })).optional(),
        interno: z.boolean().optional().describe("Proyecto interno de la agencia: no lleva alcance de cliente"),
        confirmar: z.boolean().default(false),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const profileId = await requireEditor(ctx)
      if (!a.interno && !a.ofertas?.length && !a.entregables_propios?.length) throw new Error("Falta el alcance: indica ofertas, entregables_propios, o interno: true.")
      const { data: me } = await db().from("profiles").select("role, permissions").eq("id", profileId).single()
      if ((a.valor != null || a.fee_mensual != null) && !can(me as never, "view_project_financials")) throw new Error("No tienes permiso para fijar valor o fee del proyecto.")

      const [{ data: types }, { data: customers }, { data: brains }, { data: people }] = await Promise.all([
        db().from("project_types").select("id, name, default_phase_set_id"),
        db().from("customers").select("id, name"),
        db().from("brand_brains").select("id, name"),
        db().from("profiles").select("id, full_name, position"),
      ])
      // Solo nombre y entregables de las ofertas; nunca precios.
      const { data: offerRows } = a.interno || !a.ofertas?.length ? { data: [] } : await db().from("service_offers").select("id, name, deliverables").eq("status", "active")
      const offers = a.interno ? [] : (a.ofertas ?? []).map((n) => pick((offerRows ?? []) as { id: string; name: string; deliverables: { text: string; control_text?: string | null; cadence: string; quantity: number | null }[] | null }[], n, "oferta"))
      const customs = a.interno ? [] : a.entregables_propios ?? []
      const CAD: Record<string, string> = { once: "una vez", monthly: "por periodo", quarterly: "cada 3 periodos", biannual: "cada 6 periodos", continuous: "continuo" }
      const type = a.tipo ? pick(types ?? [], a.tipo, "tipo de proyecto") : null
      const customer = a.cliente ? pick(customers ?? [], a.cliente, "cliente") : null
      const brain = a.brand_brain ? pick(brains ?? [], a.brand_brain, "Brand Brain") : null
      const members = (a.equipo ?? []).map((n) => pick((people ?? []) as { id: string; full_name: string; position: string | null }[], n, "persona", "full_name"))

      // Fases del tipo (las mismas que el modal marca por defecto).
      let phases: { id: string; name: string }[] = []
      if (type?.default_phase_set_id) {
        const { data } = await db().from("phase_set_phases").select("id, name, phase_order").eq("phase_set_id", type.default_phase_set_id).order("phase_order")
        phases = (data ?? []) as { id: string; name: string }[]
      }
      const removed = (a.quitar_fases ?? []).map((n) => pick(phases, n, "fase"))
      const keep = phases.filter((p) => !removed.some((r) => r.id === p.id))

      const plan = [
        `Proyecto "${a.nombre}"${type ? ` · ${type.name}` : " · sin tipo"}${customer ? ` · cliente ${customer.name}` : ""}${brain ? ` · marca ${brain.name}` : ""}`,
        `Equipo: ${members.length ? members.map((m) => `${m.full_name}${m.position ? ` (${m.position})` : ""}`).join(", ") : "solo tú"} (tú te agregas siempre)`,
        phases.length ? `Fases (${keep.length} de ${phases.length}): ${keep.map((p) => p.name).join(" → ")}${removed.length ? ` · sin: ${removed.map((r) => r.name).join(", ")}` : ""}` : "Sin fases (el tipo no tiene plantilla)",
        a.fecha_inicio || a.fecha_fin ? `Fechas: ${a.fecha_inicio ?? "—"} → ${a.fecha_fin ?? "—"}` : "",
        a.interno ? "Alcance: proyecto interno (sin alcance de cliente)" : `Alcance:\n${[
          ...offers.map((o) => `- Oferta ${o.name}: ${(o.deliverables ?? []).map((d) => `${d.quantity ?? 1}× ${d.control_text?.trim() || d.text} (${CAD[d.cadence] ?? d.cadence})`).join(", ") || "sin entregables"}`),
          ...customs.map((c) => `- Propio: ${c.cantidad}× ${c.texto} (${CAD[c.cadencia]})`),
        ].join("\n")}`,
        a.valor != null || a.fee_mensual != null ? `Valor: ${a.valor ?? "—"} · Fee mensual: ${a.fee_mensual ?? "—"}` : "",
      ].filter(Boolean).join("\n")
      if (!a.confirmar) return text(`Crearía:\n${plan}${confirmHint}`)

      const fd = new FormData()
      fd.set("name", a.nombre)
      if (type) fd.set("project_type_id", type.id)
      if (customer) fd.set("customer_id", customer.id)
      if (brain) fd.set("brand_brain_id", brain.id)
      if (a.fecha_inicio) fd.set("start_date", a.fecha_inicio)
      if (a.fecha_fin) fd.set("end_date", a.fecha_fin)
      if (a.valor != null) fd.set("project_value", String(a.valor))
      if (a.fee_mensual != null) fd.set("monthly_fee", String(a.fee_mensual))
      if (a.descripcion) fd.set("description", a.descripcion)
      fd.set("is_internal", String(!!a.interno))
      fd.set("offer_ids_json", JSON.stringify(offers.map((o) => o.id)))
      fd.set("custom_deliverables_json", JSON.stringify(customs.map((c) => ({ text: c.texto, cadence: c.cadencia, quantity: c.cantidad }))))
      const project = await createProject(fd, keep.length ? keep.map((p) => p.id) : undefined, members.map((m) => m.id), profileId)
      return text(`✅ Proyecto creado: "${a.nombre}" [id ${project.id}]\n${plan}`)
    },
  )
}
