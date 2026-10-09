"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Sparkles, Loader2 } from "lucide-react"
import { StandupDump } from "@/components/tasks/standup-dump"
import { getQuickCaptureData } from "@/lib/actions/standup"

// Captura rápida "on demand": botón flotante + atajo Ctrl/⌘+J en cualquier
// página del dashboard. Los datos (proyectos, equipo, SOPs) se cargan la
// primera vez que se abre. En /tasks no se muestra: ahí ya está el botón.
type Data = Awaited<ReturnType<typeof getQuickCaptureData>>

export function GlobalQuickCapture() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const hidden = pathname === "/tasks"

  const openCapture = useCallback(() => {
    setOpen(true)
    if (data || loading) return
    setLoading(true)
    getQuickCaptureData().then(setData).catch(() => setOpen(false)).finally(() => setLoading(false))
  }, [data, loading])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j" && !hidden) { e.preventDefault(); openCapture() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openCapture, hidden])

  if (hidden && !open) return null
  return (
    <>
      {!open && (
        <button type="button" onClick={openCapture} title="Captura rápida (Ctrl/⌘ + J)"
          className="fixed bottom-5 right-5 z-40 h-12 pl-4 pr-5 rounded-full bg-violet-600 text-white shadow-lg hover:bg-violet-700 inline-flex items-center gap-2 text-sm font-medium print:hidden">
          <Sparkles className="w-4 h-4" />Captura rápida
        </button>
      )}
      {open && loading && (
        <div className="fixed bottom-5 right-5 z-40 h-12 px-5 rounded-full bg-violet-600 text-white shadow-lg inline-flex items-center gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" />Abriendo…</div>
      )}
      {open && data && (
        <StandupDump
          projects={data.projects}
          employees={data.employees}
          sops={data.sops}
          currentUserId={data.currentUserId}
          onClose={() => setOpen(false)}
          onCreated={() => router.refresh()}
        />
      )}
    </>
  )
}
