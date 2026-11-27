// Qué cuenta como «Resultado» de un ad set: el mismo criterio que la
// columna «Resultados» del Ads Manager (optimization_goal + promoted_object,
// y el objective de la campaña como respaldo). SIN "use server": lo comparten
// el Creative Tracker (lib/actions/meta.ts) y las Auditorías
// (lib/ad-audit/*). Cambiar algo aquí cambia ambos a la vez.

// Maps a campaign's objective to the action_type(s) Meta itself counts as
// "Results" for that objective in Ads Manager — ordered by which key actually
// shows up depending on pixel/CAPI/catalog setup. Covers both the current
// OUTCOME_* objectives and the legacy pre-2022 objective enum, since older
// ad accounts can still return either.
export const OBJECTIVE_ACTION_TYPES: Record<string, string[]> = {
  OUTCOME_SALES:        ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"],
  CONVERSIONS:          ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"],
  PRODUCT_CATALOG_SALES:["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"],
  OUTCOME_LEADS:        ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"],
  LEAD_GENERATION:      ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"],
  OUTCOME_TRAFFIC:      ["link_click", "landing_page_view"],
  LINK_CLICKS:          ["link_click", "landing_page_view"],
  OUTCOME_ENGAGEMENT:   ["post_engagement", "page_engagement"],
  POST_ENGAGEMENT:      ["post_engagement", "page_engagement"],
  MESSAGES:             ["onsite_conversion.messaging_conversation_started_7d"],
  OUTCOME_APP_PROMOTION:["mobile_app_install", "app_install"],
  APP_INSTALLS:         ["mobile_app_install", "app_install"],
  VIDEO_VIEWS:          ["video_view"],
  STORE_VISITS:         ["store_visit"],
}

// Fallback used only when nada más aplicó — mismo heurístico genérico de
// antes, mejor que agarrar la primera acción a ciegas.
export const FALLBACK_PRIORITY = ["lead", "purchase", "offsite_conversion.fb_pixel_purchase", "landing_page_view"]

// El objective de la campaña (OUTCOME_ENGAGEMENT, OUTCOME_LEADS, ...) ya
// NO alcanza para saber qué cuenta como "Resultados" — Meta migró las
// campañas de mensajes (y varias otras) a vivir bajo objetivos genéricos,
// distinguidos solo por el optimization_goal real del ad set (ej. una
// OUTCOME_ENGAGEMENT puede ser "Conversaciones" o "Interacción con la
// publicación" según el ad set, no según la campaña). optimization_goal
// es la misma señal que usa el propio Ads Manager para su columna
// "Resultados", así que se prioriza sobre el objective de la campaña.
export const OPTIMIZATION_GOAL_ACTION_TYPES: Record<string, string[]> = {
  CONVERSATIONS:               ["onsite_conversion.messaging_conversation_started_7d"],
  MESSAGING_PURCHASE_CONVERSION: ["onsite_conversion.messaging_purchase_conversion", "onsite_conversion.messaging_conversation_started_7d"],
  MESSAGING_APPOINTMENT_CONVERSION: ["onsite_conversion.messaging_appointment_conversion", "onsite_conversion.messaging_conversation_started_7d"],
  LEAD_GENERATION:             ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"],
  QUALITY_LEAD:                ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"],
  OFFSITE_CONVERSIONS:         ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"],
  VALUE:                       ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"],
  LINK_CLICKS:                 ["link_click", "landing_page_view"],
  LANDING_PAGE_VIEWS:          ["landing_page_view", "link_click"],
  POST_ENGAGEMENT:             ["post_engagement", "page_engagement"],
  PAGE_LIKES:                  ["like", "page_like"],
  APP_INSTALLS:                ["mobile_app_install", "app_install"],
  APP_INSTALLS_AND_OFFSITE_CONVERSIONS: ["mobile_app_install", "app_install", "omni_purchase"],
  THRUPLAY:                    ["video_view"],
  QUALITY_CALL:                ["onsite_conversion.total_call", "onsite_conversion.total_quality_call"],
  SUBSCRIBERS:                 ["subscribe"],
}

// Evento estándar del pixel configurado en el ad set (promoted_object
// .custom_event_type) → nombre base de la acción en insights. Una campaña
// de "Conversiones" puede optimizar para cualquiera de estos, no solo
// compra — antes todas se asumían compra y las demás salían en 0.
export const PIXEL_EVENT_ACTION: Record<string, string> = {
  PURCHASE: "purchase",
  LEAD: "lead",
  COMPLETE_REGISTRATION: "complete_registration",
  ADD_TO_CART: "add_to_cart",
  INITIATED_CHECKOUT: "initiate_checkout",
  ADD_PAYMENT_INFO: "add_payment_info",
  CONTENT_VIEW: "view_content",
  SEARCH: "search",
  ADD_TO_WISHLIST: "add_to_wishlist",
  CONTACT: "contact",
  SCHEDULE: "schedule",
  SUBSCRIBE: "subscribe",
  START_TRIAL: "start_trial",
  SUBMIT_APPLICATION: "submit_application",
  FIND_LOCATION: "find_location",
  CUSTOMIZE_PRODUCT: "customize_product",
  DONATE: "donate",
}

export interface PromotedObject {
  custom_event_type?: string
  custom_conversion_id?: string
}

// Qué cuenta como "Resultado" para un ad set. La mayoría son acciones
// (conversaciones, leads, compras...), pero Alcance e Impresiones son el
// propio campo de insights, no una acción.
export type ResultSpec =
  | { kind: "action"; actionTypes: string[] }
  | { kind: "field"; field: "reach" | "impressions" }

export function resolveResultSpec(objective: string | null, optimizationGoal: string | null, promoted: PromotedObject | null): ResultSpec | null {
  if (promoted?.custom_conversion_id) {
    return { kind: "action", actionTypes: [`offsite_conversion.custom.${promoted.custom_conversion_id}`] }
  }
  const isConversionGoal = optimizationGoal === "OFFSITE_CONVERSIONS" || optimizationGoal === "VALUE"
  const event = promoted?.custom_event_type
  if (isConversionGoal && event && event !== "OTHER" && PIXEL_EVENT_ACTION[event]) {
    const base = PIXEL_EVENT_ACTION[event]
    const types = [`omni_${base}`, `offsite_conversion.fb_pixel_${base}`, base]
    if (base === "initiate_checkout") types.unshift("omni_initiated_checkout")
    return { kind: "action", actionTypes: types }
  }
  if (isConversionGoal && event === "OTHER") {
    return { kind: "action", actionTypes: ["offsite_conversion.fb_pixel_custom"] }
  }
  if (optimizationGoal === "REACH") return { kind: "field", field: "reach" }
  if (optimizationGoal === "IMPRESSIONS") return { kind: "field", field: "impressions" }
  const goalTypes = optimizationGoal ? OPTIMIZATION_GOAL_ACTION_TYPES[optimizationGoal] : undefined
  if (goalTypes) return { kind: "action", actionTypes: goalTypes }
  const objectiveTypes = objective ? OBJECTIVE_ACTION_TYPES[objective] : undefined
  if (objectiveTypes) return { kind: "action", actionTypes: objectiveTypes }
  return null
}
