"use client"

import { useState, useTransition } from "react"
import type { BrandLine } from "@/lib/types"
import { createBrandLine, updateBrandLine, autofillBrandLine } from "@/lib/actions/brand-brains"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { X, Wand2, Loader2, Package, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

export const LINE_COLORS = ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#10b981"]

// ── Brand Line inline form ──────────────────────────────────

function TagInput({
  tags,
  onChange,
  placeholder,
  color,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder: string
  color?: string
}) {
  const [input, setInput] = useState("")

  function add() {
    const val = input.trim()
    if (val && !tags.includes(val)) onChange([...tags, val])
    setInput("")
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {tags.map((tag, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
            style={{
              backgroundColor: color ? `${color}15` : "hsl(var(--primary) / 0.08)",
              color: color ?? "hsl(var(--primary))",
            }}
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((_, j) => j !== i))}
              className="hover:opacity-70 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add() } }}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="button"
          onClick={add}
          disabled={!input.trim()}
          className="h-9 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

export function BrandLineForm({
  brainId,
  line,
  suggestedColor,
  onSaved,
  onCancel,
}: {
  brainId: string
  line?: BrandLine
  suggestedColor?: string
  onSaved: (line: BrandLine) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(line?.name ?? "")
  const [description, setDescription] = useState(line?.description ?? "")
  const [usps, setUsps] = useState<string[]>(line?.usps ?? [])
  const [painPoints, setPainPoints] = useState<string[]>(line?.pain_points ?? [])
  const [keywords, setKeywords] = useState<string[]>(line?.keywords ?? [])
  const [color, setColor] = useState(line?.color ?? suggestedColor ?? "#6366f1")
  const [isPending, startTransition] = useTransition()
  const [isAutofilling, setIsAutofilling] = useState(false)

  const inputCls = "w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"

  async function handleAutofill() {
    if (!name.trim()) return
    setIsAutofilling(true)
    try {
      const result = await autofillBrandLine(name.trim(), brainId, description.trim() || undefined)
      if (result.description) setDescription(result.description)
      if (result.usps?.length) setUsps(result.usps)
      if (result.pain_points?.length) setPainPoints(result.pain_points)
      if (result.keywords?.length) setKeywords(result.keywords)
    } catch {
      // silently fail
    }
    setIsAutofilling(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    startTransition(async () => {
      const fields = {
        name: name.trim(),
        description: description.trim() || null,
        usps,
        pain_points: painPoints,
        keywords,
        color,
      }
      if (line) {
        await updateBrandLine(line.id, brainId, fields)
        onSaved({ ...line, ...fields, pain_points: fields.pain_points, updated_at: new Date().toISOString() })
      } else {
        const created = await createBrandLine(brainId, fields)
        onSaved(created)
      }
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            {line ? "Editar línea" : "Nueva línea de producto / servicio"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Esta información alimenta los prompts de IA para generar conceptos y tropicalizar guiones.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          {/* Name + Color */}
          <div className="flex items-end gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Color</label>
              <div className="flex gap-1.5">
                {LINE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      "w-7 h-7 rounded-full transition-all",
                      color === c ? "ring-2 ring-offset-2 ring-primary scale-110" : "hover:scale-105"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-7 h-7 rounded-full cursor-pointer border-0 p-0" title="Color personalizado" />
              </div>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Nombre del producto / servicio *
              </label>
              <div className="flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Residencial Los Álamos, Consultoría Hipotecaria"
                  className={cn(inputCls, "flex-1")}
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleAutofill}
                  disabled={isAutofilling || !name.trim()}
                  className="h-9 px-3 rounded-lg border border-primary/30 bg-primary/5 text-primary text-xs font-medium hover:bg-primary/10 disabled:opacity-50 transition-colors flex items-center gap-1.5 shrink-0"
                  title="Auto-rellenar con IA"
                >
                  {isAutofilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  Auto-rellenar
                </button>
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Descripción
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="¿Qué es este producto o servicio? Contexto que ayude a la IA a entender de qué se trata."
              className={cn(inputCls, "h-20 resize-none")}
            />
          </div>

          {/* USPs */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              USPs — ¿Qué lo hace único?
            </label>
            <p className="text-[11px] text-muted-foreground/60 mb-2">
              Los diferenciadores clave que la IA usará para generar copy y adaptar guiones.
            </p>
            <TagInput tags={usps} onChange={setUsps} placeholder="Escribe un USP y presiona Enter" color={color} />
          </div>

          {/* Pain Points */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Pain Points — ¿Qué problema resuelve?
            </label>
            <p className="text-[11px] text-muted-foreground/60 mb-2">
              Los dolores del cliente que activan la atención en los anuncios.
            </p>
            <TagInput tags={painPoints} onChange={setPainPoints} placeholder="Escribe un pain point y presiona Enter" color="#ef4444" />
          </div>

          {/* Keywords */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Keywords
            </label>
            <p className="text-[11px] text-muted-foreground/60 mb-2">
              Palabras clave que la IA debe incluir en las tropicalizaciones.
            </p>
            <TagInput tags={keywords} onChange={setKeywords} placeholder="Escribe una keyword y presiona Enter" color="#6366f1" />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-3 border-t">
            <button type="button" onClick={onCancel} className="h-9 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={isPending || !name.trim()} className="h-9 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1.5">
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {line ? "Guardar cambios" : "Crear línea"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

