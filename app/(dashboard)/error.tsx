"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    // Visible en la consola del navegador Y en los logs del servidor
    console.error("=== DASHBOARD ERROR ===")
    console.error("Message:", error.message)
    console.error("Digest:", error.digest)
    console.error("Stack:", error.stack)
    console.error("=======================")
  }, [error])

  return (
    <div className="p-8 max-w-3xl space-y-4">
      <h2 className="text-xl font-bold text-destructive">Error ⚠️</h2>

      <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-3 font-mono text-sm">
        <div>
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Message</span>
          <p className="text-destructive font-semibold mt-0.5">
            {error.message || "(sin mensaje — ver logs del servidor)"}
          </p>
        </div>

        {error.digest && (
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Digest</span>
            <p className="mt-0.5">{error.digest}</p>
          </div>
        )}

        {error.stack && (
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Stack</span>
            <pre className="mt-0.5 text-xs overflow-auto max-h-48 whitespace-pre-wrap text-muted-foreground">
              {error.stack}
            </pre>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Reintentar
        </button>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 text-sm border rounded-md hover:bg-muted"
        >
          Volver
        </button>
      </div>
    </div>
  )
}
