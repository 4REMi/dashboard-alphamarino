"use client"

import { useState, useTransition } from "react"
import { updateBriefNotes } from "@/lib/actions/creatives"

interface Props {
  briefId: string
  projectId: string
  initialNotes: string | null
  editable: boolean
}

export function BriefNotes({ briefId, projectId, initialNotes, editable }: Props) {
  const [editing, setEditing] = useState(false)
  const [notes, setNotes] = useState(initialNotes ?? "")
  const [isPending, startTransition] = useTransition()

  if (!editable && !initialNotes) return null

  function handleSave() {
    startTransition(async () => {
      await updateBriefNotes(briefId, projectId, notes)
      setEditing(false)
    })
  }

  return (
    <section className="bg-amber-50 rounded-2xl border border-amber-200 overflow-hidden">
      <div className="px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base">⚠️</span>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
            Notas importantes
          </p>
        </div>
        {editable && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2"
          >
            {initialNotes ? "Editar" : "Agregar nota"}
          </button>
        )}
      </div>

      {editing ? (
        <div className="px-6 pb-5 space-y-3">
          <textarea
            autoFocus
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Ej. Hay que usar sí o sí el hook &quot;¿Sabías que...&quot;. Usar el video 2 como referencia de ritmo. No usar música con letra."
            className="w-full resize-none bg-white border border-amber-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 leading-relaxed focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setNotes(initialNotes ?? ""); setEditing(false) }}
              className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      ) : (
        initialNotes && (
          <div className="px-6 pb-5">
            <p className="text-sm text-amber-900 leading-relaxed whitespace-pre-wrap">{initialNotes}</p>
          </div>
        )
      )}
    </section>
  )
}
