import type { SupabaseClient } from "@supabase/supabase-js"

// Evita que se vuelvan a capturar ciclos traslapados (cada día pertenece a
// un solo ciclo — las métricas diarias se asignan por fecha). Si ya hay
// traslapes viejos, se corrigen con "Reparar ciclos".
export async function assertNoCycleOverlap(
  supabase: SupabaseClient,
  projectId: string,
  start: string,
  end: string,
  excludeId?: string,
): Promise<void> {
  let q = supabase.from("paid_media_cycles").select("id, start_date, end_date")
    .eq("project_id", projectId).lte("start_date", end).gte("end_date", start)
  if (excludeId) q = q.neq("id", excludeId)
  const { data } = await q.limit(1)
  const hit = data?.[0]
  if (hit) throw new Error(`Las fechas se traslapan con el ciclo ${hit.start_date} → ${hit.end_date}. Cada día solo puede pertenecer a un ciclo.`)
}
