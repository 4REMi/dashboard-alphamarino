"use client"

import { CheckCircle2, Loader2, ScanSearch } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ConceptAnalysisStatus } from "@/lib/hooks/use-concept-analysis-status"

// Botón "Analizar concepto" del detalle de un anuncio / post orgánico.
// Si ya hay análisis guardado dice "Concepto analizado" (en verde) y al
// abrirlo muestra el guardado, sin volver a analizar ni cobrar.
export function AnalyzeConceptButton({ status, onClick, className }: {
  status: ConceptAnalysisStatus
  onClick: () => void
  className?: string
}) {
  const analyzed = status === "analyzed"
  const running = status === "running"
  return (
    <button
      onClick={onClick}
      title={
        analyzed ? "Este concepto ya se analizó. Ábrelo para ver el análisis guardado (no vuelve a analizar)."
        : running ? "Analizando… puedes abrirlo para ver el avance"
        : "Desarma el concepto del anuncio: ángulo, persona, dolor, gancho, estructura y cómo adaptarlo"
      }
      className={cn(
        "h-9 px-3 rounded-xl border text-sm font-medium inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors",
        analyzed
          ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
          : "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
        className,
      )}
    >
      {analyzed ? <CheckCircle2 className="w-4 h-4" /> : running ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanSearch className="w-4 h-4" />}
      {analyzed ? "Concepto analizado" : running ? "Analizando…" : "Analizar concepto"}
    </button>
  )
}
