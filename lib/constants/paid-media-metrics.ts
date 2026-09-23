// Separado de lib/actions/paid-media-performance.ts porque un archivo
// "use server" solo puede exportar funciones async — esto es un objeto
// plano, lo necesitan tanto la agregación server-side como los
// componentes cliente (para renderizar el picker de métricas).
export type MetricKey = "spend" | "ctr" | "cpc" | "cpm" | "cost_per_result" | "roas" | "results"

export const METRIC_DEFS: Record<MetricKey, { label: string; higherIsBetter: boolean; format: (v: number) => string }> = {
  spend:           { label: "Inversión",       higherIsBetter: false, format: (v) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}` },
  ctr:             { label: "CTR",              higherIsBetter: true,  format: (v) => `${v.toFixed(2)}%` },
  cpc:             { label: "CPC",              higherIsBetter: false, format: (v) => `$${v.toFixed(2)}` },
  cpm:             { label: "CPM",              higherIsBetter: false, format: (v) => `$${v.toFixed(2)}` },
  cost_per_result: { label: "Costo/Resultado",  higherIsBetter: false, format: (v) => `$${v.toFixed(2)}` },
  roas:            { label: "ROAS",             higherIsBetter: true,  format: (v) => `${v.toFixed(2)}x` },
  results:         { label: "Resultados",       higherIsBetter: true,  format: (v) => v.toLocaleString("en-US") },
}
