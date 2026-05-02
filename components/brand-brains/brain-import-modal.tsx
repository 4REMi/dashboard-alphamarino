"use client"

import { useState } from "react"
import { X, Globe, Loader2, Sparkles, AlertCircle } from "lucide-react"
import type { BrandBrain } from "@/lib/types"
import { importBrainFromInstagram, importBrainFromWebsite } from "@/lib/actions/brand-brain-import"

interface Props {
  onClose:      () => void
  onDraftReady: (draft: Partial<BrandBrain>) => void
}

export function BrainImportModal({ onClose, onDraftReady }: Props) {
  const [instagram,    setInstagram]    = useState("")
  const [website,      setWebsite]      = useState("")
  const [isLoading,    setIsLoading]    = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  const canSubmit = !isLoading && (instagram.trim() || website.trim())

  async function handleImport() {
    setIsLoading(true)
    setError(null)
    try {
      const tasks: Promise<Partial<BrandBrain>>[] = []
      if (instagram.trim()) tasks.push(importBrainFromInstagram(instagram.trim()))
      if (website.trim())   tasks.push(importBrainFromWebsite(website.trim()))

      const results = await Promise.all(tasks)

      // Merge: first source is base, second fills empty fields
      const draft = results.reduce<Partial<BrandBrain>>((acc, r) => {
        return {
          ...r,
          // Keep non-empty values from previous sources
          name:            acc.name            || r.name,
          industry:        acc.industry        || r.industry,
          tone_of_voice:   acc.tone_of_voice   || r.tone_of_voice,
          description:     acc.description     || r.description,
          target_audience: acc.target_audience || r.target_audience,
          logo_url:        acc.logo_url        || r.logo_url,
          // Merge arrays, deduplicate
          usps:         [...new Set([...(acc.usps ?? []),         ...(r.usps ?? [])])],
          key_benefits: [...new Set([...(acc.key_benefits ?? []), ...(r.key_benefits ?? [])])],
          pain_points:  [...new Set([...(acc.pain_points ?? []),  ...(r.pain_points ?? [])])],
          ctas:         [...new Set([...(acc.ctas ?? []),         ...(r.ctas ?? [])])],
          key_features: [...new Set([...(acc.key_features ?? []), ...(r.key_features ?? [])])],
        }
      }, {})

      onDraftReady(draft)
    } catch (err) {
      setError(String(err).replace("Error: ", ""))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-background rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Importar Brand Brain</h2>
              <p className="text-xs text-muted-foreground">Claude analizará las fuentes y generará un draft</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Instagram */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              <span className="text-[11px]">IG</span>
              Instagram
            </label>
            <input
              type="text"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="@usuario o nombre de perfil"
              disabled={isLoading}
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
            />
          </div>

          {/* Website */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              <Globe className="w-3.5 h-3.5" />
              Sitio web
            </label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://marca.com"
              disabled={isLoading}
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Puedes usar una o ambas fuentes. Si usas las dos, Claude fusiona la información para un draft más completo.
          </p>

          {error && (
            <div className="flex items-start gap-2 text-destructive bg-destructive/10 rounded-xl px-3 py-2.5 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="h-9 px-4 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleImport}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 h-9 px-5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {isLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizando…</>
              : <><Sparkles className="w-4 h-4" /> Generar draft</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
