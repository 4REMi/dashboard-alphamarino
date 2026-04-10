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
  FlaskConical,
  BookOpen,
} from "lucide-react"
import { useState } from "react"
import Image from "next/image"
import { signOut } from "@/lib/auth-actions"
import { Button } from "@/components/ui/button"
import { can } from "@/lib/permissions"
import { ProfileEditModal } from "@/components/profile-edit-modal"
import { useTranslations } from "next-intl"
import type { Profile } from "@/lib/types"

interface SidebarProps {
  profile: Profile | null
  logoUrl?: string | null
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ profile, logoUrl, mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const t = useTranslations("nav")
  const tRoles = useTranslations("roles")

  const navItems = [
    { href: "/", icon: LayoutDashboard, label: t("dashboard") },
    { href: "/customers", icon: Users, label: t("clients") },
    { href: "/projects", icon: FolderKanban, label: t("projects") },
    { href: "/tasks", icon: CheckSquare, label: t("tasks") },
    { href: "/finances", icon: DollarSign, label: t("finances"), permission: "view_global_finances" as const },
    { href: "/finances/domains", icon: Globe, label: t("domains"), permission: "view_global_finances" as const },
    { href: "/employees", icon: UserCircle, label: t("team") },
    { href: "/sops", icon: BookOpen, label: "SOPs" },
    { href: "/operations", icon: FlaskConical, label: t("operationsLab"), adminOnly: true },
    { href: "/settings", icon: Settings, label: t("settings"), adminOnly: true },
  ]

  const isAdmin = profile?.role === "admin"
  const visibleItems = navItems.filter((item) => {
    if (item.adminOnly) return isAdmin
    if (item.permission) return can(profile, item.permission)
    return true
  })

  const roleLabel = profile?.role ? (tRoles(profile.role as "admin" | "subadmin" | "employee") ?? profile.role) : ""

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300",
        // Mobile: fixed overlay drawer
        "fixed inset-y-0 left-0 z-50",
        // Desktop: sticky in-flow sidebar
        "md:sticky md:top-0",
        // Mobile open/close via translate; desktop always visible
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        // Width: always w-60 on mobile, collapsible on desktop
        "w-60",
        collapsed && "md:w-16",
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className={`flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 overflow-hidden ${logoUrl ? "" : "bg-primary"}`}>
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
        {/* Collapse toggle — desktop only */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto p-1 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition-colors hidden md:flex"
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
              onClick={onMobileClose}
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
        {profile && (
          <div className={cn("px-3 py-2 flex items-center gap-2", collapsed && "justify-center px-0")}>
            <div className="w-8 h-8 rounded-full overflow-hidden bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
              {profile.avatar_url ? (
                <Image src={profile.avatar_url} alt={profile.full_name} width={32} height={32} className="object-cover w-full h-full" unoptimized />
              ) : (
                profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?"
              )}
            </div>
            {!collapsed && (
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <div className="overflow-hidden flex-1">
                  <p className="text-sm font-medium truncate">{profile.full_name}</p>
                  <p className="text-xs text-muted-foreground">{roleLabel}</p>
                </div>
                <ProfileEditModal profile={profile} />
              </div>
            )}
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
            {!collapsed && <span>{t("signOut")}</span>}
          </Button>
        </form>
      </div>
    </aside>
  )
}
