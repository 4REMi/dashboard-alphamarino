import { z } from "zod"
import type { McpServer, AuthInfo } from "@modelcontextprotocol/server"
import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { can } from "@/lib/permissions"

// Clientes (tabla customers), con o sin proyecto. Leer: cualquier perfil del
// equipo. Crear/editar: permiso manage_customers (admin siempre), con vista
// previa. Ingresos solo con view_project_financials.

interface ToolCtx { http?: { authInfo?: AuthInfo } }
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] })
const db = () => createAdminClient()
const STATUS = { prospecto: "Prospect", activo: "Active", inactivo: "Inactive" } as const
const STATUS_LABEL: Record<string, string> = { Prospect: "prospecto", Active: "activo", Inactive: "inactivo" }

async function me(ctx: ToolCtx) {
  const id = ctx.http?.authInfo?.extra?.profileId
  if (typeof id !== "string") throw new Error("No se pudo identificar quién está llamando esta herramienta")
  const { data } = await db().from("profiles").select("id, role, permissions").eq("id", id).single()
  if (!data) throw new Error("Perfil no encontrado")
  return data
}

async function findCustomer(q: string) {
  const s = q.trim()
  const { data } = await db().from("customers").select("*").or(`name.ilike.%${s}%,company.ilike.%${s}%,email.ilike.%${s}%`).limit(10)
  const rows = data ?? []
  const exact = rows.filter((c) => c.name.toLowerCase() === s.toLowerCase() || (c.company ?? "").toLowerCase() === s.toLowerCase())
  const hits = exact.length ? exact : rows
  if (!hits.length) throw new Error(`No encontré el cliente "${q}".`)
  if (hits.length > 1) throw new Error(`"${q}" coincide con varios clientes: ${hits.map((c) => `${c.name}${c.company ? ` (${c.company})` : ""}`).join(", ")}. Sé más específico.`)
  return hits[0]
}

const line = (c: { name: string; company: string | null; status: string; email: string | null; phone: string | null }) =>
  `${c.name}${c.company ? ` · ${c.company}` : ""} · ${STATUS_LABEL[c.status] ?? c.status}${c.email ? ` · ${c.email}` : ""}${c.phone ? ` · ${c.phone}` : ""}`

export function registerCustomerTools(server: McpServer) {
  server.registerTool(
    "buscar_clientes",
    {
      title: "Buscar clientes",
      description: "Lista o busca clientes (por nombre, empresa o email), tengan o no proyectos. Muestra estado, contacto y cuántos proyectos tienen.",
      inputSchema: z.object({
        busqueda: z.string().optional(),
        estado: z.enum(["prospecto", "activo", "inactivo"]).optional(),
        sin_proyecto: z.boolean().optional().describe("Solo clientes sin ningún proyecto"),
      }),
    },
    async ({ busqueda, estado, sin_proyecto }, ctx: ToolCtx) => {
      await me(ctx)
      let q = db().from("customers").select("id, name, company, status, email, phone, projects(id, status)").order("name").limit(100)
      if (busqueda?.trim()) q = q.or(`name.ilike.%${busqueda.trim()}%,company.ilike.%${busqueda.trim()}%,email.ilike.%${busqueda.trim()}%`)
      if (estado) q = q.eq("status", STATUS[estado])
      const { data, error } = await q
      if (error) throw new Error(error.message)
      let rows = (data ?? []) as unknown as { name: string; company: string | null; status: string; email: string | null; phone: string | null; projects: { status: string }[] }[]
      if (sin_proyecto) rows = rows.filter((c) => !c.projects?.length)
      if (!rows.length) return text("No hay clientes que coincidan.")
      return text(rows.map((c) => {
        const active = c.projects?.filter((p) => p.status === "Active").length ?? 0
        return `- ${line(c)} · ${c.projects?.length ? `${c.projects.length} proyecto(s)${active ? `, ${active} activo(s)` : ""}` : "sin proyectos"}`
      }).join("\n") + (rows.length === 100 ? "\n(mostrando 100; afina la búsqueda)" : ""))
    },
  )

  server.registerTool(
    "detalle_cliente",
    {
      title: "Detalle de un cliente",
      description: "Todo sobre un cliente: contacto, estado, fecha de alta, sus proyectos (estado, tipo, marca) y, si tienes permiso de finanzas, lo cobrado y su fee mensual.",
      inputSchema: z.object({ cliente: z.string().min(1) }),
    },
    async ({ cliente }, ctx: ToolCtx) => {
      const profile = await me(ctx)
      const c = await findCustomer(cliente)
      const { data: projects } = await db().from("projects")
        .select("id, name, status, monthly_fee, start_date, project_type:project_types(name), brand_brain:brand_brains(name)")
        .eq("customer_id", c.id).order("created_at", { ascending: false })
      const list = (projects ?? []) as unknown as { id: string; name: string; status: string; monthly_fee: number | null; start_date: string | null; project_type: { name: string } | null; brand_brain: { name: string } | null }[]
      const lines = [
        `${c.name}${c.company ? ` · ${c.company}` : ""}`,
        `Estado: ${STATUS_LABEL[c.status] ?? c.status} · cliente desde ${String(c.created_at).slice(0, 10)}`,
        `Contacto: ${c.email ?? "sin email"} · ${c.phone ?? "sin teléfono"}`,
        list.length ? `\nProyectos (${list.length}):` : "\nSin proyectos.",
        ...list.map((p) => `- ${p.name} · ${p.status}${p.project_type ? ` · ${p.project_type.name}` : ""}${p.brand_brain ? ` · marca ${p.brand_brain.name}` : ""}${p.start_date ? ` · desde ${p.start_date}` : ""}`),
      ]
      if (list.length && can(profile as never, "view_project_financials")) {
        const { data: inc } = await db().from("income").select("amount, date").in("project_id", list.map((p) => p.id))
        const total = (inc ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)
        const year = new Date().getFullYear().toString()
        const ytd = (inc ?? []).filter((r) => String(r.date).startsWith(year)).reduce((s, r) => s + Number(r.amount ?? 0), 0)
        const fee = list.filter((p) => p.status === "Active").reduce((s, p) => s + Number(p.monthly_fee ?? 0), 0)
        const usd = (n: number) => `USD ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
        lines.push(`\nFinanzas: cobrado ${usd(total)} en total · ${usd(ytd)} en ${year} · fee mensual activo ${usd(fee)}`)
      }
      return text(lines.join("\n"))
    },
  )

  const Datos = {
    nombre: z.string().min(1).optional(),
    empresa: z.string().optional(),
    email: z.string().email().optional(),
    telefono: z.string().optional(),
    estado: z.enum(["prospecto", "activo", "inactivo"]).optional(),
  }

  server.registerTool(
    "crear_cliente",
    {
      title: "Crear cliente",
      description: "Da de alta un cliente (sin proyecto). Estado por defecto: prospecto. Sin confirmar: true solo muestra lo que crearía. Requiere permiso de administrar clientes.",
      inputSchema: z.object({ ...Datos, nombre: z.string().min(1), confirmar: z.boolean().default(false) }),
    },
    async (a, ctx: ToolCtx) => {
      const profile = await me(ctx)
      if (!can(profile as never, "manage_customers")) throw new Error("No tienes permiso para administrar clientes.")
      const { data: dup } = await db().from("customers").select("name").ilike("name", a.nombre.trim()).limit(1)
      const row = { name: a.nombre.trim(), company: a.empresa?.trim() || null, email: a.email?.trim() || null, phone: a.telefono?.trim() || null, status: STATUS[a.estado ?? "prospecto"] }
      const desc = line(row)
      if (!a.confirmar) return text(`Crearía:\n- ${desc}${dup?.length ? `\n⚠️ Ya existe un cliente llamado "${dup[0].name}".` : ""}\n\nNo se creó nada. Si es correcto, vuelve a llamar con confirmar: true.`)
      const { error } = await db().from("customers").insert(row)
      if (error) throw new Error(error.message)
      revalidatePath("/customers")
      return text(`✅ Cliente creado: ${desc}`)
    },
  )

  server.registerTool(
    "editar_cliente",
    {
      title: "Editar cliente",
      description: "Cambia nombre, empresa, email, teléfono o estado de un cliente; solo lo indicado. Sin confirmar: true solo muestra antes → después. Requiere permiso de administrar clientes.",
      inputSchema: z.object({ cliente: z.string().min(1), ...Datos, confirmar: z.boolean().default(false) }),
    },
    async (a, ctx: ToolCtx) => {
      const profile = await me(ctx)
      if (!can(profile as never, "manage_customers")) throw new Error("No tienes permiso para administrar clientes.")
      const c = await findCustomer(a.cliente)
      const patch: Record<string, unknown> = {}
      if (a.nombre != null) patch.name = a.nombre.trim()
      if (a.empresa != null) patch.company = a.empresa.trim() || null
      if (a.email != null) patch.email = a.email.trim() || null
      if (a.telefono != null) patch.phone = a.telefono.trim() || null
      if (a.estado) patch.status = STATUS[a.estado]
      if (!Object.keys(patch).length) throw new Error("No indicaste nada que cambiar.")
      const after = { ...c, ...patch }
      const desc = `Antes: ${line(c)}\nDespués: ${line(after)}`
      if (!a.confirmar) return text(`${desc}\n\nNo se cambió nada. Si es correcto, vuelve a llamar con confirmar: true.`)
      const { error } = await db().from("customers").update(patch).eq("id", c.id)
      if (error) throw new Error(error.message)
      revalidatePath("/customers"); revalidatePath(`/customers/${c.id}`)
      return text(`✅ Cliente actualizado.\n${desc}`)
    },
  )
}
