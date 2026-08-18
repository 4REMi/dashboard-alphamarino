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
  Lightbulb,
  Tv2,
  Brain,
  ImagePlay,
  Expand,
  LayoutGrid,
  FolderOpen,
  Radio,
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

type Permission = "view_global_finances" | "view_domains" | "access_ad_lab" | "access_brand_brains"

type NavChild = {
  href: string
  icon: React.ElementType
  label: string
  permission?: Permission
}

type NavItem = {
  href: string
  icon: React.ElementType
  label: string
  permission?: Permission
  adminOnly?: boolean
  children?: NavChild[]
}

export function Sidebar({ profile, logoUrl, mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const t = useTranslations("nav")
  const tRoles = useTranslations("roles")

  const navItems: NavItem[] = [
    { href: "/", icon: LayoutDashboard, label: t("dashboard") },
    { href: "/customers", icon: Users, label: t("clients") },
    { href: "/projects", icon: FolderKanban, label: t("projects") },
    { href: "/tasks", icon: CheckSquare, label: t("tasks") },
    { href: "/finances", icon: DollarSign, label: t("finances"), permission: "view_global_finances" },
    { href: "/finances/domains", icon: Globe, label: t("domains"), permission: "view_domains" },
    { href: "/employees", icon: UserCircle, label: t("team") },
    { href: "/sops", icon: BookOpen, label: "SOPs" },
    {
      href: "/ad-lab", icon: Tv2, label: "Ad Lab", permission: "access_ad_lab",
      children: [
        { href: "/ad-lab/discovery", icon: LayoutGrid, label: "Discovery"     },
        { href: "/ad-lab/boards",    icon: FolderOpen, label: "Boards"        },
        { href: "/ad-lab/brands",    icon: Radio,      label: "Marcas"        },
        { href: "/ad-lab/creatives", icon: ImagePlay,  label: "Creatives"     },
        { href: "/ad-lab/resize",    icon: Expand,     label: "Image Resize"  },
        { href: "/brand-brains",     icon: Brain,      label: "Brand Brains", permission: "access_brand_brains" },
      ],
    },
    {
      href: "/operations", icon: FlaskConical, label: t("operationsLab"), adminOnly: true,
    },
    { href: "/my-lab", icon: Lightbulb, label: "Mi Ops Lab" },
    { href: "/settings", icon: Settings, label: t("settings"), adminOnly: true },
  ]

  const isAdmin = profile?.role === "admin"
  const visibleItems = navItems.filter((item) => {
    if (item.adminOnly) return isAdmin
    if (item.permission) return can(profile, item.permission)
    return true
  })

  // Auto-expand sections whose children (or the section itself) match the current path
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const expanded = new Set<string>()
    for (const item of navItems) {
      if (!item.children) continue
      const selfActive   = pathname.startsWith(item.href)
      const childActive  = item.children.some((c) => pathname.startsWith(c.href))
      if (selfActive || childActive) expanded.add(item.href)
    }
    return expanded
  })

  function toggleSection(href: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      next.has(href) ? next.delete(href) : next.add(href)
      return next
    })
  }

  const roleLabel = profile?.role
    ? (tRoles(profile.role as "admin" | "subadmin" | "employee") ?? profile.role)
    : ""

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300",
        "fixed inset-y-0 left-0 z-50",
        "md:sticky md:top-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        "w-60",
        collapsed && "md:w-16",
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className={`flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 overflow-hidden ${logoUrl ? "" : "bg-primary"}`}>
          {logoUrl ? (
            <Image src={logoUrl} alt="Logo" width={32} height={32} className="object-contain w-full h-full" unoptimized />
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

          const visibleChildren = item.children?.filter((c) => {
            if (!c.permission) return true
            return can(profile, c.permission)
          })
          const hasChildren = visibleChildren && visibleChildren.length > 0
          const isExpanded  = expandedSections.has(item.href)

          return (
            <div key={item.href}>
              {/* Parent row */}
              <div className="flex items-center gap-0.5">
                <Link
                  href={item.href}
                  onClick={onMobileClose}
                  className={cn(
                    "flex-1 flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors min-w-0",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                  )}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>

                {/* Chevron toggle — only when not collapsed and has children */}
                {!collapsed && hasChildren && (
                  <button
                    onClick={() => toggleSection(item.href)}
                    className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors flex-shrink-0"
                    aria-label={isExpanded ? "Colapsar" : "Expandir"}
                  >
                    <ChevronRight
                      className={cn("w-3.5 h-3.5 transition-transform duration-150", isExpanded && "rotate-90")}
                    />
                  </button>
                )}
              </div>

              {/* Children */}
              {!collapsed && isExpanded && visibleChildren?.map((child) => {
                const childActive = pathname.startsWith(child.href)
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    onClick={onMobileClose}
                    className={cn(
                      "flex items-center gap-3 pl-9 pr-3 py-1.5 rounded-lg text-sm font-medium transition-colors mt-0.5",
                      childActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                    )}
                  >
                    <child.icon className="w-4 h-4 flex-shrink-0" />
                    <span>{child.label}</span>
                  </Link>
                )
              })}
            </div>
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
