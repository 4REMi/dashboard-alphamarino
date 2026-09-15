"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, Loader2, Copy, Pencil, Check, X } from "lucide-react"
import { createWorkflow, deleteWorkflow, duplicateWorkflow, renameWorkflow } from "@/lib/actions/ad-nodes/workflows"
import type { AdNodeWorkflow } from "@/lib/types"

export function WorkflowList({ workflows }: { workflows: Pick<AdNodeWorkflow, "id" | "name" | "created_at" | "updated_at">[] }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [renamingId, setRenamingId] = useState<string | null>(null)
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

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const copy = await duplicateWorkflow(id)
      router.push(`/ad-lab/nodes/${copy.id}`)
    })
  }

  function handleRename(id: string, newName: string) {
    startTransition(async () => {
      await renameWorkflow(id, newName)
      setRenamingId(null)
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
              <div className="flex-1 min-w-0">
                {renamingId === w.id ? (
                  <RenameField initial={w.name} onCancel={() => setRenamingId(null)} onSave={(v) => handleRename(w.id, v)} />
                ) : (
                  <a href={`/ad-lab/nodes/${w.id}`} className="block">
                    <p className="text-sm font-medium truncate">{w.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Actualizado {new Date(w.updated_at).toLocaleDateString("es-MX")}</p>
                  </a>
                )}
              </div>
              {renamingId !== w.id && (
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button onClick={() => setRenamingId(w.id)} title="Renombrar" className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDuplicate(w.id)} title="Duplicar" className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(w.id)} title="Eliminar" className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RenameField({ initial, onSave, onCancel }: { initial: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial)
  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onSave(value); if (e.key === "Escape") onCancel() }}
        className="flex-1 min-w-0 text-sm bg-white border border-primary/40 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <button onClick={() => onSave(value)} className="p-1 rounded text-emerald-600 hover:bg-emerald-50 flex-shrink-0"><Check className="w-3.5 h-3.5" /></button>
      <button onClick={onCancel} className="p-1 rounded text-muted-foreground hover:bg-muted flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
    </div>
  )
}
