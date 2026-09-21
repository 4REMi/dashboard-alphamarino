"use client"

import { useEffect, useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { getProjectOptions } from "@/lib/actions/projects"
import { getProjectConceptOptions, sendGeneratedImageToProject } from "@/lib/actions/creatives"
import { Loader2 } from "lucide-react"

const PLATFORMS = ["Meta Ads", "Google Ads", "TikTok Ads", "LinkedIn Ads", "Pinterest Ads"]

interface Props {
  imageUrl: string
  onClose: () => void
}

export function SendToProjectModal({ imageUrl, onClose }: Props) {
  const [isPending, startTransition] = useTransition()
  const [projects, setProjects]       = useState<{ id: string; name: string }[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [projectId, setProjectId]     = useState("")
  const [concepts, setConcepts]       = useState<{ id: string; name: string | null; angle_type: string | null }[]>([])
  const [loadingConcepts, setLoadingConcepts] = useState(false)
  const [conceptId, setConceptId]     = useState("")
  const [platform, setPlatform]       = useState(PLATFORMS[0])
  const [error, setError]             = useState<string | null>(null)
  const [done, setDone]               = useState(false)

  useEffect(() => {
    getProjectOptions().then(setProjects).catch(() => setProjects([])).finally(() => setLoadingProjects(false))
  }, [])

  function selectProject(id: string) {
    setProjectId(id)
    setConceptId("")
    setConcepts([])
    if (!id) return
    setLoadingConcepts(true)
    getProjectConceptOptions(id)
      .then(setConcepts)
      .catch(() => setConcepts([]))
      .finally(() => setLoadingConcepts(false))
  }

  function handleConfirm() {
    if (!projectId || !conceptId) return
    setError(null)
    startTransition(async () => {
      try {
        await sendGeneratedImageToProject(projectId, conceptId, imageUrl, platform)
        setDone(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo enviar el estático")
      }
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar a proyecto</DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm font-medium">Estático agregado al ángulo creativo.</p>
            <Button size="sm" onClick={onClose}>Listo</Button>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div className="rounded-lg overflow-hidden border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="" className="w-full h-40 object-cover" />
              </div>

              <div className="space-y-1.5">
                <Label>Proyecto</Label>
                <select
                  value={projectId}
                  onChange={(e) => selectProject(e.target.value)}
                  disabled={loadingProjects}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">{loadingProjects ? "Cargando…" : "Selecciona un proyecto"}</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {projectId && (
                <div className="space-y-1.5">
                  <Label>Ángulo creativo</Label>
                  <select
                    value={conceptId}
                    onChange={(e) => setConceptId(e.target.value)}
                    disabled={loadingConcepts}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">
                      {loadingConcepts ? "Cargando…" : concepts.length === 0 ? "Sin ángulos en este proyecto" : "Selecciona un ángulo"}
                    </option>
                    {concepts.map((c) => (
                      <option key={c.id} value={c.id}>{c.name ?? c.angle_type ?? "Sin nombre"}</option>
                    ))}
                  </select>
                </div>
              )}

              {conceptId && (
                <div className="space-y-1.5">
                  <Label>Plataforma</Label>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              )}

              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>Cancelar</Button>
              <Button size="sm" onClick={handleConfirm} disabled={!projectId || !conceptId || isPending}>
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Enviar"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
