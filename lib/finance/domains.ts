import type { SupabaseClient } from "@supabase/supabase-js"

// Renovación de dominio: lógica compartida entre el dashboard (/finances/domains)
// y el MCP. Marca mantención/renovación como saldada; cada cobro (dominio y/o
// mantenimiento) crea un Income en USD convirtiendo desde MXN; extendYear empuja
// renewal_date un año desde su valor actual (no desde la fecha de pago).

export function addOneYear(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().split("T")[0]
}

export interface RenewOptions {
  date: string
  notes: string | null
  chargeDomain: boolean
  chargeMaintenance: boolean
  extendYear: boolean
}

export async function renewDomainCore(
  supabase: SupabaseClient,
  domainId: string,
  o: RenewOptions,
  getExchangeRate: (date: string) => Promise<number | null>,
): Promise<{ domain: string; charges: { amount: number; description: string }[]; newRenewalDate: string | null }> {
  const { data: domain, error: dErr } = await supabase
    .from("domains").select("domain, renewal_date, renewal_cost, maintenance_cost").eq("id", domainId).single()
  if (dErr || !domain) throw new Error("Dominio no encontrado")

  const charges: { amount: number; description: string }[] = []
  if (o.chargeDomain && domain.renewal_cost) charges.push({ amount: Number(domain.renewal_cost), description: `Renovación dominio ${domain.domain}` })
  if (o.chargeMaintenance && domain.maintenance_cost) charges.push({ amount: Number(domain.maintenance_cost), description: `Mantenimiento ${domain.domain}` })

  if (charges.length > 0) {
    const exchangeRate = await getExchangeRate(o.date)
    const { error: iErr } = await supabase.from("income").insert(
      charges.map((c) => ({
        project_id: null,
        amount: exchangeRate ? c.amount / exchangeRate : c.amount,
        currency: "MXN",
        original_amount: c.amount,
        exchange_rate: exchangeRate,
        date: o.date,
        description: c.description,
      })),
    )
    if (iErr) throw iErr
  }

  const update: Record<string, string | null> = { last_maintenance_date: o.date, last_maintenance_notes: o.notes }
  const newRenewalDate = o.extendYear && domain.renewal_date ? addOneYear(domain.renewal_date) : null
  if (newRenewalDate) update.renewal_date = newRenewalDate
  const { error: uErr } = await supabase.from("domains").update(update).eq("id", domainId)
  if (uErr) throw uErr
  return { domain: domain.domain, charges, newRenewalDate }
}
