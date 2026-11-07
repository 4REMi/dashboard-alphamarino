import { formatCurrency } from "@/lib/utils"

// Texto del fee mensual de un proyecto para la UI (cliente o servidor).
// Fee en MXN: "MX$11,500 (≈ US$615)"; en USD: "US$615".
export interface FeeLike {
  monthly_fee: number | null
  monthly_fee_currency?: string | null
  monthly_fee_original?: number | null
}

export function isMxnFee(p: FeeLike): boolean {
  return p.monthly_fee_currency === "MXN" && Number(p.monthly_fee_original) > 0
}

export function formatFee(p: FeeLike): string {
  if (isMxnFee(p)) {
    const usd = Number(p.monthly_fee) > 0 ? ` (≈ ${formatCurrency(Number(p.monthly_fee))})` : ""
    return `${formatCurrency(Number(p.monthly_fee_original), "MXN")}${usd}`
  }
  return formatCurrency(Number(p.monthly_fee ?? 0))
}
