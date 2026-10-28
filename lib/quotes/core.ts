// Hub de cotizaciones — lógica compartida (webhooks y acciones). Sin
// "use server": lo importan rutas API y server actions.

export type QuoteStatus = "nuevo" | "lista" | "generando" | "generada" | "enviada" | "ganada" | "perdida" | "error"
export const QUOTE_STATUS: { key: QuoteStatus; label: string }[] = [
  { key: "nuevo", label: "Nuevo" },
  { key: "lista", label: "Lista para cotizar" },
  { key: "generando", label: "Generando" },
  { key: "generada", label: "Propuesta generada" },
  { key: "enviada", label: "Enviada" },
  { key: "ganada", label: "Ganada" },
  { key: "perdida", label: "Perdida" },
  { key: "error", label: "Error" },
]

// Tipos con plantilla de Slides en Make. Lo demás es "otra:<oferta>" (sin plantilla todavía).
export const PROPOSAL_TYPES = [
  { key: "web_informativo", label: "Web · Informativo", makeType: "Informativo", defaultPrice: 27000 },
  { key: "web_ecommerce", label: "Web · eCommerce", makeType: "eCommerce", defaultPrice: 37000 },
] as const
export const hasTemplate = (t: string | null | undefined) => PROPOSAL_TYPES.some((p) => p.key === t)

export interface QuoteLead {
  id: string; created_at: string; updated_at: string; source: string
  ghl_contact_id: string | null; ghl_opportunity_id: string | null
  name: string; company: string | null; email: string | null; phone: string | null
  giro: string | null; site_type: string | null; problem: string | null; socials: string | null; website: string | null
  investment: string | null; business_size: string | null; offer: string | null
  ai_summary: string | null; form_answers: string | null; notes: string | null
  proposal_type: string | null; price: number | null; status: QuoteStatus
  proposal_pdf_url: string | null; proposal_slides_url: string | null; proposal_generated_at: string | null
  last_error: string | null
}

// Sugerencia de plantilla según lo que contestó en GHL.
export function suggestType(siteType: string | null, offer: string | null): string | null {
  const s = (siteType ?? "").toLowerCase()
  if (s.includes("ecommerce") || s.includes("tienda")) return "web_ecommerce"
  if (s.includes("informativo") || s.includes("portafolio") || s.includes("blog")) return "web_informativo"
  if (offer?.trim()) return `otra:${offer.trim()}`
  return null
}

// ── Mapeo del webhook de GHL ──────────────────────────────────────────────
// El "Webhook" de un workflow de GHL manda el contacto con sus campos
// estándar y los personalizados por NOMBRE (o por clave). Se buscan por
// coincidencia flexible para no depender del formato exacto.
const norm = (k: string) => k.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()

function flatten(obj: unknown, out: Record<string, string> = {}, prefix = ""): Record<string, string> {
  if (!obj || typeof obj !== "object") return out
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v == null) continue
    if (typeof v === "object" && !Array.isArray(v)) flatten(v, out, `${prefix}${k} `)
    else out[norm(prefix + k)] = Array.isArray(v) ? v.join(", ") : String(v)
    if (typeof v !== "object") out[norm(k)] ??= String(v)
  }
  return out
}

function pick(flat: Record<string, string>, ...needles: string[]): string | null {
  for (const n of needles.map(norm)) {
    const hit = Object.entries(flat).find(([k, v]) => v.trim() && (k === n || k.endsWith(` ${n}`) || k.includes(n)))
    if (hit) return hit[1].trim()
  }
  return null
}

export function mapGhlPayload(body: unknown) {
  const f = flatten(body)
  const first = pick(f, "first_name", "firstName"), last = pick(f, "last_name", "lastName")
  const name = pick(f, "full_name", "fullName", "contact name") ?? ([first, last].filter(Boolean).join(" ") || pick(f, "name") || "Sin nombre")
  const site_type = pick(f, "que tipo de sitio web buscas")
  const offer = pick(f, "oferta")
  return {
    ghl_contact_id: pick(f, "contact_id", "contactId", "contact id"),
    ghl_opportunity_id: pick(f, "opportunity_id", "opportunityId", "opportunity id"),
    name,
    company: pick(f, "company_name", "companyName", "business name"),
    email: pick(f, "email"),
    phone: pick(f, "phone"),
    giro: pick(f, "giro", "en que industria opera tu negocio"),
    site_type,
    problem: pick(f, "que problema te gustaria resolver con tu sitio web"),
    socials: pick(f, "como podemos encontrar tu negocio en redes sociales"),
    website: pick(f, "website", "sitio web actual"),
    investment: pick(f, "nivel de inversion", "en que rango se encuentra la inversion para este proyecto"),
    business_size: pick(f, "tamano del negocio", "cuantos empleados tiene tu negocio"),
    offer,
    ai_summary: pick(f, "ai qualification summary", "ai_qualification_summary"),
    form_answers: pick(f, "respuestas del formulario"),
    proposal_type: suggestType(site_type, offer),
  }
}

// Texto que se manda a Make (su primer paso extrae los campos con IA).
export function contextForMake(l: QuoteLead): string {
  const type = PROPOSAL_TYPES.find((p) => p.key === l.proposal_type)
  return [
    `Negocio: ${l.company || l.name}`,
    l.giro && `Giro: ${l.giro}`,
    type && `Tipo de desarrollo: ${type.makeType}`,
    l.price != null && `Precio del proyecto (usar exactamente): ${l.price}`,
    l.website && `Sitio actual: ${l.website}`,
    l.socials && `Redes sociales: ${l.socials}`,
    l.problem && `Problema a resolver: ${l.problem}`,
    l.business_size && `Tamaño: ${l.business_size}`,
    l.investment && `Inversión que contempla: ${l.investment}`,
    l.ai_summary && `Resumen de calificación: ${l.ai_summary}`,
    l.form_answers && `Respuestas del formulario: ${l.form_answers}`,
    l.notes && `Notas: ${l.notes}`,
  ].filter(Boolean).join("\n")
}

export function checkSecret(provided: string | null): boolean {
  const expected = process.env.QUOTES_WEBHOOK_SECRET
  return !!expected && !!provided && provided === expected
}
