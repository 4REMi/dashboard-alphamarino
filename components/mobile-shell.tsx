"use client"

import { useState } from "react"
import { Menu, Anchor } from "lucide-react"
import { Sidebar } from "@/components/sidebar"
import { ToastProvider } from "@/components/ui/toast"
import type { Profile } from "@/lib/types"
import Image from "next/image"

interface MobileShellProps {
  profile: Profile | null
  logoUrl?: string | null
  children: React.ReactNode
}

export function MobileShell({ profile, logoUrl, children }: MobileShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar
        profile={profile}
        logoUrl={logoUrl}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Right side: mobile header + main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Mobile header bar — hidden on desktop */}
        <header className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-border bg-sidebar flex-shrink-0 z-30 sticky top-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition-colors -ml-1"
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <div className={`flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 overflow-hidden ${logoUrl ? "" : "bg-primary"}`}>
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt="Logo"
                  width={28}
                  height={28}
                  className="object-contain w-full h-full"
                  unoptimized
                />
              ) : (
                <Anchor className="w-3.5 h-3.5 text-white" />
              )}
            </div>
            <span className="font-semibold text-sm">Alpha Marino</span>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <ToastProvider>
            {children}
          </ToastProvider>
        </main>
      </div>
    </div>
  )
}
