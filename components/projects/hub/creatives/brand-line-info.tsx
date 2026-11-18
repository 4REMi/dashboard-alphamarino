"use client"

import { useState } from "react"
import { Info, Pencil, Package } from "lucide-react"
import type { BrandLine } from "@/lib/types"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"
import { BrandLineForm } from "@/components/brand-brains/brand-line-form"
import { cn } from "@/lib/utils"

// Detalle de una línea de producto dentro de Conceptos: qué es, USPs, dolores
// y keywords. Sirve para distinguir líneas parecidas antes de crear un ángulo.
// Hover = resumen; clic = ficha completa con "Editar" (mismo formulario que
// Brand Brains). Editar lo permite solo admin/subadmin (RLS lo exige también).

function Bullets({ items }: { items: string[] }) {
  if (!items?.length) return <p className="text-xs text-muted-foreground/70 italic">Sin datos</p>
  return (
    <ul className="space-y-1">
      {items.map((t, i) => (
        <li key={i} className="flex items-start gap-2 text-sm"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />{t}</li>
      ))}
    </ul>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{title}</p>{children}</div>
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s)

function Summary({ line }: { line: BrandLine }) {
  return (
    <div className="space-y-1.5 max-w-xs text-xs">
      <p className="font-semibold">{line.name}</p>
      <p className={cn(!line.description && "italic opacity-70")}>{line.description ? clip(line.description, 220) : "Sin descripción. Haz clic para agregarla."}</p>
      {line.usps?.length > 0 && <p><b>USPs:</b> {clip(line.usps.slice(0, 3).join(" · "), 160)}{line.usps.length > 3 ? ` (+${line.usps.length - 3})` : ""}</p>}
      {line.pain_points?.length > 0 && <p><b>Dolores:</b> {clip(line.pain_points.slice(0, 3).join(" · "), 160)}{line.pain_points.length > 3 ? ` (+${line.pain_points.length - 3})` : ""}</p>}
      <p className="opacity-70">Clic para ver todo y editar</p>
    </div>
  )
}

// Ficha completa + edición. Controlada: quien la usa decide cuándo abrirla.
export function BrandLineDialog({ line, canEdit, open, onOpenChange, onSaved }: {
  line: BrandLine; canEdit: boolean; open: boolean; onOpenChange: (o: boolean) => void; onSaved: (l: BrandLine) => void
}) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return <BrandLineForm brainId={line.brand_brain_id} line={line} onCancel={() => setEditing(false)} onSaved={(l) => { setEditing(false); onSaved(l) }} />
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><span className="w-3 h-3 rounded-full shrink-0" style={{ background: line.color }} /><Package className="w-4 h-4 text-muted-foreground" />{line.name}</DialogTitle>
          <p className="text-xs text-muted-foreground">Línea de producto / servicio. Esto es lo que la IA usa al crear conceptos y guiones.</p>
        </DialogHeader>
        <div className="space-y-5 pt-1">
          <Block title="Descripción"><p className={cn("text-sm whitespace-pre-line", !line.description && "italic text-muted-foreground/70")}>{line.description || "Sin descripción"}</p></Block>
          <Block title="USPs"><Bullets items={line.usps} /></Block>
          <Block title="Pain points"><Bullets items={line.pain_points} /></Block>
          <Block title="Keywords">
            {line.keywords?.length ? <div className="flex flex-wrap gap-1.5">{line.keywords.map((k, i) => <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-muted">{k}</span>)}</div> : <p className="text-xs text-muted-foreground/70 italic">Sin datos</p>}
          </Block>
        </div>
        {canEdit && (
          <div className="flex justify-end pt-3 border-t">
            <button type="button" onClick={() => setEditing(true)} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5 hover:bg-primary/90">
              <Pencil className="w-3.5 h-3.5" />Editar línea
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Ícono ℹ para el encabezado de cada grupo (dentro de un botón: no anida botones).
export function BrandLineInfoIcon({ line, canEdit, onSaved }: { line: BrandLine; canEdit: boolean; onSaved: (l: BrandLine) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span role="button" tabIndex={0} aria-label={`Detalles de ${line.name}`}
              onClick={(e) => { e.stopPropagation(); setOpen(true) }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setOpen(true) } }}
              className="inline-flex items-center justify-center w-6 h-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <Info className="w-3.5 h-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start"><Summary line={line} /></TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {open && <span onClick={(e) => e.stopPropagation()}><BrandLineDialog line={line} canEdit={canEdit} open={open} onOpenChange={setOpen} onSaved={(l) => { setOpen(false); onSaved(l) }} /></span>}
    </>
  )
}

// Chip para el encabezado del modal del concepto.
export function BrandLineChip({ line, canEdit, onSaved }: { line: BrandLine | null; canEdit: boolean; onSaved: (l: BrandLine) => void }) {
  const [open, setOpen] = useState(false)
  if (!line) return <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2 h-2 rounded-full bg-muted-foreground/40" />Línea: General</span>
  return (
    <>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 h-6 pl-2 pr-2.5 rounded-full border border-border text-xs font-medium hover:bg-muted transition-colors max-w-[260px]">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: line.color }} />
              <span className="truncate">{line.name}</span>
              <Info className="w-3 h-3 text-muted-foreground shrink-0" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start"><Summary line={line} /></TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {open && <BrandLineDialog line={line} canEdit={canEdit} open={open} onOpenChange={setOpen} onSaved={(l) => { setOpen(false); onSaved(l) }} />}
    </>
  )
}
