"use client"

import { useMemo, useState } from "react"
import { ChevronRight, Bot } from "lucide-react"
import { cn } from "@/lib/utils"

export type AiActivityRow = {
  id: string
  created_at: string
  actor: string
  platform: string | null
  summary: string
  reason: string | null
  project: { id: string; name: string } | null
  requester: { full_name: string } | null
}

const ACTOR: Record<string, string> = { claude_mcp: "Claude (MCP)", agente: "Agente" }
const GAP_MS = 30 * 60_000

// Sesión = mismo proyecto, misma IA y quien la pidió, sin pausas de >30 min.
function sessions(rows: AiActivityRow[]) {
  const out: AiActivityRow[][] = []
  for (const r of rows) {
    const last = out[out.length - 1]
    const prev = last?.[last.length - 1]
    if (prev && prev.project?.id === r.project?.id && prev.actor === r.actor && prev.requester?.full_name === r.requester?.full_name
      && Date.parse(prev.created_at) - Date.parse(r.created_at) < GAP_MS) last.push(r)
    else out.push([r])
  }
  return out
}

const time = (d: string) => new Date(d).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" })
const day = (d: string) => new Date(d).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })
const clean = (s: string) => s.replace(/\*\*/g, "")

export function AiActivityFeed({ rows }: { rows: AiActivityRow[] }) {
  const [project, setProject] = useState("")
  const [open, setOpen] = useState<Set<string>>(new Set())
  const projects = useMemo(() => [...new Map(rows.filter((r) => r.project).map((r) => [r.project!.id, r.project!.name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows])
  const groups = useMemo(() => sessions(rows.filter((r) => !project || r.project?.id === project)), [rows, project])

  if (!rows.length) return <p className="text-sm text-muted-foreground">Todavía no hay actividad de IA.</p>

  let lastDay = ""
  return (
    <div className="space-y-3">
      <select value={project} onChange={(e) => setProject(e.target.value)}
        className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm">
        <option value="">Todos los proyectos</option>
        {projects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>

      <div className="space-y-2">
        {groups.map((g) => {
          const first = g[g.length - 1], last = g[0]
          const key = last.id
          const isOpen = open.has(key) || g.length === 1
          const d = day(last.created_at)
          const header = d !== lastDay ? (lastDay = d) : null
          return (
            <div key={key}>
              {header && <p className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{header}</p>}
              <div className="rounded-xl border border-border bg-card">
                <button type="button" disabled={g.length === 1}
                  onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left">
                  <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300 flex items-center justify-center shrink-0"><Bot className="w-3.5 h-3.5" /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{last.project?.name ?? "Sin proyecto"}{g.length > 1 && <span className="text-muted-foreground font-normal"> · {g.length} cambios</span>}</span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {ACTOR[last.actor] ?? last.actor}{last.platform ? ` · ${last.platform === "meta" ? "Meta" : last.platform}` : ""}{last.requester ? ` · pidió ${last.requester.full_name}` : ""} · {g.length > 1 ? `${time(first.created_at)}–${time(last.created_at)}` : time(last.created_at)}
                    </span>
                  </span>
                  {g.length > 1 && <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen && "rotate-90")} />}
                </button>
                {isOpen && (
                  <ul className="border-t border-border px-4 py-2 space-y-1.5">
                    {[...g].reverse().map((r) => (
                      <li key={r.id} className="flex gap-3 text-sm">
                        <span className="text-xs text-muted-foreground tabular-nums w-16 shrink-0 pt-0.5">{time(r.created_at)}</span>
                        <span className="flex-1 min-w-0 whitespace-pre-line break-words">{clean(r.summary)}{r.reason && <span className="block text-xs text-muted-foreground">Motivo: {r.reason}</span>}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
