// Tipos del Radar Paid Media (compartidos servidor/cliente).

export type RadarSeverity = "crit" | "warn" | "good"
export type RadarRule =
  | "strategy" | "pacing" | "underspend" | "line_cpr" | "kill" | "graduate"
  | "fatigue" | "structure" | "unlinked" | "testing" | "stale"

// Qué puede hacer el botón principal de una recomendación.
export type RadarAction =
  | { kind: "pause_ads"; adIds: string[]; label: string }
  | { kind: "pause_campaigns"; campaignIds: string[]; label: string }
  | { kind: "task"; title: string; description: string; label: string }
  | { kind: "strategy"; label: string }
  | { kind: "link"; href: string; label: string }

export interface RadarAdRef {
  adId: string
  name: string
  thumb: string | null
  conceptName: string | null
  campaignName: string | null
}

export interface RadarRec {
  key: string                // regla + objeto, estable dentro del ciclo
  rule: RadarRule
  severity: RadarSeverity
  channel: string            // "Meta Ads", "TikTok", "Todos"
  where: string              // campaña / línea / cuenta
  title: string
  evidence: { label: string; value: string; tone?: "bad" | "good" }[]
  ads: RadarAdRef[]
  action: RadarAction | null
  impact: number             // para ordenar dentro de la misma severidad
}

export interface StrategyLine {
  key: string
  name: string
  brand_line_id: string | null
  channel: string
  conversion: string
  budget: number | null
  target_cpr: number | null
}

export interface RadarStrategy {
  id: string
  cycle_id: string
  budget: number
  budget_guard: "warn" | "auto_pause"
  lines: StrategyLine[]
  testing_concept_ids: string[]
  bet: string
  confirmed_by_name: string | null
  confirmed_at: string
}

export interface RadarChannelSpend { channel: string; spend: number; results: number }

export interface RadarSnapshot {
  projectId: string
  projectName: string
  clientName: string | null
  cycle: { id: string; start: string; end: string; day: number; days: number } | null
  currency: string
  strategy: RadarStrategy | null
  pacing: { spend: number; expected: number; projection: number; budget: number; pct: number } | null
  channels: RadarChannelSpend[]
  kpis: { results: number; cpr: number | null; targetCpr: number | null; frequency: number | null; ctr: number | null }
  recs: RadarRec[]           // ordenadas; el UI muestra las primeras 5
  hiddenCount: number        // descartadas/aplicadas este ciclo
  topAds: RadarAdRef[]       // miniaturas para la vista de agencia
  lastSyncAt: string | null
  summary: string            // 1-2 frases, generadas por reglas (no IA)
  counts: Record<RadarSeverity, number>
  canEdit: boolean
}

export const DISMISS_REASONS = ["Ya lo sé", "Es intencional", "Dato equivocado", "No aplica a este cliente"] as const
