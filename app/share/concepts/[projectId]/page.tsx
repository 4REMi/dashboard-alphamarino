import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { ANGLE_GUIDE, AWARENESS_LABELS } from "@/lib/constants/creatives"
import { ClientPortalApp, type PortalData, type Servicio, type Concepto, type Pieza } from "@/components/share/client-portal-app"
import type { AdCloneLine } from "@/lib/types"

interface Props {
  params: Promise<{ projectId: string }>
}

const FUNNEL_LABELS: Record<string, string> = {
  TOF: "Audiencia fría",
  MOF: "Audiencia tibia",
  BOF: "Audiencia caliente",
}

function formatMonth(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  const label = d.toLocaleDateString("es-MX", { month: "long", year: "numeric" })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export default async function ShareConceptsPage({ params }: Props) {
  const { projectId } = await params
  const supabase = createAdminClient()

  const [projectRes, conceptsRes, assetsRes, settingsRes, scriptsRes, cyclesRes] = await Promise.all([
    supabase
      .from("projects")
      .select("name, brand_brain_id, customer:customers(name, company)")
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
               client_status, client_feedback, concept_id`)
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
      .select("id, concept_id, adapted_script, script_reviews")
      .eq("project_id", projectId)
      .not("adapted_script", "is", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("paid_media_cycles")
      .select("id, cycle_month, is_active")
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

  const concepts   = conceptsRes.data ?? []
  const assets     = assetsRes.data ?? []
  const briefsData = scriptsRes.data ?? []

  // Fetch brand lines ("servicios")
  const brandLines: { id: string; name: string; color: string | null; position: number }[] =
    (project as any).brand_brain_id
      ? ((await supabase.from("brand_lines").select("id, name, color, position").eq("brand_brain_id", (project as any).brand_brain_id).order("position")).data ?? [])
      : []

  // ── Normalize scripts (guiones) — one per script, keyed independently ──
  type ScriptEntry = { conceptId: string; briefId: string; scriptKey: string; lines: AdCloneLine[]; client_status: string | null; client_feedback: string | null }
  const scriptEntries: ScriptEntry[] = []
  for (const b of briefsData) {
    const raw = b.adapted_script as Record<string, AdCloneLine[]> | AdCloneLine[] | null
    if (!raw) continue
    const reviews = (b.script_reviews as Record<string, { client_status: string | null; client_feedback: string | null }>) ?? {}
    if (Array.isArray(raw)) {
      if (raw.length > 0) {
        const r = reviews["_single"]
        scriptEntries.push({ conceptId: b.concept_id, briefId: b.id, scriptKey: "_single", lines: raw, client_status: r?.client_status ?? null, client_feedback: r?.client_feedback ?? null })
      }
    } else {
      Object.entries(raw).forEach(([adId, lines]) => {
        if (lines?.length) {
          const r = reviews[adId]
          scriptEntries.push({ conceptId: b.concept_id, briefId: b.id, scriptKey: adId, lines, client_status: r?.client_status ?? null, client_feedback: r?.client_feedback ?? null })
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

    const vigencia: Concepto["vigencia"] =
      c.status === "Evergreen" ? "evergreen"
      : !c.cycle_id || c.cycle_id === activeCycle?.id ? "actual"
      : "archivado"
    const mes = vigencia === "archivado" && c.cycle_id
      ? formatMonth(cycleById.get(c.cycle_id)?.cycle_month ?? "")
      : null

    const piezas: Pieza[] = [
      ...scripts.map((s): Pieza => ({
        id: `${s.briefId}:${s.scriptKey}`,
        briefId: s.briefId,
        scriptKey: s.scriptKey,
        tipo: "guion",
        titulo: `Guion VO — "${c.name || "Sin título"}"`,
        sub: "Paso 1 · se produce el video al aprobarlo",
        guion: s.lines.map((l, i) => ({ n: i + 1, t: l.adapted })),
        client_status: s.client_status,
        client_feedback: s.client_feedback,
      })),
      ...conceptAssets.map((a): Pieza => {
        const isVideo = a.file_type === "video" || /video/i.test(a.format ?? "")
        const meta = [a.platform, a.format].filter(Boolean).join(" · ")
        const mediaUrl = a.file_path
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/${a.file_path}`
          : a.asset_url
        return {
          id: a.id,
          assetId: a.id,
          tipo: isVideo ? "video" : "imagen",
          titulo: a.format || (isVideo ? "Video" : "Imagen"),
          sub: meta || (isVideo ? "Video" : "Imagen estática"),
          mediaUrl: mediaUrl ?? null,
          client_status: a.client_status,
          client_feedback: a.client_feedback,
        }
      }),
    ]

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

  const data: PortalData = {
    clienteNombre: clientName ?? projectName,
    logoUrl,
    cicloActualLabel: activeCycle ? formatMonth(activeCycle.cycle_month) : null,
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
