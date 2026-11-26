"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { deleteAuditAccount, setAuditAccountKind } from "@/lib/actions/ad-audits"
import type { AuditAccountRow } from "@/lib/ad-audit/queries"

const STEPS = [
  "Abre el Ads Manager de la cuenta: la tuya, la de un cliente o una que te prestaron.",
  "Marca las campañas en la pestaña «Campañas» y pulsa «Auditar N campañas» (extensión).",
  "Aquí ves cada conjunto: ganadores, perdedores y dónde se rompe cada anuncio, con sus videos.",
]

function ago(days: number | null) {
  if (days === null) return "sin capturar"
  return days === 0 ? "hoy" : days === 1 ? "ayer" : `hace ${days} días`
}

export function AuditAccounts({ accounts, error }: { accounts: AuditAccountRow[]; error: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Auditorías</h1>
          <Link href="/ad-lab/auditorias/metricas" className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-3 text-sm font-medium">Métricas de auditoría</Link>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Cuentas publicitarias enviadas desde la extensión. No necesitan estar conectadas al dashboard: se leen con la sesión de quien las ve en el Ads Manager.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {STEPS.map((t, i) => (
          <div key={i} className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-muted text-xs font-bold">{i + 1}</span>
            <span className="text-sm text-muted-foreground">{t}</span>
          </div>
        ))}
      </div>

      {error && <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
      {!error && accounts.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay auditorías.</p>}

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
        {accounts.map((a) => {
          const stale = a.kind === "prospect" && (a.days_since_capture ?? 0) > 7
          return (
            <div key={a.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/ad-lab/auditorias/${a.id}`} className="min-w-0">
                  <p className="truncate text-base font-semibold hover:underline">{a.name}</p>
                  <p className="text-xs text-muted-foreground">act_{a.meta_account_id} · {a.currency ?? "—"}</p>
                </Link>
                <button
                  disabled={pending}
                  onClick={() => start(async () => { await setAuditAccountKind(a.id, a.kind === "prospect" ? "client" : "prospect"); router.refresh() })}
                  title="Cambiar entre prospecto y cliente"
                  className={cn("flex-none rounded-full px-2.5 py-1 text-xs font-semibold",
                    a.kind === "client" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-sky-500/15 text-sky-700 dark:text-sky-300")}
                >
                  {a.kind === "client" ? "Cliente" : "Prospecto"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><p className="text-[11px] text-muted-foreground">Campañas</p><p className="font-semibold">{a.campaigns}</p></div>
                <div><p className="text-[11px] text-muted-foreground">Anuncios</p><p className="font-semibold">{a.ads}</p></div>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-xs">
                <span className={cn(stale ? "text-orange-700 dark:text-orange-300" : "text-muted-foreground")}>
                  Actualizada {ago(a.days_since_capture)}{stale ? " · abre su Ads Manager para actualizar" : ""}
                </span>
                {confirming === a.id ? (
                  <span className="flex items-center gap-2">
                    <button disabled={pending} onClick={() => start(async () => { await deleteAuditAccount(a.id); setConfirming(null); router.refresh() })}
                      className="font-semibold text-destructive">Borrar todo</button>
                    <button onClick={() => setConfirming(null)} className="text-muted-foreground">Cancelar</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirming(a.id)} aria-label={`Borrar la auditoría de ${a.name}`} title="Borrar la auditoría (métricas y videos)"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
