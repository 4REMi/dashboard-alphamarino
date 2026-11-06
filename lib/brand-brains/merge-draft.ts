import type { BrandBrain } from "@/lib/types"

// Une los borradores de Instagram y sitio web: el primero es la base, los
// siguientes solo llenan campos vacíos; las listas se suman sin repetir.
// Lo usan el modal de importar (navegador) y la herramienta MCP
// importar_brand_brain, para que ambos den el mismo resultado.
export function mergeBrainDrafts(drafts: Partial<BrandBrain>[]): Partial<BrandBrain> {
  return drafts.reduce<Partial<BrandBrain>>((acc, r) => ({
    ...r,
    name:            acc.name            || r.name,
    industry:        acc.industry        || r.industry,
    tone_of_voice:   acc.tone_of_voice   || r.tone_of_voice,
    description:     acc.description     || r.description,
    target_audience: acc.target_audience || r.target_audience,
    logo_url:        acc.logo_url        || r.logo_url,
    usps:         [...new Set([...(acc.usps ?? []),         ...(r.usps ?? [])])],
    key_benefits: [...new Set([...(acc.key_benefits ?? []), ...(r.key_benefits ?? [])])],
    pain_points:  [...new Set([...(acc.pain_points ?? []),  ...(r.pain_points ?? [])])],
    ctas:         [...new Set([...(acc.ctas ?? []),         ...(r.ctas ?? [])])],
    key_features: [...new Set([...(acc.key_features ?? []), ...(r.key_features ?? [])])],
  }), {})
}
