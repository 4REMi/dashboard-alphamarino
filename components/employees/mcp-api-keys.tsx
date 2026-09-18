"use client"

import { useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { createMcpApiKey, listMcpApiKeys, revokeMcpApiKey, type McpApiKeySummary } from "@/lib/actions/mcp-keys"
import { Plus, Loader2, Copy, Check, Trash2, KeyRound } from "lucide-react"

function formatDate(iso: string | null) {
  if (!iso) return "nunca"
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })
}

// URL absoluta hacia el endpoint MCP de este mismo dashboard — se muestra
// junto a la key recién creada para copiar y pegar directo en la config
// del cliente de MCP (Claude, etc.), sin tener que ir a adivinarla.
function mcpEndpointUrl() {
  if (typeof window === "undefined") return "/api/mcp"
  return `${window.location.origin}/api/mcp`
}

export function McpApiKeys({ profileId }: { profileId: string }) {
  const [keys, setKeys] = useState<McpApiKeySummary[]>([])
  const [newKeyName, setNewKeyName] = useState("")
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState<"key" | "url" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    listMcpApiKeys().then(setKeys).catch(() => {})
  }, [profileId])

  function handleCreate() {
    setError(null)
    startTransition(async () => {
      try {
        const raw = await createMcpApiKey(newKeyName)
        setRevealedKey(raw)
        setNewKeyName("")
        setKeys(await listMcpApiKeys())
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo generar la key")
      }
    })
  }

  function handleRevoke(id: string) {
    if (!confirm("¿Revocar esta API key? Cualquier cliente de MCP que la esté usando dejará de funcionar de inmediato.")) return
    setError(null)
    startTransition(async () => {
      try {
        await revokeMcpApiKey(id)
        setKeys(await listMcpApiKeys())
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo revocar")
      }
    })
  }

  function copy(text: string, which: "key" | "url") {
    navigator.clipboard.writeText(text)
    setCopied(which)
    setTimeout(() => setCopied(null), 1500)
  }

  const activeKeys = keys.filter((k) => !k.revoked_at)

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Genera una key personal para que Claude (o cualquier cliente compatible con MCP) pueda crear/completar tareas
        y agregar notas de bitácora por ti, con los mismos permisos que ya tienes en el dashboard.
      </p>

      {revealedKey ? (
        <div className="space-y-2 p-3 rounded-lg border border-amber-300 bg-amber-50">
          <p className="text-xs font-medium text-amber-800">
            Copia esta key ahora — no se vuelve a mostrar completa después de cerrar esto.
          </p>
          <div className="flex items-center gap-2 p-2 rounded-md bg-white border">
            <code className="text-xs font-mono flex-1 break-all">{revealedKey}</code>
            <Button size="sm" variant="ghost" onClick={() => copy(revealedKey, "key")} className="h-7 px-2 flex-shrink-0">
              {copied === "key" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-md bg-white border">
            <code className="text-xs font-mono flex-1 break-all">{mcpEndpointUrl()}</code>
            <Button size="sm" variant="ghost" onClick={() => copy(mcpEndpointUrl(), "url")} className="h-7 px-2 flex-shrink-0">
              {copied === "url" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            En tu cliente de MCP, agrega un conector con esta URL y usa la key como Bearer token.
          </p>
          <Button size="sm" variant="outline" onClick={() => setRevealedKey(null)}>Listo</Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Nombre (ej. Claude en mi laptop)"
            className="flex-1 text-sm rounded-md border border-input bg-background px-2.5 py-1.5"
          />
          <Button size="sm" variant="outline" onClick={handleCreate} disabled={isPending}>
            {isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
            Generar key
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {activeKeys.length > 0 && (
        <div className="space-y-1.5 border-t pt-2">
          {activeKeys.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <KeyRound className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="font-medium truncate">{k.name}</span>
                <span className="text-muted-foreground flex-shrink-0">· usada {formatDate(k.last_used_at)}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => handleRevoke(k.id)} disabled={isPending} className="text-muted-foreground hover:text-destructive flex-shrink-0 h-6 px-1.5">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
