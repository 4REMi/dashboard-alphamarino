// Separado de lib/actions/paid-media-performance.ts porque un archivo
// "use server" solo puede exportar funciones async — esto es un objeto
// plano, lo necesitan tanto la agregación server-side como los
// componentes cliente (para renderizar el picker de métricas).
export type MetricKey =
  | "spend" | "ctr" | "cpc" | "cpm" | "cost_per_result" | "roas" | "results"
  | "clicks" | "impressions" | "reach" | "frequency"
  | "link_clicks" | "cost_per_link_click" | "video_views" | "purchase_value"

export const METRIC_DEFS: Record<MetricKey, { label: string; higherIsBetter: boolean; format: (v: number) => string }> = {
  spend:                { label: "Inversión",         higherIsBetter: false, format: (v) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}` },
  ctr:                  { label: "CTR",                higherIsBetter: true,  format: (v) => `${v.toFixed(2)}%` },
  cpc:                  { label: "CPC",                higherIsBetter: false, format: (v) => `$${v.toFixed(2)}` },
  cpm:                  { label: "CPM",                higherIsBetter: false, format: (v) => `$${v.toFixed(2)}` },
  cost_per_result:      { label: "Costo/Resultado",    higherIsBetter: false, format: (v) => `$${v.toFixed(2)}` },
  roas:                 { label: "ROAS",               higherIsBetter: true,  format: (v) => `${v.toFixed(2)}x` },
  results:              { label: "Resultados",         higherIsBetter: true,  format: (v) => v.toLocaleString("en-US") },
  clicks:               { label: "Clics (todos)",      higherIsBetter: true,  format: (v) => v.toLocaleString("en-US") },
  impressions:          { label: "Impresiones",        higherIsBetter: true,  format: (v) => v.toLocaleString("en-US") },
  reach:                { label: "Alcance",            higherIsBetter: true,  format: (v) => v.toLocaleString("en-US") },
  frequency:            { label: "Frecuencia",         higherIsBetter: false, format: (v) => v.toFixed(2) },
  link_clicks:          { label: "Clics en el enlace",  higherIsBetter: true,  format: (v) => v.toLocaleString("en-US") },
  cost_per_link_click:  { label: "Costo/Clic en enlace", higherIsBetter: false, format: (v) => `$${v.toFixed(2)}` },
  video_views:          { label: "Reproducciones de video", higherIsBetter: true, format: (v) => v.toLocaleString("en-US") },
  purchase_value:       { label: "Valor de compra",    higherIsBetter: true,  format: (v) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}` },
}

// Compartido entre el picker de "Contexto de Cuenta" (default por
// proyecto) y el override puntual por campaña en el mapa de relaciones —
// mismos presets que Meta Ads Manager.
export const TREND_WINDOW_LABELS: Record<string, string> = {
  previous_day: "vs. ayer",
  last_3d: "vs. últimos 3 días",
  last_7d: "vs. últimos 7 días",
  last_14d: "vs. últimos 14 días",
  baseline: "vs. inicio del ciclo",
}
