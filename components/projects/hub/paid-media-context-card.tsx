"use client"

import { useState, useTransition } from "react"
import type { PaidMediaContext, MainObjective } from "@/lib/types"
import { PAID_MEDIA_PLATFORMS, MAIN_OBJECTIVES } from "@/lib/types"
import { upsertPaidMediaContext } from "@/lib/actions/projects"
import { AutoTextarea } from "@/components/ui/auto-textarea"

interface Props {
  projectId: string
  context: PaidMediaContext | null
  canEdit: boolean
}

export function PaidMediaContextCard({ projectId, context, canEdit }: Props) {
  const [editing, setEditing] = useState(!context)
  const [isPending, startTransition] = useTransition()
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(context?.platforms ?? [])
  const [showToken, setShowToken] = useState(false)

  function togglePlatform(p: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    )
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    selectedPlatforms.forEach((p) => fd.append("platforms", p))
    startTransition(async () => {
      await upsertPaidMediaContext(projectId, fd)
      setEditing(false)
    })
  }

  if (!editing) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-foreground">Contexto de Cuenta</h3>
          {canEdit && (
            <button onClick={() => setEditing(true)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Editar
            </button>
          )}
        </div>

        {/* Platforms */}
        <div className="flex flex-wrap gap-2">
          {context?.platforms.map((p) => (
            <span key={p} className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">{p}</span>
          ))}
          {!context?.platforms.length && <span className="text-xs text-muted-foreground">Sin plataformas</span>}
        </div>

        {/* Objective + KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {context?.main_objective && (
            <Kpi label="Objetivo" value={MAIN_OBJECTIVES[context.main_objective as MainObjective]} />
          )}
          {context?.monthly_ad_budget && (
            <Kpi label="Budget pauta (MXN)" value={`$${context.monthly_ad_budget.toLocaleString()}`} />
          )}
          {context?.target_roas && <Kpi label="ROAS objetivo" value={`${context.target_roas}x`} />}
          {context?.target_cpa && <Kpi label="CPA objetivo" value={`$${context.target_cpa}`} />}
          {context?.target_cpl && <Kpi label="CPL objetivo" value={`$${context.target_cpl}`} />}
          {context?.target_leads_per_month && <Kpi label="Leads/mes" value={context.target_leads_per_month.toString()} />}
        </div>

        {/* Account notes */}
        {context?.account_notes && (
          <div className="border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Notas de cuenta</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{context.account_notes}</p>
          </div>
        )}

        {/* Meta connection indicator */}
        <div className="border-t border-border pt-3 flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${context?.meta_ad_account_id && context?.meta_access_token ? "bg-green-500" : "bg-muted-foreground/40"}`} />
          <span className="text-xs text-muted-foreground">
            {context?.meta_ad_account_id && context?.meta_access_token
              ? `Meta conectado · act_${context.meta_ad_account_id}`
              : "Meta no configurado"}
          </span>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h3 className="font-semibold text-sm text-foreground">Contexto de Cuenta</h3>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-2 block">Plataformas activas</label>
        <div className="flex flex-wrap gap-2">
          {PAID_MEDIA_PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                selectedPlatforms.includes(p)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Objetivo principal</label>
          <select
            name="main_objective"
            defaultValue={context?.main_objective ?? "none"}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="none">Sin objetivo</option>
            {Object.entries(MAIN_OBJECTIVES).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Budget de pauta mensual (MXN)</label>
          <input
            name="monthly_ad_budget"
            type="number"
            step="0.01"
            defaultValue={context?.monthly_ad_budget ?? ""}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { name: "target_roas", label: "ROAS objetivo (x)", val: context?.target_roas },
          { name: "target_cpa", label: "CPA objetivo ($)", val: context?.target_cpa },
          { name: "target_cpl", label: "CPL objetivo ($)", val: context?.target_cpl },
          { name: "target_leads_per_month", label: "Leads/mes", val: context?.target_leads_per_month },
        ].map(({ name, label, val }) => (
          <div key={name}>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
            <input
              name={name}
              type="number"
              step="any"
              defaultValue={val ?? ""}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        ))}
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Notas de cuenta <span className="text-muted-foreground/60">(briefing, buyer persona, restricciones, decisiones)</span>
        </label>
        <AutoTextarea
          name="account_notes"
          rows={4}
          defaultValue={context?.account_notes ?? ""}
          placeholder="El 'cerebro' de la cuenta…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      {/* Meta Ads credentials */}
      <div className="border-t border-border pt-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Integración Meta Ads</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Ad Account ID</label>
            <input
              name="meta_ad_account_id"
              type="text"
              defaultValue={context?.meta_ad_account_id ?? ""}
              placeholder="123456789"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
            />
            <p className="text-xs text-muted-foreground/60 mt-0.5">Solo el número, sin "act_"</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">System User Token</label>
            <div className="flex gap-1">
              <input
                name="meta_access_token"
                type={showToken ? "text" : "password"}
                defaultValue={context?.meta_access_token ?? ""}
                placeholder="EAAxxxxx…"
                className="flex-1 min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              />
              <button
                type="button"
                onClick={() => setShowToken((s) => !s)}
                className="px-2 text-xs text-muted-foreground hover:text-foreground border border-input rounded-md transition-colors"
              >
                {showToken ? "Ocultar" : "Ver"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {context && (
          <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            Cancelar
          </button>
        )}
        <button type="submit" disabled={isPending} className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {isPending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-lg p-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground mt-0.5">{value}</p>
    </div>
  )
}
