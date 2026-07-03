"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ANGLE_GUIDE, AWARENESS_LABELS, FUNNEL_COLORS } from "@/lib/constants/creatives"
import { cn } from "@/lib/utils"

interface Concept {
  name:                  string | null
  angle_type:            string | null
  organizing_principle:  string | null
  target_persona:        string
  awareness_stage:       number | null
  funnel_stage:          string | null
  why_it_works:          string | null
  pain_point:            string | null
  objection:             string | null
  transformation:        string | null
  product_service:       string | null
}

const fLabel = "text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1"
const fEmpty = "text-sm text-slate-400 italic"

function F({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className={fLabel}>{label}</p>
      {value ? <p className="text-sm leading-snug text-slate-800">{value}</p> : <p className={fEmpty}>—</p>}
    </div>
  )
}

export function ConceptStrategyModal({ concept, open, onClose }: {
  concept: Concept
  open: boolean
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<"id" | "angle" | "mech">("id")
  const angleEntry = ANGLE_GUIDE.find((a) => a.name === concept.angle_type)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{concept.name || "Estrategia del concepto"}</DialogTitle>
        </DialogHeader>

        <div className="border rounded-xl overflow-hidden">
          <div className="flex border-b bg-muted/30">
            {([
              { key: "id" as const, label: "Identificación" },
              { key: "angle" as const, label: "Teoría del Ángulo" },
              { key: "mech" as const, label: "Mecanismo" },
            ]).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex-1 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide transition-colors relative",
                  activeTab === tab.key
                    ? "text-foreground bg-background"
                    : "text-muted-foreground hover:text-foreground/70"
                )}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
            ))}
          </div>

          <div className="px-5 py-5 min-h-[180px]">
            {activeTab === "id" && (
              <div className="space-y-5">
                {concept.product_service && <F label="Producto / Servicio" value={concept.product_service} />}
                <F label="Principio organizador" value={concept.organizing_principle} />
                <F label="A quién le hablamos" value={concept.target_persona} />
                <F label="Awareness Stage" value={concept.awareness_stage ? `${concept.awareness_stage} — ${AWARENESS_LABELS[concept.awareness_stage]}` : null} />
                {concept.funnel_stage && (
                  <div>
                    <p className={fLabel}>Funnel Stage</p>
                    <span className={cn("inline-block text-xs font-medium px-2 py-0.5 rounded-md", FUNNEL_COLORS[concept.funnel_stage] ?? "bg-slate-100 text-slate-600")}>
                      {concept.funnel_stage}
                    </span>
                  </div>
                )}
              </div>
            )}

            {activeTab === "angle" && (
              <div className="space-y-5">
                {angleEntry ? (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="text-4xl leading-none">{angleEntry.emoji}</span>
                      <div>
                        <p className="text-base font-semibold text-slate-900">{concept.angle_type}</p>
                        <p className="text-sm text-slate-500 italic leading-snug">{angleEntry.guiding_question}</p>
                      </div>
                    </div>
                    {angleEntry.mechanism && (
                      <p className="text-sm text-slate-600 leading-relaxed">{angleEntry.mechanism}</p>
                    )}
                  </>
                ) : (
                  <p className={fEmpty}>Sin ángulo asignado</p>
                )}
              </div>
            )}

            {activeTab === "mech" && (
              <div className="space-y-0 divide-y divide-slate-100">
                {[
                  { label: "¿Por qué va a funcionar?", value: concept.why_it_works },
                  { label: "Problema específico",      value: concept.pain_point },
                  { label: "Objeción que derrumba",     value: concept.objection },
                  { label: "Transformación prometida",  value: concept.transformation },
                ].map(({ label, value }) => (
                  <div key={label} className="py-4 first:pt-0 last:pb-0">
                    <p className={fLabel}>{label}</p>
                    {value ? <p className="text-sm leading-relaxed text-slate-800">{value}</p> : <p className={fEmpty}>—</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
