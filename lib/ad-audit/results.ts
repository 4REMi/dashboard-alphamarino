// «Resultado» de cada conjunto auditado. SIN "use server"; lógica pura.
// Ver docs/agent-guides/auditorias.md.
//
// 1. Corrección manual (audit_adsets.result_override), si la hay.
// 2. Si no, lo que optimiza el conjunto: resolveResultSpec (el MISMO
//    criterio que la columna Resultados del Ads Manager y el Creative
//    Tracker, lib/meta/result-spec.ts).
// 3. Si Meta no lo dice, la acción más probable entre las que de verdad
//    aparecen en los datos (FALLBACK_PRIORITY).
// Como la captura guarda TODAS las acciones por anuncio y día, cualquier
// tipo de resultado (mensajes, leads, llamadas, eventos personalizados…)
// se puede calcular sin volver a capturar ni programar nada.

import { FALLBACK_PRIORITY, resolveResultSpec, type PromotedObject } from "@/lib/meta/result-spec"
import type { ResultKind } from "@/lib/ad-audit/metrics"

export interface ResultOption { type: string; label: string; total: number }

export interface AdsetResult {
  actionTypes: string[] | null       // null cuando el resultado es un campo
  field: "reach" | "impressions" | null
  kind: ResultKind
  label: string                      // «Conversaciones iniciadas», «Compras»…
  source: "manual" | "auto" | "fallback"
  options: ResultOption[]            // acciones con datos, para corregir a mano
}

const LABELS: [RegExp, string][] = [
  [/messaging_conversation_started/, "Conversaciones iniciadas"],
  [/messaging_purchase_conversion/, "Compras por mensaje"],
  [/messaging_appointment_conversion/, "Citas por mensaje"],
  [/messaging_first_reply/, "Primeras respuestas"],
  [/total_messaging_connection/, "Conexiones de mensajes"],
  [/purchase/, "Compras"],
  [/lead/, "Leads"],
  [/complete_registration/, "Registros"],
  [/total_call|quality_call/, "Llamadas"],
  [/schedule/, "Citas"],
  [/contact/, "Contactos"],
  [/submit_application/, "Solicitudes"],
  [/subscribe/, "Suscripciones"],
  [/start_trial/, "Pruebas iniciadas"],
  [/add_to_cart/, "Agregados al carrito"],
  [/initiate(d)?_checkout/, "Pagos iniciados"],
  [/view_content/, "Vistas de contenido"],
  [/landing_page_view/, "Visitas a la página"],
  [/link_click/, "Clics en el enlace"],
  [/video_view/, "Reproducciones de 3 s"],
  [/post_engagement|page_engagement/, "Interacciones"],
  [/^like$|page_like/, "Me gusta de la página"],
  [/app_install/, "Instalaciones"],
  [/offsite_conversion\.custom\./, "Conversión personalizada"],
  [/fb_pixel_custom/, "Evento personalizado"],
]

export function actionLabel(type: string): string {
  if (type === "reach") return "Alcance"
  if (type === "impressions") return "Impresiones"
  return LABELS.find(([re]) => re.test(type))?.[1] ?? type
}

export function kindOf(type: string | null): ResultKind {
  if (!type) return "none"
  if (/purchase/.test(type) && !/messaging/.test(type)) return "purchase"
  if (/lead/.test(type)) return "lead"
  if (/messaging/.test(type)) return "message"
  if (/video_view|post_engagement|page_engagement|^like$|page_like|^reach$|^impressions$/.test(type)) return "none"
  return "other"
}

// Acciones que tiene sentido ofrecer como resultado (sin ruido de
// interacciones sueltas ni variantes duplicadas de lo mismo).
const NOISE = /^(post_reaction|comment|onsite_conversion\.post_save|post|photo_view|video_view_2s)$/

export function resolveAdsetResult(input: {
  objective: string | null
  optimizationGoal: string | null
  promotedObject: PromotedObject | null
  override: string | null
  actionTotals: Record<string, number>
}): AdsetResult {
  const options = Object.entries(input.actionTotals)
    .filter(([t, n]) => n > 0 && !NOISE.test(t))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([type, total]) => ({ type, label: actionLabel(type), total }))

  if (input.override) {
    const field = input.override === "reach" || input.override === "impressions" ? input.override : null
    return {
      actionTypes: field ? null : [input.override], field,
      kind: kindOf(input.override), label: actionLabel(input.override), source: "manual", options,
    }
  }

  const spec = resolveResultSpec(input.objective, input.optimizationGoal, input.promotedObject)
  if (spec?.kind === "field") {
    return { actionTypes: null, field: spec.field, kind: "none", label: actionLabel(spec.field), source: "auto", options }
  }
  if (spec?.kind === "action") {
    // De las variantes (omni_purchase, purchase, fb_pixel_purchase…), la
    // etiqueta y el tipo salen de la primera que tenga datos.
    const present = spec.actionTypes.find((t) => (input.actionTotals[t] ?? 0) > 0) ?? spec.actionTypes[0]
    return { actionTypes: spec.actionTypes, field: null, kind: kindOf(present), label: actionLabel(present), source: "auto", options }
  }

  const fallback = FALLBACK_PRIORITY.find((t) => (input.actionTotals[t] ?? 0) > 0) ?? (options[0]?.type ?? null)
  return {
    actionTypes: fallback ? [fallback] : null, field: null,
    kind: kindOf(fallback), label: fallback ? actionLabel(fallback) : "Sin resultado", source: "fallback", options,
  }
}

// Resultado y su valor de UNA fila diaria. Igual que el Creative Tracker:
// se toma la primera variante presente ese día; si ninguna, 0 (Meta omite
// la acción en vez de mandarla en 0; sumar otra cosa inflaría el número).
// Filas capturadas antes de la migración 129 no traen `actions`: para
// resultados de compra se usan las columnas de compra de siempre.
export function rowResult(
  row: { actions?: Record<string, number> | null; action_values?: Record<string, number> | null; impressions?: number; purchases?: number; purchase_value?: number },
  res: AdsetResult,
): { results: number; value: number } {
  if (res.field === "impressions") return { results: Number(row.impressions) || 0, value: 0 }
  if (res.field === "reach") return { results: 0, value: 0 } // el alcance no se suma por día: va por período
  const actions = row.actions ?? {}
  if (Object.keys(actions).length === 0) {
    return res.kind === "purchase" ? { results: Number(row.purchases) || 0, value: Number(row.purchase_value) || 0 } : { results: 0, value: 0 }
  }
  for (const t of res.actionTypes ?? []) {
    if (actions[t] !== undefined) return { results: Number(actions[t]) || 0, value: Number(row.action_values?.[t]) || 0 }
  }
  return { results: 0, value: 0 }
}
