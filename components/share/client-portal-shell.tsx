"use client"

import { ReactNode, useEffect, useState } from "react"
import Image from "next/image"

interface Props {
  brand: string
  logoUrl?: string | null
  clientName: string | null
  projectName: string
  children: ReactNode
}

export function ClientPortalShell({ brand, logoUrl, clientName, projectName, children }: Props) {
  const [progress, setProgress] = useState(0)
  const [condensed, setCondensed] = useState(false)

  useEffect(() => {
    function onScroll() {
      const h = document.documentElement
      const scrolled = h.scrollTop
      const max = h.scrollHeight - h.clientHeight
      setProgress(max > 0 ? Math.min(100, (scrolled / max) * 100) : 0)
      setCondensed(scrolled > 80)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <div className="min-h-screen bg-[#f5f6fa] flex flex-col text-slate-900">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur-md border-b border-slate-200/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`w-7 h-7 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center ${logoUrl ? "" : "bg-slate-900 text-white"}`}>
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt={brand}
                  width={28}
                  height={28}
                  className="object-contain w-full h-full"
                  unoptimized
                />
              ) : (
                <span className="text-[11px] font-bold">A</span>
              )}
            </span>
            <span className="text-sm font-semibold tracking-tight flex-shrink-0">{brand}</span>
            {condensed && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-xs text-slate-600 truncate">{projectName}</span>
              </>
            )}
          </div>
          {clientName && !condensed && (
            <span className="text-xs text-slate-500 truncate">
              {clientName} — Portal del cliente
            </span>
          )}
        </div>
        {/* Scroll progress */}
        <div
          className="h-[2px] bg-slate-900 transition-[width] duration-75"
          style={{ width: `${progress}%` }}
        />
      </header>

      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-slate-200/70 bg-white mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            ¿Tienes dudas?{" "}
            <a
              href="mailto:remioi622@gmail.com"
              className="underline decoration-slate-300 underline-offset-2 hover:text-slate-900 hover:decoration-slate-900 transition-colors"
            >
              remioi622@gmail.com
            </a>
          </span>
          <span>© {new Date().getFullYear()} {brand}</span>
        </div>
      </footer>
    </div>
  )
}
