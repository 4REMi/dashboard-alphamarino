import type { ServiceOffer } from "@/lib/types"

// Formato portable de una oferta (el mismo de Exportar/Importar JSON).
// Las referencias viajan como NOMBRES, no ids.
export function offerToPortable(o: ServiceOffer) {
  return {
    category: o.category,
    name: o.name,
    description: o.description,
    is_base: o.is_base,
    based_on_offer_name: o.based_on_offer?.name ?? null,
    default_project_type_name: o.default_project_type?.name ?? null,
    price: o.price,
    currency: o.currency,
    price_note: o.price_note,
    // Migración 123 (solo si tienen valor, para no ensuciar el JSON).
    ...(o.recommended_ad_budget != null ? { recommended_ad_budget: o.recommended_ad_budget } : {}),
    ...(o.recommended_ad_budget_note ? { recommended_ad_budget_note: o.recommended_ad_budget_note } : {}),
    ...(o.cycle_count != null ? { cycle_count: o.cycle_count } : {}),
    ...(o.cycle_length_days != null ? { cycle_length_days: o.cycle_length_days } : {}),
    ...(o.sort_order != null ? { sort_order: o.sort_order } : {}),
    deliverables: o.deliverables.map((d) => ({ text: d.text, control_text: d.control_text ?? null, cadence: d.cadence, quantity: d.quantity })),
  }
}

// Envuelto en { offers: [...] } para poder pegarlo tal cual en "Importar JSON".
export function offersToJson(offers: ServiceOffer[]): string {
  return JSON.stringify({ offers: offers.map(offerToPortable) }, null, 2)
}
