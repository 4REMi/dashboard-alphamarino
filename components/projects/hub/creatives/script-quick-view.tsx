"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { X, ExternalLink, Copy, Check } from "lucide-react"
import { updateBriefScript } from "@/lib/actions/creatives"
import { AutoTextarea } from "@/components/ui/auto-textarea"
import type { AdCloneLine, CreativeBrief } from "@/lib/types"
import { cn } from "@/lib/utils"

// Vista ligera de los guiones de un brief, desde el modal del concepto:
// revisar y corregir sin abrir la página completa del brief (ahí va el
// contexto que el equipo ya tiene). Guardar regresa el guion a
// "pendiente" del cliente, igual que en la página del brief.

export interface QuickScript {
  key: string
  label: string
  status: "pending_review" | "approved" | "changes_requested"
  feedback: string | null
}

const STATUS: Record<QuickScript["status"], { label: string; dot: string; pill: string }> = {
  pending_review: { label: "Pendiente", dot: "bg-amber-400", pill: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  approved: { label: "Aprobado", dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  changes_requested: { label: "Cambios pedidos", dot: "bg-red-500", pill: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
}

function linesOf(brief: CreativeBrief, key: string): AdCloneLine[] {
  const raw = brief.adapted_script as Record<string, AdCloneLine[]> | AdCloneLine[] | null
  if (!raw) return []
  return Array.isArray(raw) ? raw : raw[key] ?? []
}

export function ScriptQuickView({ brief, scripts, initialKey, canEdit, onClose }: {
  brief: CreativeBrief
  scripts: QuickScript[]
  initialKey: string
  canEdit: boolean
  onClose: () => void
}) {
  const [key, setKey] = useState(initialKey)
  const [compare, setCompare] = useState(false)
  // Borradores por guion: se puede saltar entre guiones sin perder cambios.
  const [drafts, setDrafts] = useState<Record<string, AdCloneLine[]>>({})
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const current = scripts.find((s) => s.key === key) ?? scripts[0]
  const original = linesOf(brief, current.key)
  const lines = drafts[current.key] ?? original
  const dirty = !!drafts[current.key] && JSON.stringify(drafts[current.key]) !== JSON.stringify(original)
  const hasOriginal = lines.some((l) => l.original?.trim())
  const words = lines.reduce((n, l) => n + (l.adapted?.trim().split(/\s+/).filter(Boolean).length ?? 0), 0)
  const status = savedKeys.has(current.key) ? "pending_review" : current.status

  function edit(i: number, adapted: string) {
    setDrafts((d) => ({ ...d, [current.key]: lines.map((l, j) => (j === i ? { ...l, adapted } : l)) }))
  }

  function save() {
    setError(null)
    startTransition(async () => {
      try {
        await updateBriefScript(brief.id, current.key, lines)
        setSavedKeys((s) => new Set(s).add(current.key))
        setDrafts((d) => { const n = { ...d }; delete n[current.key]; return n })
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  function copy() {
    navigator.clipboard.writeText(lines.map((l, i) => `${i + 1}. ${l.adapted}`).join("\n\n"))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const dirtyKeys = Object.keys(drafts).filter((k) => JSON.stringify(drafts[k]) !== JSON.stringify(linesOf(brief, k)))

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={(e) => { e.stopPropagation(); if (!dirtyKeys.length || confirm("Hay cambios sin guardar. ¿Cerrar de todos modos?")) onClose() }}>
      <div className="bg-background rounded-2xl border border-border w-full max-w-5xl h-[88vh] flex overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Lista de guiones del brief */}
        <nav className="w-56 flex-shrink-0 border-r border-border bg-muted/20 flex flex-col">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Brief</p>
            <p className="text-sm font-semibold truncate">{brief.title || "Brief"}</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {scripts.map((s) => {
              const st = STATUS[savedKeys.has(s.key) ? "pending_review" : s.status]
              return (
                <button key={s.key} onClick={() => setKey(s.key)}
                  className={cn("w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center gap-2", s.key === current.key ? "bg-background border border-border shadow-sm" : "hover:bg-muted/60")}>
                  <span className={cn("w-2 h-2 rounded-full flex-shrink-0", st.dot)} />
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate">{s.label}</span>
                    <span className="block text-[10px] text-muted-foreground">{linesOf(brief, s.key).length} líneas · {st.label}</span>
                  </span>
                  {dirtyKeys.includes(s.key) && <span className="w-1.5 h-1.5 rounded-full bg-primary" title="Sin guardar" />}
                </button>
              )
            })}
          </div>
          <a href={`/share/brief/${brief.share_token}`} target="_blank" rel="noopener noreferrer"
            className="px-4 py-3 border-t border-border text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" /> Abrir brief completo
          </a>
        </nav>

        {/* Guion */}
        <section className="flex-1 min-w-0 flex flex-col">
          <header className="px-5 py-3 border-b border-border flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold truncate">{current.label}</p>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className={cn("px-1.5 py-0.5 rounded-full font-semibold", STATUS[status].pill)}>{STATUS[status].label}</span>
                <span>{lines.length} líneas · {words} palabras · ~{Math.max(1, Math.round(words / 2.5))} s</span>
              </div>
            </div>
            {hasOriginal && (
              <div className="flex items-center bg-muted rounded-lg p-0.5 text-xs">
                <button onClick={() => setCompare(false)} className={cn("px-2.5 py-1 rounded-md font-medium", !compare ? "bg-background shadow-sm" : "text-muted-foreground")}>Guion</button>
                <button onClick={() => setCompare(true)} className={cn("px-2.5 py-1 rounded-md font-medium", compare ? "bg-background shadow-sm" : "text-muted-foreground")}>Comparar</button>
              </div>
            )}
            <button onClick={copy} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title="Copiar guion">
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            </button>
            <button onClick={() => { if (!dirtyKeys.length || confirm("Hay cambios sin guardar. ¿Cerrar de todos modos?")) onClose() }} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </header>

          {current.status === "changes_requested" && current.feedback && !savedKeys.has(current.key) && (
            <div className="px-5 py-2.5 bg-red-50 dark:bg-red-950/30 border-b border-red-100 dark:border-red-900 text-sm text-red-900 dark:text-red-200">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600 block mb-0.5">Cambios pedidos por el cliente</span>
              &quot;{current.feedback}&quot;
            </div>
          )}

          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {lines.map((l, i) => (
              <div key={i} className={cn("grid gap-x-5 px-5 py-2.5", compare ? "md:grid-cols-2" : "grid-cols-[26px_1fr]")}>
                {!compare && <span className="w-6 h-6 mt-0.5 rounded-full bg-muted text-muted-foreground text-[11px] font-bold flex items-center justify-center">{i + 1}</span>}
                {compare && <p className="text-sm text-muted-foreground leading-relaxed"><span className="text-[10px] font-bold mr-1.5">{i + 1}</span>{l.original}</p>}
                <div className="min-w-0">
                  {l.speaker && !compare && <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{l.speaker}</p>}
                  {canEdit ? (
                    <AutoTextarea value={l.adapted} onChange={(e) => edit(i, e.target.value)} rows={1}
                      className="w-full resize-none bg-transparent border border-transparent hover:border-border focus:border-primary/50 rounded-md -mx-2 px-2 py-0.5 text-[15px] leading-relaxed focus:outline-none" />
                  ) : (
                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{l.adapted}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {canEdit && (
            <footer className="px-5 py-3 border-t border-border flex items-center gap-3">
              {error && <p className="text-xs text-red-600">{error}</p>}
              {savedKeys.has(current.key) && !dirty && <p className="text-xs text-emerald-600">✓ Guardado — vuelve a pendiente del cliente</p>}
              <p className="ml-auto text-[11px] text-muted-foreground hidden sm:block">Guardar regresa este guion a &quot;pendiente&quot; del cliente.</p>
              <button onClick={save} disabled={!dirty || isPending}
                className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {isPending ? "Guardando…" : "Guardar cambios"}
              </button>
            </footer>
          )}
        </section>
      </div>
    </div>
  )
}
