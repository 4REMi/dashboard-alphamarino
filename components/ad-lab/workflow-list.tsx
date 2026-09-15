"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, Loader2 } from "lucide-react"
import { createWorkflow, deleteWorkflow } from "@/lib/actions/ad-nodes/workflows"
import type { AdNodeWorkflow } from "@/lib/types"

export function WorkflowList({ workflows }: { workflows: Pick<AdNodeWorkflow, "id" | "name" | "created_at" | "updated_at">[] }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleCreate() {
    if (!name.trim()) return
    startTransition(async () => {
      const workflow = await createWorkflow(name)
      router.push(`/ad-lab/nodes/${workflow.id}`)
    })
  }

  function handleDelete(id: string) {
    if (!confirm("¿Eliminar este workflow? No se puede recuperar.")) return
    startTransition(async () => {
      await deleteWorkflow(id)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }}
          placeholder="Nombre del workflow — ej. Ad Hook Generator"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={handleCreate}
          disabled={!name.trim() || isPending}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Nuevo workflow
        </button>
      </div>

      {workflows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">Sin workflows todavía — crea el primero arriba.</p>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {workflows.map((w) => (
            <div key={w.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-2 hover:border-primary/40 transition-colors">
              <a href={`/ad-lab/nodes/${w.id}`} className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{w.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Actualizado {new Date(w.updated_at).toLocaleDateString("es-MX")}</p>
              </a>
              <button onClick={() => handleDelete(w.id)} className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
