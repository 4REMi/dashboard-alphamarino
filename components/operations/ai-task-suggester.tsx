"use client"

import { useState, useRef, useEffect } from "react"
import { Sparkles, Send, X, Check, RotateCcw, Lock, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface ChecklistItem {
  text: string
  is_blocking: boolean
}

interface TaskProposal {
  title: string
  description?: string
  is_urgent?: boolean
  requires_deliverable?: boolean
  suggested_position?: string
  checklist: ChecklistItem[]
}

interface ConversationEntry {
  role: "user" | "assistant"
  content: string
  proposal?: TaskProposal
}

interface Context {
  projectTypeName: string | null
  phaseSetName: string
  allPhases: string[]
  currentPhaseName: string
  currentPhaseIndex: number
  existingTasks: string[]
  availablePositions: string[]
}

interface Props {
  context: Context
  positions: { id: string; name: string }[]
  onAccept: (proposal: {
    title: string
    description: string
    is_urgent: boolean
    requires_deliverable: boolean
    default_position_id: string
    checklist: ChecklistItem[]
  }) => void
  onClose: () => void
}

export function AiTaskSuggester({ context, positions, onAccept, onClose }: Props) {
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<ConversationEntry[]>([])
  const [activeProposal, setActiveProposal] = useState<TaskProposal | null>(null)
  const [editedProposal, setEditedProposal] = useState<TaskProposal | null>(null)
  const [showChecklist, setShowChecklist] = useState(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [history, loading])

  async function handleSend() {
    const msg = input.trim()
    if (!msg || loading) return
    setInput("")
    setLoading(true)

    const userEntry: ConversationEntry = { role: "user", content: msg }
    setHistory((prev) => [...prev, userEntry])

    try {
      const conversationHistory = history.map((e) => ({
        role: e.role,
        content: e.proposal
          ? `[Propuesta generada: "${e.proposal.title}" con ${e.proposal.checklist.length} ítems de checklist]`
          : e.content,
      }))

      const res = await fetch("/api/ai/suggest-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: msg, conversationHistory, context }),
      })
      const data = await res.json()

      if (data.type === "proposal") {
        const proposal = data.proposal as TaskProposal
        setActiveProposal(proposal)
        setEditedProposal(JSON.parse(JSON.stringify(proposal)))
        setHistory((prev) => [...prev, { role: "assistant", content: "", proposal }])
      } else {
        setHistory((prev) => [...prev, { role: "assistant", content: data.message ?? "No pude generar una propuesta." }])
      }
    } catch {
      setHistory((prev) => [...prev, { role: "assistant", content: "Error al conectar con la IA. Intenta de nuevo." }])
    } finally {
      setLoading(false)
    }
  }

  function handleAccept() {
    if (!editedProposal) return
    const pos = positions.find((p) => p.name === editedProposal.suggested_position)
    onAccept({
      title: editedProposal.title,
      description: editedProposal.description ?? "",
      is_urgent: editedProposal.is_urgent ?? false,
      requires_deliverable: editedProposal.requires_deliverable ?? false,
      default_position_id: pos?.id ?? "",
      checklist: editedProposal.checklist,
    })
  }

  function updateChecklist(i: number, field: "text" | "is_blocking", value: string | boolean) {
    if (!editedProposal) return
    const next = [...editedProposal.checklist]
    next[i] = { ...next[i], [field]: value }
    setEditedProposal({ ...editedProposal, checklist: next })
  }

  function removeChecklistItem(i: number) {
    if (!editedProposal) return
    setEditedProposal({ ...editedProposal, checklist: editedProposal.checklist.filter((_, j) => j !== i) })
  }

  function addChecklistItem() {
    if (!editedProposal) return
    setEditedProposal({ ...editedProposal, checklist: [...editedProposal.checklist, { text: "", is_blocking: false }] })
  }

  return (
    <div className="flex flex-col h-full border-t border-border bg-muted/10">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/20 flex-shrink-0">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold text-primary flex-1">Sugerir tarea con IA</span>
        <span className="text-[10px] text-muted-foreground">{context.currentPhaseName}</span>
        <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {history.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4 px-2">
            Describe en lenguaje natural la tarea que necesitas. Puedes pedir ajustes después.
          </p>
        )}

        {history.map((entry, i) => (
          <div key={i}>
            {entry.role === "user" && (
              <div className="flex justify-end">
                <div className="bg-primary text-primary-foreground text-xs rounded-xl rounded-tr-sm px-3 py-2 max-w-[85%]">
                  {entry.content}
                </div>
              </div>
            )}

            {entry.role === "assistant" && !entry.proposal && (
              <div className="bg-card border border-border text-xs rounded-xl rounded-tl-sm px-3 py-2 max-w-[90%]">
                {entry.content}
              </div>
            )}

            {entry.role === "assistant" && entry.proposal && i === history.length - 1 && editedProposal && (
              <div className="bg-card border border-primary/30 rounded-xl overflow-hidden">
                {/* Proposal header */}
                <div className="px-3 py-2 bg-primary/5 border-b border-primary/20 flex items-center gap-2">
                  <Sparkles className="w-3 h-3 text-primary flex-shrink-0" />
                  <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Propuesta generada</span>
                </div>

                <div className="p-3 space-y-2.5">
                  {/* Title */}
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1 font-medium">Título</p>
                    <input
                      value={editedProposal.title}
                      onChange={(e) => setEditedProposal({ ...editedProposal, title: e.target.value })}
                      className="w-full text-sm font-semibold bg-transparent border-b border-border focus:outline-none focus:border-primary pb-0.5"
                    />
                  </div>

                  {/* Description */}
                  {(editedProposal.description !== undefined) && (
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1 font-medium">Descripción</p>
                      <textarea
                        value={editedProposal.description}
                        onChange={(e) => setEditedProposal({ ...editedProposal, description: e.target.value })}
                        rows={2}
                        className="w-full text-xs bg-transparent border border-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                      />
                    </div>
                  )}

                  {/* Flags */}
                  <div className="flex flex-wrap gap-2">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editedProposal.is_urgent ?? false}
                        onChange={(e) => setEditedProposal({ ...editedProposal, is_urgent: e.target.checked })}
                        className="accent-destructive"
                      />
                      Urgente
                    </label>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editedProposal.requires_deliverable ?? false}
                        onChange={(e) => setEditedProposal({ ...editedProposal, requires_deliverable: e.target.checked })}
                        className="accent-info"
                      />
                      Entregable
                    </label>
                  </div>

                  {/* Position suggestion */}
                  {editedProposal.suggested_position && (
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1 font-medium">Puesto sugerido</p>
                      <select
                        value={editedProposal.suggested_position}
                        onChange={(e) => setEditedProposal({ ...editedProposal, suggested_position: e.target.value })}
                        className="text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">Sin puesto</option>
                        {positions.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                      </select>
                    </div>
                  )}

                  {/* Checklist */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowChecklist((v) => !v)}
                      className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 hover:text-foreground w-full"
                    >
                      {showChecklist ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      Checklist ({editedProposal.checklist.length})
                    </button>
                    {showChecklist && (
                      <div className="space-y-1">
                        {editedProposal.checklist.map((item, ci) => (
                          <div key={ci} className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => updateChecklist(ci, "is_blocking", !item.is_blocking)}
                              title={item.is_blocking ? "Bloqueante" : "No bloqueante"}
                              className={cn("flex-shrink-0 p-0.5 rounded transition-colors", item.is_blocking ? "text-destructive" : "text-muted-foreground hover:text-foreground")}
                            >
                              <Lock className="w-3 h-3" />
                            </button>
                            <input
                              value={item.text}
                              onChange={(e) => updateChecklist(ci, "text", e.target.value)}
                              className="flex-1 min-w-0 text-xs bg-transparent border-b border-border/50 focus:outline-none focus:border-primary pb-0.5"
                            />
                            <button
                              type="button"
                              onClick={() => removeChecklistItem(ci)}
                              className="flex-shrink-0 text-muted-foreground hover:text-destructive"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={addChecklistItem}
                          className="text-[10px] text-primary hover:underline mt-1"
                        >
                          + Agregar ítem
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Accept button */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleAccept}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <Check className="w-3 h-3" /> Guardar tarea
                    </button>
                    <button
                      onClick={() => setEditedProposal(JSON.parse(JSON.stringify(activeProposal)))}
                      title="Descartar cambios"
                      className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {entry.role === "assistant" && entry.proposal && i !== history.length - 1 && (
              <div className="text-xs text-muted-foreground italic px-1">
                ✓ Propuesta anterior: "{entry.proposal.title}"
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
            Generando propuesta…
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-3 py-2.5 border-t border-border flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() }
          }}
          placeholder={history.length === 0 ? "Ej: necesito una tarea para que el cliente comparta accesos..." : "Pide ajustes o describe otra tarea..."}
          rows={2}
          className="flex-1 min-w-0 text-xs rounded-lg border border-input bg-background px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="flex-shrink-0 p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
