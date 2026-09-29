// Reporte de Paid Media: datos del dashboard (snapshot) + narrativa editable.

export interface ReportRow {
  metrica: string
  valor: string
  // Comparación contra el período anterior de la misma duración.
  delta?: { texto: string; tono: "pos" | "neg" | "neu" } | null
}

export interface ReportChannel {
  key: string          // "meta" o el nombre del canal manual
  nombre: string       // "Meta Ads — Facebook / Instagram"
  manual: boolean
  filas: ReportRow[]
  gasto: number
  resultados: number
}

export interface ReportCampaign {
  nombre: string
  canal: string
  gasto: number
  resultados: number
  costoPorResultado: number | null
}

export interface ReportCreative {
  adName: string
  campaign: string | null
  concept: string | null
  thumbUrl: string | null
  gasto: number
  resultados: number
  costoPorResultado: number | null
  ctr: number | null
  ganador: boolean
}

export interface ReportData {
  cliente: string
  periodo: { start: string; end: string; label: string }
  generadoEl: string
  moneda: string
  resultadoLabel: string // "Conversaciones iniciadas", "Leads"…
  canales: ReportChannel[]
  consolidado: ReportRow[] | null
  campanas: ReportCampaign[]
  campanasSinGasto: string[]
  creativos: ReportCreative[]
  entregables: { texto: string; hecho: number; esperado: number }[]
  previo: { label: string; gasto: number; resultados: number; costoPorResultado: number | null } | null
}

export interface ReportSections {
  resumen: string
  que_funciono: string[]
  que_no_funciono: string[]
  contexto: string
  siguientes_pasos: string[]
  nota_cierre: string
}

export interface PaidMediaReport {
  id: string
  project_id: string
  cycle_id: string | null
  start_date: string
  end_date: string
  title: string | null
  notes: string | null
  data: ReportData
  sections: ReportSections
  status: "draft" | "delivered"
  delivered_at: string | null
  created_at: string
  updated_at: string
}

export const EMPTY_SECTIONS: ReportSections = {
  resumen: "", que_funciono: [], que_no_funciono: [], contexto: "", siguientes_pasos: [], nota_cierre: "",
}
