import { createAdminClient } from "@/lib/supabase/admin"

// Resolución de proyecto por nombre, común a todas las herramientas MCP.
// Criterio: coincidencia exacta (sin importar mayúsculas/acentos) antes que
// parcial; si quedan varios, gana el activo, luego cualquiera no archivado.
// Un archivado solo se elige si es el único que coincide. Ambigüedad real
// entre activos sí es error (el chat pide ser más específico).
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()
const STATUS: Record<string, string> = { Active: "activo", Completed: "completado", Archived: "archivado" }

export async function resolveProject(name: string, opts: { onlyActive?: boolean } = {}): Promise<{ id: string; name: string; status: string }> {
  const { data } = await createAdminClient().from("projects").select("id, name, status")
  let rows = (data ?? []) as { id: string; name: string; status: string }[]
  if (opts.onlyActive) rows = rows.filter((r) => r.status === "Active")
  const q = norm(name)
  const exact = rows.filter((r) => norm(r.name) === q)
  let hits = exact.length ? exact : rows.filter((r) => norm(r.name).includes(q))
  if (!hits.length) throw new Error(`No encontré ${opts.onlyActive ? "el proyecto activo" : "el proyecto"} "${name}".`)
  for (const keep of [(r: { status: string }) => r.status === "Active", (r: { status: string }) => r.status !== "Archived"]) {
    if (hits.length > 1 && hits.some(keep)) hits = hits.filter(keep)
  }
  if (hits.length > 1) throw new Error(`"${name}" coincide con varios proyectos: ${hits.map((h) => `${h.name} (${STATUS[h.status] ?? h.status})`).join(", ")}. Sé más específico.`)
  return hits[0]
}
