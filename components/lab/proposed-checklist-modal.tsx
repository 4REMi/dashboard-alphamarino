"use client"

import { useState, useTransition } from "react"
import type { CanonicalTask, LabProposedChecklistAddition, LabProposedChecklistItem } from "@/lib/types"
import {
  createProposedChecklistAddition,
  addProposedChecklistItem,
  deleteProposedChecklistItem,
  submitProposedChecklistAddition,
} from "@/lib/actions/lab"
import { X, Lock, ListChecks, Plus, Send, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  task: CanonicalTask
  phaseName: string
  onClose: () => void
  onCreated: (addition: LabProposedChecklistAddition) => void
}

export function ProposedChecklistModal({ task, phaseName, onClose, onCreated }: Props) {
  const [addition, setAddition] = useState<LabProposedChecklistAddition | null>(null)
  const [items, setItems] = useState<LabProposedChecklistItem[]>([])
  const [newText, setNewText] = useState("")
  const [newIsBlocking, setNewIsBlocking] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isPending, startTransition] = useTransition()

  async function ensureAddition(): Promise<LabProposedChecklistAddition> {
    if (addition) return addition
    setIsCreating(true)
    try {
      const created = await createProposedChecklistAddition(task.id)
      setAddition(created)
      return created
    } finally {
      setIsCreating(false)
    }
  }

  function handleAddItem() {
    if (!newText.trim()) return
    startTransition(async () => {
      const add = await ensureAddition()
      const item = await addProposedChecklistItem(add.id, newText.trim(), newIsBlocking)
      setItems((prev) => [...prev, item])
      setNewText("")
      setNewIsBlocking(false)
    })
  }

  function handleDeleteItem(id: string) {
    startTransition(async () => {
      await deleteProposedChecklistItem(id)
      setItems((prev) => prev.filter((i) => i.id !== id))
    })
  }

  function handleSubmit() {
    if (!addition || items.length === 0) return
    startTransition(async () => {
      await submitProposedChecklistAddition(addition.id)
      onCreated({ ...addition, items, status: "submitted" })
    })
  }

  function handleSaveDraft() {
    if (!addition) { onClose(); return }
    onCreated({ ...addition, items })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="font-semibold text-sm">Proponer ítems de checklist</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {phaseName} → <span className="font-medium">{task.title}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Canonical checklist (read-only) */}
          {task.checklist_items.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <ListChecks className="w-3.5 h-3.5" />
                Checklist actual (solo lectura)
              </p>
              <div className="rounded-lg border border-border/50 divide-y divide-border/30 bg-muted/20">
                {[...task.checklist_items].sort((a, b) => a.item_order - b.item_order).map((item) => (
                  <div key={item.id} className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                    <span className={cn("flex-1 min-w-0 truncate", item.is_blocking && "font-medium text-foreground")}>
                      {item.text}
                    </span>
                    {item.is_blocking && <Lock className="w-2.5 h-2.5 text-destructive flex-shrink-0" />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New items to propose */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Ítems propuestos
            </p>

            {items.length > 0 && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 divide-y divide-border/30 mb-2">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className={cn("flex-1 min-w-0 truncate", item.is_blocking && "font-medium")}>
                      {item.text}
                    </span>
                    {item.is_blocking && (
                      <span className="flex items-center gap-0.5 text-[10px] text-destructive">
                        <Lock className="w-2.5 h-2.5" /> Bloquea
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.id)}
                      disabled={isPending}
                      className="p-0.5 rounded text-muted-foreground hover:text-destructive disabled:opacity-50 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add form */}
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddItem() } }}
                placeholder="Nuevo ítem de checklist…"
                className="flex-1 min-w-0 rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <label className="flex items-center gap-1 text-xs cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={newIsBlocking}
                  onChange={(e) => setNewIsBlocking(e.target.checked)}
                  className="accent-destructive"
                />
                <Lock className="w-3 h-3 text-destructive" />
                Bloquea
              </label>
              <button
                type="button"
                onClick={handleAddItem}
                disabled={!newText.trim() || isPending || isCreating}
                className="p-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex-shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-border px-5 py-3 flex gap-2 justify-end flex-shrink-0">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isPending}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted disabled:opacity-50 transition-colors"
          >
            Guardar borrador
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || items.length === 0 || !addition}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            {isPending ? "Enviando…" : "Enviar a revisión"}
          </button>
        </div>
      </div>
    </div>
  )
}
