"use client"

import { useEffect, useState, useTransition } from "react"
import { Bell, CheckCheck, CheckSquare, FolderKanban, Clapperboard, CalendarClock, Wallet, Inbox } from "lucide-react"
import { getMyInbox, markInboxRead, type InboxItem } from "@/lib/actions/notification-logs"
import { cn } from "@/lib/utils"

// Bandeja del inicio: las mismas notificaciones que llegan por Telegram
// (pings, tareas, notas y menciones, creativos, ciclos, nómina), con
// no-leídas resaltadas. Últimos 30 días.

const CATS = [
  { key: "tareas", label: "Tareas", test: (k: string) => k.startsWith("task_"), Icon: CheckSquare, tone: "text-sky-600 bg-sky-50 dark:text-sky-300 dark:bg-sky-950/50" },
  { key: "proyectos", label: "Proyectos", test: (k: string) => k.startsWith("project_"), Icon: FolderKanban, tone: "text-violet-600 bg-violet-50 dark:text-violet-300 dark:bg-violet-950/50" },
  { key: "creativos", label: "Creativos", test: (k: string) => k.startsWith("creative_"), Icon: Clapperboard, tone: "text-pink-600 bg-pink-50 dark:text-pink-300 dark:bg-pink-950/50" },
  { key: "ciclos", label: "Ciclos", test: (k: string) => k.startsWith("cycle_"), Icon: CalendarClock, tone: "text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/50" },
  { key: "nomina", label: "Nómina", test: (k: string) => k.startsWith("bonus_"), Icon: Wallet, tone: "text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/50" },
] as const
const catOf = (k: string) => CATS.find((c) => c.test(k)) ?? null

// El mensaje viene con formato de Telegram (*negritas*).
function Message({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*)/g)
  return <>{parts.map((p, i) => (p.startsWith("*") && p.endsWith("*") && p.length > 2 ? <strong key={i} className="font-semibold">{p.slice(1, -1)}</strong> : <span key={i}>{p}</span>))}</>
}

function ago(iso: string) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (m < 1) return "ahora"
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? "ayer" : `hace ${d} días`
}

export function NotificationsInbox() {
  const [items, setItems] = useState<InboxItem[] | null>(null)
  const [unread, setUnread] = useState(0)
  const [filter, setFilter] = useState<string | null>(null)
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [, start] = useTransition()

  useEffect(() => { getMyInbox(40).then((r) => { setItems(r.items); setUnread(r.unread) }).catch(() => setItems([])) }, [])

  function markAll() {
    setItems((xs) => xs?.map((x) => ({ ...x, read: true })) ?? null); setUnread(0)
    start(() => markInboxRead())
  }
  function markOne(id: string) {
    const it = items?.find((x) => x.id === id)
    if (!it || it.read) return
    setItems((xs) => xs?.map((x) => (x.id === id ? { ...x, read: true } : x)) ?? null); setUnread((n) => Math.max(0, n - 1))
    start(() => markInboxRead([id]))
  }

  const list = (items ?? []).filter((x) => (!filter || catOf(x.event_key)?.key === filter) && (!onlyUnread || !x.read))
  const shown = expanded ? list : list.slice(0, 6)
  const present = CATS.filter((c) => (items ?? []).some((x) => c.test(x.event_key)))

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
        <Bell className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold">Notificaciones</h2>
        {unread > 0 && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground tabular-nums">{unread}</span>}
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          <button onClick={() => setOnlyUnread((v) => !v)} className={cn("h-7 px-2.5 rounded-full text-xs border", onlyUnread ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted")}>No leídas</button>
          {present.map((c) => (
            <button key={c.key} onClick={() => setFilter((f) => (f === c.key ? null : c.key))} className={cn("h-7 px-2.5 rounded-full text-xs border", filter === c.key ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted")}>{c.label}</button>
          ))}
          {unread > 0 && <button onClick={markAll} className="h-7 px-2.5 rounded-full text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><CheckCheck className="w-3.5 h-3.5" />Marcar todo leído</button>}
        </div>
      </div>

      {items === null ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Cargando…</p>
      ) : list.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2"><Inbox className="w-5 h-5" />{items.length ? "Nada con ese filtro." : "Sin notificaciones en los últimos 30 días."}</div>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((n) => {
            const cat = catOf(n.event_key)
            const Icon = cat?.Icon ?? Bell
            return (
              <li key={n.id}>
                <button onClick={() => markOne(n.id)} className={cn("w-full text-left px-4 py-2.5 flex gap-3 items-start hover:bg-muted/40", !n.read && "bg-primary/[0.04]")}>
                  <span className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", cat?.tone ?? "bg-muted text-muted-foreground")}><Icon className="w-3.5 h-3.5" /></span>
                  <span className={cn("flex-1 min-w-0 text-sm leading-snug break-words", n.read ? "text-muted-foreground" : "text-foreground")}><Message text={n.message} /></span>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap mt-0.5">{ago(n.created_at)}</span>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {list.length > 6 && (
        <button onClick={() => setExpanded((v) => !v)} className="w-full py-2 text-xs text-muted-foreground hover:text-foreground border-t border-border">
          {expanded ? "Ver menos" : `Ver las ${list.length}`}
        </button>
      )}
    </section>
  )
}
