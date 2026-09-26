import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { ANGLE_GUIDE, AWARENESS_LABELS } from "@/lib/constants/creatives"
import { ClientPortalApp, type PortalData, type Servicio, type Concepto, type Pieza } from "@/components/share/client-portal-app"
import type { AdCloneLine } from "@/lib/types"
import { formatCycleRange } from "@/lib/utils"

interface Props {
  params: Promise<{ projectId: string }>
}

const FUNNEL_LABELS: Record<string, string> = {
  TOF: "Audiencia fría",
  MOF: "Audiencia tibia",
  BOF: "Audiencia caliente",
}

function resultLabel(type: string | null): string {
  if (!type) return "Resultados"
  if (type.includes("messaging")) return "Conversaciones"
  if (type.includes("lead")) return "Leads"
  if (type.includes("purchase")) return "Compras"
  if (type.includes("link_click")) return "Clics"
  if (type.includes("registration")) return "Registros"
  return "Resultados"
}

export default async function ShareConceptsPage({ params }: Props) {
  const { projectId } = await params
  const supabase = createAdminClient()

  const [projectRes, conceptsRes, assetsRes, settingsRes, scriptsRes, cyclesRes] = await Promise.all([
    supabase
      .from("projects")
      .select(`name, brand_brain_id, customer:customers(name, company),
                brand_brain:brand_brains(brand_lines(id, name, color, position))`)
      .eq("id", projectId)
      .single(),
    supabase
      .from("creative_concepts")
      .select(`id, name, angle_type, organizing_principle, target_persona, product_service,
               pain_point, objection, why_it_works, transformation, funnel_stage, awareness_stage, status, brand_line_id, cycle_id`)
      .eq("project_id", projectId)
      .in("status", ["Active", "Evergreen"])
      .order("created_at", { ascending: false }),
    supabase
      .from("creative_assets")
      .select(`id, format, platform, asset_url, file_path, thumbnail_path, file_type, brief_id,
               client_status, client_feedback, concept_id, created_at, revises_asset_id`)
      .eq("project_id", projectId)
      .eq("client_visible", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("workspace_settings")
      .select("logo_url")
      .eq("id", "default")
      .maybeSingle(),
    supabase
      .from("creative_briefs")
      .select("id, concept_id, title, adapted_script, script_reviews, script_titles, created_at")
      .eq("project_id", projectId)
      .not("adapted_script", "is", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("paid_media_cycles")
      .select("id, start_date, end_date, is_active, real_spend, real_results, roas_real, cpa_real")
      .eq("project_id", projectId),
  ])

  if (projectRes.error || !projectRes.data) notFound()

  const project  = projectRes.data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customer = project.customer as any
  const clientName  = customer?.company || customer?.name || null
  const projectName = project.name
  const logoUrl     = settingsRes.data?.logo_url ?? null

  const cycles       = cyclesRes.data ?? []
  const activeCycle  = cycles.find((c) => c.is_active) ?? null
  const cycleById    = new Map(cycles.map((c) => [c.id, c]))

  // Ciclos a los que pertenece cada concepto (un concepto que continúa
  // pertenece a varios). Si la tabla aún no existe, se usa su cycle_id.
  const { data: membershipRows, error: membershipError } = await supabase
    .from("creative_concept_cycles").select("concept_id, cycle_id").eq("project_id", projectId)
  const cyclesByConcept = new Map<string, string[]>()
  for (const r of membershipError ? [] : membershipRows ?? []) {
    if (!cyclesByConcept.has(r.concept_id)) cyclesByConcept.set(r.concept_id, [])
    cyclesByConcept.get(r.concept_id)!.push(r.cycle_id)
  }

  const concepts   = conceptsRes.data ?? []
  const assets     = assetsRes.data ?? []
  const briefsData = scriptsRes.data ?? []

  // Brand lines ("servicios") — vienen embebidas en el fetch de projects
  // de arriba (nested select vía brand_brain), sin round-trip extra.
  const brandBrain = (project as any).brand_brain as { brand_lines?: { id: string; name: string; color: string | null; position: number }[] } | null
  const brandLines = [...(brandBrain?.brand_lines ?? [])].sort((a, b) => a.position - b.position)

  // ── Normalize scripts (guiones) — one per script, keyed independently ──
  type ScriptEntry = { conceptId: string; briefId: string; scriptKey: string; title: string | null; lines: AdCloneLine[]; client_status: string | null; client_feedback: string | null; createdAt: string }
  const briefTitle = new Map(briefsData.map((b) => [b.id as string, (b.title as string | null) ?? null]))
  const scriptEntries: ScriptEntry[] = []
  for (const b of briefsData) {
    const raw = b.adapted_script as Record<string, AdCloneLine[]> | AdCloneLine[] | null
    if (!raw) continue
    const reviews = (b.script_reviews as Record<string, { client_status: string | null; client_feedback: string | null }>) ?? {}
    if (Array.isArray(raw)) {
      if (raw.length > 0) {
        const r = reviews["_single"]
        scriptEntries.push({ conceptId: b.concept_id, briefId: b.id, scriptKey: "_single", title: (b.script_titles as Record<string, string> | null)?.["_single"] ?? null, lines: raw, client_status: r?.client_status ?? null, client_feedback: r?.client_feedback ?? null, createdAt: b.created_at })
      }
    } else {
      Object.entries(raw).forEach(([adId, lines]) => {
        if (lines?.length) {
          const r = reviews[adId]
          scriptEntries.push({ conceptId: b.concept_id, briefId: b.id, scriptKey: adId, title: (b.script_titles as Record<string, string> | null)?.[adId] ?? null, lines, client_status: r?.client_status ?? null, client_feedback: r?.client_feedback ?? null, createdAt: b.created_at })
        }
      })
    }
  }
  const scriptsByConcept = new Map<string, ScriptEntry[]>()
  for (const s of scriptEntries) {
    if (!scriptsByConcept.has(s.conceptId)) scriptsByConcept.set(s.conceptId, [])
    scriptsByConcept.get(s.conceptId)!.push(s)
  }
  const assetsByConcept = new Map<string, typeof assets>()
  for (const a of assets) {
    if (!a.concept_id) continue
    if (!assetsByConcept.has(a.concept_id)) assetsByConcept.set(a.concept_id, [])
    assetsByConcept.get(a.concept_id)!.push(a)
  }

  // ── Build Concepto[] with piezas ──
  function buildConcepto(c: (typeof concepts)[number]): Concepto {
    const scripts = scriptsByConcept.get(c.id) ?? []
    const conceptAssets = assetsByConcept.get(c.id) ?? []
    const angleEntry = ANGLE_GUIDE.find((a) => a.name === c.angle_type) ?? null

    const memberCycles = cyclesByConcept.get(c.id) ?? []
    const vigencia: Concepto["vigencia"] =
      c.status === "Evergreen" ? "evergreen"
      : memberCycles.length === 0 ? (!c.cycle_id || c.cycle_id === activeCycle?.id ? "actual" : "archivado")
      : activeCycle && memberCycles.includes(activeCycle.id) ? "actual"
      : "archivado"
    // El último ciclo en el que estuvo (no el de origen).
    const lastCycleId = memberCycles.length
      ? memberCycles.map((id) => cycleById.get(id)).filter(Boolean).sort((a, b) => (a!.start_date < b!.start_date ? 1 : -1))[0]?.id ?? c.cycle_id
      : c.cycle_id
    const archivedCycle = vigencia === "archivado" && lastCycleId ? cycleById.get(lastCycleId) : null
    const mes = archivedCycle
      ? formatCycleRange(archivedCycle.start_date, archivedCycle.end_date)
      : null

    const piezas: Pieza[] = [
      ...scripts.map((s, i): Pieza => ({
        id: `${s.briefId}:${s.scriptKey}`,
        briefId: s.briefId,
        scriptKey: s.scriptKey,
        tipo: "guion",
        titulo: s.title || `Guion ${scripts.length > 1 ? `opción ${i + 1}` : "VO"}`,
        sub: "Paso 1 · se produce el video al aprobarlo",
        guion: s.lines.map((l, i) => ({ n: i + 1, t: l.adapted })),
        client_status: s.client_status,
        client_feedback: s.client_feedback,
        createdAt: s.createdAt,
      })),
      ...conceptAssets.map((a, i): Pieza => {
        const isVideo = a.file_type === "video" || /video/i.test(a.format ?? "")
        const meta = [a.platform, a.format].filter(Boolean).join(" · ")
        const mediaUrl = a.file_path
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/${a.file_path}`
          : a.asset_url
        // El thumbnail es un JPG liviano (generado al subir el asset) —
        // el grid/carrusel lo usa como preview en vez del archivo
        // original completo, que solo se carga al abrir el lightbox o
        // darle play. Sin thumbnail (asset viejo, o "banco de creativos"
        // que no genera uno), cae de vuelta al original.
        const thumbUrl = a.thumbnail_path
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/${a.thumbnail_path}`
          : mediaUrl
        return {
          id: a.id,
          assetId: a.id,
          tipo: isVideo ? "video" : "imagen",
          // Antes "Video / Video": ahora el brief + número de pieza.
          titulo: `${(a.brief_id && briefTitle.get(a.brief_id)) || (isVideo ? "Video" : "Imagen")} · pieza ${conceptAssets.length - i}`,
          nuevaVersion: !!a.revises_asset_id,
          sub: meta || (isVideo ? "Video" : "Imagen estática"),
          mediaUrl: mediaUrl ?? null,
          thumbUrl: thumbUrl ?? null,
          client_status: a.client_status,
          client_feedback: a.client_feedback,
          createdAt: a.created_at,
        }
      }),
    ].sort((x, y) => (x.createdAt < y.createdAt ? 1 : x.createdAt > y.createdAt ? -1 : 0))

    return {
      id: c.id,
      nombre: c.name,
      angulo: c.angle_type,
      angleEmoji: angleEntry?.emoji ?? null,
      funnelCode: c.funnel_stage,
      funnel: c.funnel_stage ? FUNNEL_LABELS[c.funnel_stage] ?? c.funnel_stage : null,
      vigencia,
      mes,
      estrategia: {
        principio: c.organizing_principle,
        quien: c.target_persona,
        awareness: c.awareness_stage != null ? `${c.awareness_stage} — ${AWARENESS_LABELS[c.awareness_stage] ?? ""}` : null,
        teoriaGuiding: angleEntry?.guiding_question ?? null,
        teoriaMecanismo: angleEntry?.mechanism ?? null,
        porque: c.why_it_works,
        problema: c.pain_point,
        objecion: c.objection,
        transformacion: c.transformation,
      },
      piezas,
    }
  }

  const conceptosPorLinea = new Map<string | null, Concepto[]>()
  for (const c of concepts) {
    const key = c.brand_line_id ?? null
    if (!conceptosPorLinea.has(key)) conceptosPorLinea.set(key, [])
    conceptosPorLinea.get(key)!.push(buildConcepto(c))
  }

  const servicios: Servicio[] = [
    ...brandLines.map((l): Servicio => ({
      id: l.id,
      nombre: l.name,
      color: l.color,
      conceptos: conceptosPorLinea.get(l.id) ?? [],
    })),
    ...(conceptosPorLinea.get(null)?.length
      ? [{ id: "__general__", nombre: "General", color: null, conceptos: conceptosPorLinea.get(null)! }]
      : []),
  ].filter((s) => s.conceptos.length > 0)

  // Métricas del ciclo actual en Meta (el cliente sí las ve).
  let metricas: PortalData["metricas"] = null
  if (activeCycle) {
    const [{ data: stats }, { data: integ }] = await Promise.all([
      supabase.from("meta_ad_daily_stats").select("spend, results, results_type, impressions, link_clicks").eq("project_id", projectId).eq("cycle_id", activeCycle.id).range(0, 19999),
      supabase.from("project_integrations").select("currency").eq("project_id", projectId).eq("platform", "meta").maybeSingle(),
    ])
    if (stats?.length) {
      const sum = (k: "spend" | "results" | "impressions" | "link_clicks") => stats.reduce((n, r) => n + Number(r[k] ?? 0), 0)
      const spend = sum("spend"), results = sum("results")
      const type = stats.find((r) => r.results_type)?.results_type ?? null
      metricas = {
        inversion: spend,
        resultados: results,
        resultadoLabel: resultLabel(type),
        costoPorResultado: results > 0 ? spend / results : null,
        impresiones: sum("impressions"),
        clics: sum("link_clicks"),
        moneda: (integ?.currency as string | null) ?? null,
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const data: PortalData = {
    clienteNombre: clientName ?? projectName,
    logoUrl,
    cicloActualLabel: activeCycle ? formatCycleRange(activeCycle.start_date, activeCycle.end_date) : null,
    diasRestantes: activeCycle ? Math.max(0, Math.round((Date.parse(activeCycle.end_date) - Date.parse(today)) / 86_400_000)) : null,
    metricas,
    // Resumen manual (multicanal) de cada ciclo pasado, por etiqueta.
    ciclosResumen: Object.fromEntries(cycles.filter((c) => !c.is_active).map((c) => [formatCycleRange(c.start_date, c.end_date), {
      inversion: c.real_spend as number | null, resultados: c.real_results as number | null,
      roas: c.roas_real as number | null, cpa: c.cpa_real as number | null, inicio: c.start_date as string,
    }])),
    servicios,
  }

  if (servicios.length === 0) {
    return (
      <div className="min-h-screen bg-[#f5f6fa] flex items-center justify-center px-6 text-center">
        <p className="text-sm text-slate-400">Sin contenido disponible por el momento.</p>
      </div>
    )
  }

  return <ClientPortalApp data={data} />
}
