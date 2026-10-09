import { getAgencyRadar } from "@/lib/actions/radar"
import { AgencyRadar } from "@/components/radar/agency-radar"

export const dynamic = "force-dynamic"

export default async function RadarPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams
  let snaps: Awaited<ReturnType<typeof getAgencyRadar>> = []
  let error: string | null = null
  try { snaps = await getAgencyRadar() } catch (e) { error = e instanceof Error ? e.message : String(e) }
  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
      {error
        ? <p className="text-sm text-red-600">{/radar_/.test(error) ? "Falta correr la migración 111 en Supabase." : error}</p>
        : <AgencyRadar initial={snaps} initialSelected={p ?? null} />}
    </div>
  )
}
