"use client"

import { useState, useTransition } from "react"
import type { PaidMediaContext } from "@/lib/types"
import { PAID_MEDIA_PLATFORMS } from "@/lib/types"
import { upsertPaidMediaContext } from "@/lib/actions/projects"

interface Props {
  projectId: string
  context: PaidMediaContext | null
  isAdmin: boolean
}

export function PaidMediaContextCard({ projectId, context, isAdmin }: Props) {
  const [editing, setEditing] = useState(!context)
  const [isPending, startTransition] = useTransition()
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(context?.platforms ?? [])

  function togglePlatform(p: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    )
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    selectedPlatforms.forEach((p) => fd.append("platforms", p))
    startTransition(async () => {
      await upsertPaidMediaContext(projectId, fd)
      setEditing(false)
    })
  }

  if (!editing) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-foreground">Contexto de Medios</h3>
          {isAdmin && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Editar
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {context?.platforms.map((p) => (
            <span key={p} className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
              {p}
            </span>
          ))}
          {(!context?.platforms.length) && (
            <span className="text-xs text-muted-foreground">Sin plataformas configuradas</span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Stat label="Budget Mensual" value={context?.monthly_budget ? `$${context.monthly_budget.toLocaleString()}` : "—"} />
          <Stat label="CPA Objetivo" value={context?.target_cpa ? `$${context.target_cpa}` : "—"} />
          <Stat label="ROAS Objetivo" value={context?.target_roas ? `${context.target_roas}x` : "—"} />
        </div>

        {context?.notes && (
          <p className="text-sm text-muted-foreground border-t border-border pt-3">{context.notes}</p>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h3 className="font-semibold text-sm text-foreground">Contexto de Medios</h3>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-2 block">Plataformas</label>
        <div className="flex flex-wrap gap-2">
          {PAID_MEDIA_PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                selectedPlatforms.includes(p)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Budget Mensual ($)</label>
          <input
            name="monthly_budget"
            type="number"
            step="0.01"
            defaultValue={context?.monthly_budget ?? ""}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">CPA Objetivo ($)</label>
          <input
            name="target_cpa"
            type="number"
            step="0.01"
            defaultValue={context?.target_cpa ?? ""}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">ROAS Objetivo (x)</label>
          <input
            name="target_roas"
            type="number"
            step="0.01"
            defaultValue={context?.target_roas ?? ""}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Notas</label>
        <textarea
          name="notes"
          rows={2}
          defaultValue={context?.notes ?? ""}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      <div className="flex justify-end gap-2">
        {context && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}
