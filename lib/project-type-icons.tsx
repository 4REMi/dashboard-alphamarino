import {
  ShoppingCart, Globe, BarChart2, Megaphone, Code2, LayoutDashboard,
  Search, Mail, Share2, Video, PenTool, Database, Smartphone,
  Monitor, Store, Briefcase, TrendingUp, Zap, Package, Users,
  Camera, Layers, Palette, Target, Rocket, Settings, FileText,
  Link2, CloudUpload, Bot,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export const PROJECT_TYPE_ICONS: { name: string; icon: LucideIcon; label: string }[] = [
  { name: "ShoppingCart",    icon: ShoppingCart,    label: "eCommerce"    },
  { name: "Store",           icon: Store,           label: "Tienda"       },
  { name: "Globe",           icon: Globe,           label: "Web"          },
  { name: "Monitor",         icon: Monitor,         label: "Sitio"        },
  { name: "BarChart2",       icon: BarChart2,       label: "Analytics"    },
  { name: "TrendingUp",      icon: TrendingUp,      label: "Crecimiento"  },
  { name: "Target",          icon: Target,          label: "Objetivo"     },
  { name: "Megaphone",       icon: Megaphone,       label: "Marketing"    },
  { name: "Share2",          icon: Share2,          label: "Social"       },
  { name: "Mail",            icon: Mail,            label: "Email"        },
  { name: "Search",          icon: Search,          label: "SEO"          },
  { name: "Code2",           icon: Code2,           label: "Desarrollo"   },
  { name: "Database",        icon: Database,        label: "Base de datos" },
  { name: "CloudUpload",     icon: CloudUpload,     label: "Cloud"        },
  { name: "Bot",             icon: Bot,             label: "Automatización" },
  { name: "Smartphone",      icon: Smartphone,      label: "Mobile"       },
  { name: "PenTool",         icon: PenTool,         label: "Diseño"       },
  { name: "Palette",         icon: Palette,         label: "Creativo"     },
  { name: "Camera",          icon: Camera,          label: "Foto/Video"   },
  { name: "Video",           icon: Video,           label: "Video"        },
  { name: "Layers",          icon: Layers,          label: "Capas"        },
  { name: "LayoutDashboard", icon: LayoutDashboard, label: "Dashboard"    },
  { name: "FileText",        icon: FileText,        label: "Contenido"    },
  { name: "Link2",           icon: Link2,           label: "Links"        },
  { name: "Package",         icon: Package,         label: "Producto"     },
  { name: "Briefcase",       icon: Briefcase,       label: "Consultoría"  },
  { name: "Users",           icon: Users,           label: "Comunidad"    },
  { name: "Rocket",          icon: Rocket,          label: "Lanzamiento"  },
  { name: "Zap",             icon: Zap,             label: "Performance"  },
  { name: "Settings",        icon: Settings,        label: "Configuración" },
]

const ICON_MAP = Object.fromEntries(
  PROJECT_TYPE_ICONS.map(({ name, icon }) => [name, icon])
) as Record<string, LucideIcon>

export function getProjectTypeIcon(name: string | null | undefined): LucideIcon | null {
  if (!name) return null
  return ICON_MAP[name] ?? null
}
