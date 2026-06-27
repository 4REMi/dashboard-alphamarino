"use client"

import { useState, useTransition, useEffect } from "react"
import type { ProjectIntegration } from "@/lib/types"
import { upsertProjectIntegration, deleteProjectIntegration } from "@/lib/actions/integrations"
import { getMetaAdAccounts } from "@/lib/actions/meta"
import type { MetaAdAccount } from "@/lib/actions/meta"
import { Loader2, Search, Check, Unplug, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  projectId: string
  integrations: ProjectIntegration[]
  canEdit: boolean
}

export function IntegrationsCard({ projectId, integrations: initial, canEdit }: Props) {
  const [integration, setIntegration] = useState<ProjectIntegration | null>(
    initial.find((i) => i.platform === "meta") ?? null
  )
  const [isPending, startTransition] = useTransition()
  const [showPicker, setShowPicker] = useState(false)
  const [accounts, setAccounts] = useState<MetaAdAccount[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  function openPicker() {
    setShowPicker(true)
    setSearch("")
    if (accounts.length === 0) loadAccounts()
  }

  async function loadAccounts() {
    setLoadingAccounts(true)
    setAccountError(null)
    const { accounts: accs, error } = await getMetaAdAccounts()
    setAccounts(accs)
    if (error) setAccountError(error)
    setLoadingAccounts(false)
  }

  function selectAccount(account: MetaAdAccount) {
    startTransition(async () => {
      await upsertProjectIntegration(projectId, "meta", account.account_id, { name: account.name, business_name: account.business_name })
      setIntegration({
        id: integration?.id ?? crypto.randomUUID(),
        project_id: projectId,
        platform: "meta",
        account_id: account.account_id,
        extra: { name: account.name, business_name: account.business_name },
        created_at: integration?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      setShowPicker(false)
    })
  }

  function handleDisconnect() {
    if (!confirm("¿Desconectar esta cuenta de Meta Ads?")) return
    startTransition(async () => {
      await deleteProjectIntegration(projectId, "meta")
      setIntegration(null)
    })
  }

  const filtered = accounts.filter((a) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      a.name.toLowerCase().includes(q) ||
      (a.business_name?.toLowerCase().includes(q) ?? false) ||
      a.account_id.includes(q)
    )
  })

  const selectedAccount = integration
    ? accounts.find((a) => a.account_id === integration.account_id)
    : null
  const displayName = (integration?.extra as any)?.name ?? selectedAccount?.name ?? null
  const displayBusiness = (integration?.extra as any)?.business_name ?? selectedAccount?.business_name ?? null

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Cuenta publicitaria</h3>
          {integration && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
              Conectada
            </span>
          )}
        </div>
      </div>

      {/* Connected state */}
      {integration && !showPicker && (
        <div className="px-5 py-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
              𝕄
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {displayName ?? "Meta Ads"}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                {displayBusiness && (
                  <span className="text-xs text-muted-foreground truncate">{displayBusiness}</span>
                )}
                <span className="text-xs text-muted-foreground font-mono">
                  act_{integration.account_id}
                </span>
              </div>
            </div>
            {canEdit && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={openPicker}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cambiar
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={isPending}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Unplug className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!integration && !showPicker && (
        <div className="px-5 py-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
            <span className="text-xl font-bold text-muted-foreground">𝕄</span>
          </div>
          <p className="text-sm text-muted-foreground mb-1">Sin cuenta publicitaria conectada</p>
          <p className="text-xs text-muted-foreground/60 mb-4">Conecta una cuenta de Meta Ads para sincronizar campañas</p>
          {canEdit && (
            <button
              onClick={openPicker}
              className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Conectar cuenta
            </button>
          )}
        </div>
      )}

      {/* Account picker */}
      {showPicker && (
        <div className="border-t border-border">
          {/* Search */}
          <div className="px-4 py-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cuenta..."
                className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Account list */}
          <div className="max-h-[280px] overflow-y-auto">
            {loadingAccounts ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando cuentas…
              </div>
            ) : accountError ? (
              <div className="px-5 py-6 text-center">
                <p className="text-sm text-destructive mb-2">{accountError}</p>
                <button onClick={loadAccounts} className="text-xs text-primary hover:text-primary/80">
                  Reintentar
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">
                {search ? "Sin resultados" : "No se encontraron cuentas"}
              </p>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((account) => {
                  const isSelected = integration?.account_id === account.account_id
                  const isActive = account.account_status === 1
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => selectAccount(account)}
                      disabled={isPending}
                      className={cn(
                        "w-full flex items-center gap-3 px-5 py-3 text-left transition-colors",
                        isSelected ? "bg-primary/5" : "hover:bg-muted/50",
                      )}
                    >
                      <div className="w-8 h-8 rounded-lg bg-blue-600/10 flex items-center justify-center text-blue-600 text-xs font-bold shrink-0">
                        𝕄
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">{account.name}</span>
                          {!isActive && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium shrink-0">
                              Inactiva
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {account.business_name && (
                            <span className="text-xs text-muted-foreground truncate">{account.business_name}</span>
                          )}
                          <span className="text-xs text-muted-foreground/60 font-mono">
                            act_{account.account_id}
                          </span>
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 text-primary shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-border bg-muted/20 flex justify-end">
            <button
              onClick={() => setShowPicker(false)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
