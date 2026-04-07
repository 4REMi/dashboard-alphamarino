"use client"

import { useState, useTransition } from "react"
import type { WebContext } from "@/lib/types"
import { upsertWebContext } from "@/lib/actions/projects"

interface Props {
  projectId: string
  context: WebContext | null
  isAdmin: boolean
}

export function WebContextCard({ projectId, context, isAdmin }: Props) {
  const [editing, setEditing] = useState(!context)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await upsertWebContext(projectId, fd)
      setEditing(false)
    })
  }

  if (!editing) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-foreground">Contexto Técnico</h3>
          {isAdmin && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Editar
            </button>
          )}
        </div>

        {context?.tech_stack.length ? (
          <div className="flex flex-wrap gap-2">
            {context.tech_stack.map((t) => (
              <span key={t} className="px-2 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-medium">
                {t}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Sin stack configurado</p>
        )}

        <div className="space-y-2">
          {[
            { label: "Repositorio", val: context?.repo_url },
            { label: "Staging", val: context?.staging_url },
            { label: "Producción", val: context?.production_url },
          ].map(({ label, val }) =>
            val ? (
              <div key={label} className="flex items-baseline gap-2">
                <span className="text-xs text-muted-foreground w-24 flex-shrink-0">{label}</span>
                <a
                  href={val}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline truncate"
                >
                  {val}
                </a>
              </div>
            ) : null
          )}
        </div>

        {context?.notes && (
          <p className="text-sm text-muted-foreground border-t border-border pt-3">{context.notes}</p>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h3 className="font-semibold text-sm text-foreground">Contexto Técnico</h3>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Stack Tecnológico (separado por comas)</label>
        <input
          name="tech_stack"
          defaultValue={context?.tech_stack.join(", ") ?? ""}
          placeholder="Next.js, Supabase, Tailwind…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="grid grid-cols-1 gap-3">
        {[
          { name: "repo_url", label: "URL Repositorio", val: context?.repo_url },
          { name: "staging_url", label: "URL Staging", val: context?.staging_url },
          { name: "production_url", label: "URL Producción", val: context?.production_url },
        ].map(({ name, label, val }) => (
          <div key={name}>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
            <input
              name={name}
              type="url"
              defaultValue={val ?? ""}
              placeholder="https://"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        ))}
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
