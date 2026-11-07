import { createAdminClient } from "@/lib/supabase/admin"
import { getExchangeRate } from "@/lib/actions/finances"

// Fee mensual de proyecto con moneda (migración 122). SIN "use server": lo
// usan createProject/updateProject, el MCP y el cron.

export type FeeCurrency = "USD" | "MXN"

const todayMx = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" })

// Columnas a guardar para un fee dado en su moneda. monthly_fee es siempre
// el equivalente en USD; en MXN se convierte con el tipo de cambio de hoy.
export async function feeColumns(amount: number | null, currency: FeeCurrency) {
  if (!amount || amount <= 0) {
    return { monthly_fee: null, monthly_fee_currency: currency, monthly_fee_original: null, rate: null as number | null }
  }
  if (currency === "USD") {
    return { monthly_fee: amount, monthly_fee_currency: "USD" as const, monthly_fee_original: null, rate: null as number | null }
  }
  const rate = await getExchangeRate(todayMx())
  if (!rate) throw new Error("No se pudo obtener el tipo de cambio para convertir el fee en pesos; intenta de nuevo.")
  return {
    monthly_fee: Math.round((amount / rate) * 100) / 100,
    monthly_fee_currency: "MXN" as const,
    monthly_fee_original: amount,
    rate: rate as number | null,
  }
}

// Columnas listas para insert/update (sin el tipo de cambio).
export async function feeRow(amount: number | null, currency: FeeCurrency) {
  const { rate: _rate, ...row } = await feeColumns(amount, currency)
  void _rate
  return row
}

// ¿El error es porque la migración 122 todavía no se corre?
export const isMissingFeeColumns = (msg?: string) => !!msg && /monthly_fee_(currency|original)/.test(msg)

// Cron diario: recalcula el equivalente en USD de los fees pactados en MXN
// con el tipo de cambio del día. Devuelve cuántos proyectos actualizó.
export async function refreshMxnFees(): Promise<number> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("projects")
    .select("id, monthly_fee, monthly_fee_original")
    .eq("monthly_fee_currency", "MXN")
    .gt("monthly_fee_original", 0)
  if (error) {
    if (isMissingFeeColumns(error.message)) return 0
    throw error
  }
  if (!data?.length) return 0
  const rate = await getExchangeRate(todayMx())
  if (!rate) return 0
  let n = 0
  for (const p of data) {
    const usd = Math.round((Number(p.monthly_fee_original) / rate) * 100) / 100
    if (usd === Number(p.monthly_fee)) continue
    const { error: e } = await admin.from("projects").update({ monthly_fee: usd }).eq("id", p.id)
    if (!e) n++
  }
  return n
}
