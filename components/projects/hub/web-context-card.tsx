"use client"

import { useState, useTransition } from "react"
import type { WebProjectContext } from "@/lib/types"
import { upsertWebContext, incrementRevision } from "@/lib/actions/projects"
import { AutoTextarea } from "@/components/ui/auto-textarea"

interface Props {
  projectId: string
  context: WebProjectContext | null
  canEdit: boolean
}

export function WebContextCard({ projectId, context, canEdit }: Props) {
  const [editing, setEditing] = useState(!context)
  const [isPending, startTransition] = useTransition()
  const [revisionsUsed, setRevisionsUsed] = useState(context?.revisions_used ?? 0)
  const revisionsIncluded = context?.revisions_included ?? 0
  const revisionsExhausted = revisionsUsed >= revisionsIncluded && revisionsIncluded > 0

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await upsertWebContext(projectId, fd)
      setEditing(false)
    })
  }

  function handleIncrementRevision() {
    setRevisionsUsed((prev) => prev + 1)
    startTransition(async () => {
      await incrementRevision(projectId)
    })
  }

  if (!editing) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-foreground">Contexto Técnico</h3>
          {canEdit && (
            <button onClick={() => setEditing(true)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Editar
            </button>
          )}
        </div>

        {/* Revision counter */}
        <div className={`flex items-center gap-3 rounded-lg p-3 border ${
          revisionsExhausted ? "border-destructive/40 bg-destructive/10" : "border-border bg-muted/30"
        }`}>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Revisiones</p>
            <p className={`text-lg font-bold ${revisionsExhausted ? "text-destructive" : "text-foreground"}`}>
              {revisionsUsed} / {revisionsIncluded}
              {revisionsExhausted && <span className="text-xs ml-2 font-normal">⚠ Agotadas</span>}
            </p>
          </div>
          {canEdit && (
            <button
              onClick={handleIncrementRevision}
              disabled={isPending}
              className="px-3 py-1.5 rounded-md bg-muted text-foreground text-xs hover:bg-muted/80 disabled:opacity-50 transition-colors"
            >
              + Usar revisión
            </button>
          )}
        </div>

        {/* Platform */}
        {context?.platform && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Plataforma</p>
            <span className="px-2 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-medium">{context.platform}</span>
          </div>
        )}

        {/* URLs */}
        <div className="space-y-2">
          {[
            { label: "Staging", val: context?.staging_url },
            { label: "Producción", val: context?.production_url },
          ].map(({ label, val }) =>
            val ? (
              <div key={label} className="flex items-baseline gap-2">
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">{label}</span>
                <a href={val} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate">
                  {val}
                </a>
              </div>
            ) : null
          )}
        </div>

        {/* Technical notes */}
        {context?.technical_notes && (
          <div className="border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Notas técnicas</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{context.technical_notes}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h3 className="font-semibold text-sm text-foreground">Contexto Técnico</h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Plataforma</label>
          <input name="platform" defaultValue={context?.platform ?? ""}
            placeholder="Shopify, WordPress, Next.js…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Revisiones incluidas</label>
          <input name="revisions_included" type="number" min="0" defaultValue={context?.revisions_included ?? 0}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Revisiones utilizadas</label>
        <input name="revisions_used" type="number" min="0" defaultValue={context?.revisions_used ?? 0}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      <div className="space-y-3">
        {[
          { name: "staging_url", label: "URL Staging", val: context?.staging_url },
          { name: "production_url", label: "URL Producción", val: context?.production_url },
        ].map(({ name, label, val }) => (
          <div key={name}>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
            <input name={name} type="url" defaultValue={val ?? ""} placeholder="https://"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        ))}
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Notas técnicas</label>
        <AutoTextarea name="technical_notes" rows={3} defaultValue={context?.technical_notes ?? ""}
          placeholder="Credenciales, decisiones técnicas, restricciones…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
      </div>

      <div className="flex justify-end gap-2">
        {context && (
          <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            Cancelar
          </button>
        )}
        <button type="submit" disabled={isPending} className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {isPending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  )
}
