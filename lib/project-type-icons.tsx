import {
  ShoppingCart, Globe, BarChart2, Megaphone, Code2, LayoutDashboard,
  Search, Mail, Share2, Video, PenTool, Database, Smartphone,
  Monitor, Store, Briefcase, TrendingUp, Zap, Package, Users,
  Camera, Layers, Palette, Target, Rocket, Settings, FileText,
  Link2, CloudUpload, Bot,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import {
  SiShopify, SiWordpress, SiWoocommerce, SiWebflow,
  SiMeta, SiFacebook, SiInstagram, SiGoogleads, SiGoogle,
  SiTiktok, SiX, SiYoutube,
  SiMailchimp, SiHubspot, SiStripe,
  SiNotion, SiZapier,
} from "@icons-pack/react-simple-icons"

// Generic icon type — Lucide and Simple Icons both accept className
type AnyIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties }>

export interface IconEntry {
  name: string
  icon: AnyIcon
  label: string
  group: "general" | "brand"
}

export const PROJECT_TYPE_ICONS: IconEntry[] = [
  // ── General ──────────────────────────────────────────────────────────────
  { name: "ShoppingCart",    icon: ShoppingCart,    label: "eCommerce",      group: "general" },
  { name: "Store",           icon: Store,           label: "Tienda",         group: "general" },
  { name: "Globe",           icon: Globe,           label: "Web",            group: "general" },
  { name: "Monitor",         icon: Monitor,         label: "Sitio",          group: "general" },
  { name: "BarChart2",       icon: BarChart2,       label: "Analytics",      group: "general" },
  { name: "TrendingUp",      icon: TrendingUp,      label: "Crecimiento",    group: "general" },
  { name: "Target",          icon: Target,          label: "Objetivo",       group: "general" },
  { name: "Megaphone",       icon: Megaphone,       label: "Marketing",      group: "general" },
  { name: "Share2",          icon: Share2,          label: "Social",         group: "general" },
  { name: "Mail",            icon: Mail,            label: "Email",          group: "general" },
  { name: "Search",          icon: Search,          label: "SEO",            group: "general" },
  { name: "Code2",           icon: Code2,           label: "Desarrollo",     group: "general" },
  { name: "Database",        icon: Database,        label: "Base de datos",  group: "general" },
  { name: "CloudUpload",     icon: CloudUpload,     label: "Cloud",          group: "general" },
  { name: "Bot",             icon: Bot,             label: "Automatización", group: "general" },
  { name: "Smartphone",      icon: Smartphone,      label: "Mobile",         group: "general" },
  { name: "PenTool",         icon: PenTool,         label: "Diseño",         group: "general" },
  { name: "Palette",         icon: Palette,         label: "Creativo",       group: "general" },
  { name: "Camera",          icon: Camera,          label: "Foto/Video",     group: "general" },
  { name: "Video",           icon: Video,           label: "Video",          group: "general" },
  { name: "Layers",          icon: Layers,          label: "Capas",          group: "general" },
  { name: "LayoutDashboard", icon: LayoutDashboard, label: "Dashboard",      group: "general" },
  { name: "FileText",        icon: FileText,        label: "Contenido",      group: "general" },
  { name: "Link2",           icon: Link2,           label: "Links",          group: "general" },
  { name: "Package",         icon: Package,         label: "Producto",       group: "general" },
  { name: "Briefcase",       icon: Briefcase,       label: "Consultoría",    group: "general" },
  { name: "Users",           icon: Users,           label: "Comunidad",      group: "general" },
  { name: "Rocket",          icon: Rocket,          label: "Lanzamiento",    group: "general" },
  { name: "Zap",             icon: Zap,             label: "Performance",    group: "general" },
  { name: "Settings",        icon: Settings,        label: "Configuración",  group: "general" },

  // ── Brands ───────────────────────────────────────────────────────────────
  { name: "SiShopify",     icon: SiShopify,     label: "Shopify",      group: "brand" },
  { name: "SiWoocommerce", icon: SiWoocommerce, label: "WooCommerce",  group: "brand" },
  { name: "SiWordpress",   icon: SiWordpress,   label: "WordPress",    group: "brand" },
  { name: "SiWebflow",     icon: SiWebflow,     label: "Webflow",      group: "brand" },
  { name: "SiGoogleads",   icon: SiGoogleads,   label: "Google Ads",   group: "brand" },
  { name: "SiGoogle",      icon: SiGoogle,      label: "Google",       group: "brand" },
  { name: "SiMeta",        icon: SiMeta,        label: "Meta",         group: "brand" },
  { name: "SiFacebook",    icon: SiFacebook,    label: "Facebook",     group: "brand" },
  { name: "SiInstagram",   icon: SiInstagram,   label: "Instagram",    group: "brand" },
  { name: "SiTiktok",      icon: SiTiktok,      label: "TikTok",       group: "brand" },
  { name: "SiX",           icon: SiX,           label: "X / Twitter",  group: "brand" },
  { name: "SiYoutube",     icon: SiYoutube,     label: "YouTube",      group: "brand" },
  { name: "SiMailchimp",   icon: SiMailchimp,   label: "Mailchimp",    group: "brand" },
  { name: "SiHubspot",     icon: SiHubspot,     label: "HubSpot",      group: "brand" },
  { name: "SiStripe",      icon: SiStripe,      label: "Stripe",       group: "brand" },
  { name: "SiNotion",      icon: SiNotion,      label: "Notion",       group: "brand" },
  { name: "SiZapier",      icon: SiZapier,      label: "Zapier",       group: "brand" },
]

const ICON_MAP = Object.fromEntries(
  PROJECT_TYPE_ICONS.map(({ name, icon }) => [name, icon])
) as Record<string, AnyIcon>

export function getProjectTypeIcon(name: string | null | undefined): AnyIcon | null {
  if (!name) return null
  return ICON_MAP[name] ?? null
}
