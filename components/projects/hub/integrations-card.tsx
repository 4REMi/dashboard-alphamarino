"use client"

import { useState, useTransition } from "react"
import type { ProjectIntegration } from "@/lib/types"
import { upsertProjectIntegration, deleteProjectIntegration } from "@/lib/actions/integrations"

interface Platform {
  id: string
  label: string
  icon: string
  placeholder: string
  hint: string
  syncable: boolean
}

const PLATFORMS: Platform[] = [
  { id: "meta",     label: "Meta Ads",      icon: "𝕄",  placeholder: "123456789",       hint: "Ad Account ID — solo el número, sin act_", syncable: true  },
  { id: "google",   label: "Google Ads",    icon: "G",  placeholder: "123-456-7890",    hint: "Customer ID",                               syncable: false },
  { id: "tiktok",   label: "TikTok Ads",    icon: "T",  placeholder: "7123456789",      hint: "Advertiser ID",                             syncable: false },
  { id: "linkedin", label: "LinkedIn Ads",  icon: "in", placeholder: "123456",          hint: "Account ID",                                syncable: false },
]

interface Props {
  projectId: string
  integrations: ProjectIntegration[]
  canEdit: boolean
}

export function IntegrationsCard({ projectId, integrations: initial, canEdit }: Props) {
  const [integrations, setIntegrations] = useState<ProjectIntegration[]>(initial)
  const [editing, setEditing] = useState<string | null>(null)   // platform id being edited
  const [draft, setDraft] = useState("")
  const [isPending, startTransition] = useTransition()

  function getIntegration(platformId: string) {
    return integrations.find((i) => i.platform === platformId) ?? null
  }

  function startEdit(platformId: string) {
    setEditing(platformId)
    setDraft(getIntegration(platformId)?.account_id ?? "")
  }

  function handleSave(platformId: string) {
    const value = draft.trim()
    if (!value) return
    startTransition(async () => {
      await upsertProjectIntegration(projectId, platformId, value)
      setIntegrations((prev) => {
        const existing = prev.find((i) => i.platform === platformId)
        if (existing) return prev.map((i) => i.platform === platformId ? { ...i, account_id: value } : i)
        return [...prev, { id: crypto.randomUUID(), project_id: projectId, platform: platformId, account_id: value, extra: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]
      })
      setEditing(null)
    })
  }

  function handleRemove(platformId: string) {
    if (!confirm("¿Desconectar esta plataforma?")) return
    startTransition(async () => {
      await deleteProjectIntegration(projectId, platformId)
      setIntegrations((prev) => prev.filter((i) => i.platform !== platformId))
    })
  }

  const connectedCount = PLATFORMS.filter((p) => getIntegration(p.id)).length

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Conexiones</h3>
          {connectedCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
              {connectedCount} activa{connectedCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      <div className="divide-y divide-border">
        {PLATFORMS.map((platform) => {
          const integration = getIntegration(platform.id)
          const isEditing = editing === platform.id
          const connected = !!integration

          return (
            <div key={platform.id} className="flex items-center gap-4 px-5 py-3">
              {/* Icon */}
              <div className="w-8 h-8 rounded-lg border border-border bg-muted/40 flex items-center justify-center text-xs font-bold text-foreground shrink-0 select-none">
                {platform.icon}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground">{platform.label}</span>
                  {platform.syncable && connected && (
                    <span className="text-xs text-green-600 font-medium">· Sync</span>
                  )}
                </div>

                {isEditing ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSave(platform.id); if (e.key === "Escape") setEditing(null) }}
                      placeholder={platform.placeholder}
                      className="flex-1 rounded-md border border-input bg-background px-2.5 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      onClick={() => handleSave(platform.id)}
                      disabled={isPending || !draft.trim()}
                      className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      Guardar
                    </button>
                    <button onClick={() => setEditing(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                      Cancelar
                    </button>
                  </div>
                ) : connected ? (
                  <p className="text-xs text-muted-foreground font-mono truncate">{integration.account_id}</p>
                ) : (
                  <p className="text-xs text-muted-foreground/60">{platform.hint}</p>
                )}
              </div>

              {/* Status dot + actions */}
              <div className="flex items-center gap-3 shrink-0">
                <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                {canEdit && !isEditing && (
                  connected ? (
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(platform.id)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Editar
                      </button>
                      <button onClick={() => handleRemove(platform.id)} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                        Quitar
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(platform.id)} className="text-xs text-primary hover:text-primary/80 font-medium transition-colors">
                      Configurar
                    </button>
                  )
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
