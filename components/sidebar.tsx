"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Anchor,
  LayoutDashboard,
  Users,
  FolderKanban,
  CheckSquare,
  DollarSign,
  UserCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Settings,
  Globe,
} from "lucide-react"
import { useState } from "react"
import Image from "next/image"
import { signOut } from "@/lib/auth-actions"
import { Button } from "@/components/ui/button"
import type { Profile } from "@/lib/types"

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/customers", icon: Users, label: "Clientes" },
  { href: "/projects", icon: FolderKanban, label: "Proyectos" },
  { href: "/tasks", icon: CheckSquare, label: "Tareas" },
  { href: "/finances", icon: DollarSign, label: "Finanzas", adminOnly: true },
  { href: "/finances/domains", icon: Globe, label: "Dominios", adminOnly: true },
  { href: "/employees", icon: UserCircle, label: "Empleados" },
  { href: "/settings", icon: Settings, label: "Configuración", adminOnly: true },
]

interface SidebarProps {
  profile: Profile | null
  logoUrl?: string | null
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  subadmin: "Subadmin",
  employee: "Empleado",
}

export function Sidebar({ profile, logoUrl }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const isAdmin = profile?.role === "admin"
  const visibleItems = navItems.filter((item) => !item.adminOnly || isAdmin)

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 sticky top-0",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary flex-shrink-0 overflow-hidden">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt="Logo"
              width={32}
              height={32}
              className="object-contain w-full h-full"
              unoptimized
            />
          ) : (
            <Anchor className="w-4 h-4 text-white" />
          )}
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="font-semibold text-sm leading-tight">Alpha Marino</p>
            <p className="text-xs text-muted-foreground">Dashboard</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto p-1 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive = item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* User + Logout */}
      <div className="border-t border-sidebar-border px-2 py-3 space-y-1">
        {profile && !collapsed && (
          <div className="px-3 py-2">
            <p className="text-sm font-medium truncate">{profile.full_name}</p>
            <p className="text-xs text-muted-foreground">
              {ROLE_LABELS[profile.role] ?? profile.role}
            </p>
          </div>
        )}
        <form action={signOut}>
          <Button
            type="submit"
            variant="ghost"
            className={cn(
              "w-full text-muted-foreground hover:text-foreground",
              collapsed ? "justify-center px-0" : "justify-start"
            )}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>Cerrar Sesión</span>}
          </Button>
        </form>
      </div>
    </aside>
  )
}
