export type Role = "admin" | "employee"

// ============================================================
// PROJECT HUBS
// ============================================================
export type ProjectType = "paid_media" | "sitio_web"

export const SITIO_WEB_PHASES = [
  "Discovery & Scope",
  "Diseño UX/UI",
  "Desarrollo Frontend",
  "Desarrollo Backend",
  "QA & Testing",
  "Lanzamiento",
] as const

export const PAID_MEDIA_PLATFORMS = [
  "Google Ads",
  "Meta Ads",
  "TikTok Ads",
  "LinkedIn Ads",
  "X Ads",
  "Pinterest Ads",
] as const

export interface PaidMediaContext {
  id: string
  project_id: string
  platforms: string[]
  monthly_budget: number | null
  target_cpa: number | null
  target_roas: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PaidMediaCycle {
  id: string
  project_id: string
  cycle_month: string // ISO date, first of month
  budget_spent: number | null
  impressions: number | null
  clicks: number | null
  conversions: number | null
  cpa: number | null
  roas: number | null
  notes: string | null
  status: "active" | "closed"
  created_at: string
  updated_at: string
  deliverables?: PaidMediaCycleDeliverable[]
}

export interface PaidMediaCycleDeliverable {
  id: string
  cycle_id: string
  title: string
  done: boolean
  due_date: string | null
  created_at: string
}

export interface WebContext {
  id: string
  project_id: string
  tech_stack: string[]
  repo_url: string | null
  staging_url: string | null
  production_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface WebPhase {
  id: string
  project_id: string
  name: string
  phase_order: number
  status: "pending" | "in_progress" | "done"
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  deliverables?: WebDeliverable[]
}

export interface WebDeliverable {
  id: string
  phase_id: string
  project_id: string
  title: string
  done: boolean
  created_at: string
}

export interface ProjectLogEntry {
  id: string
  project_id: string
  author_id: string
  body: string
  pinned: boolean
  created_at: string
  author?: Profile
}

export const WEB_DELIVERABLES_DEFAULT: Record<string, string[]> = {
  "Discovery & Scope": [
    "Brief del cliente aprobado",
    "Sitemap definido",
    "Propuesta técnica firmada",
  ],
  "Diseño UX/UI": [
    "Wireframes aprobados",
    "Mockups mobile aprobados",
    "Mockups desktop aprobados",
    "Design system / tokens definidos",
  ],
  "Desarrollo Frontend": [
    "Componentes base listos",
    "Vistas principales implementadas",
    "Responsive review completado",
  ],
  "Desarrollo Backend": [
    "Base de datos configurada",
    "APIs / endpoints listos",
    "Integraciones externas conectadas",
  ],
  "QA & Testing": [
    "Pruebas funcionales pasadas",
    "Cross-browser testing completado",
    "Performance audit (Lighthouse ≥ 90)",
    "Bugs críticos resueltos",
  ],
  "Lanzamiento": [
    "DNS apuntando a producción",
    "SSL activo",
    "Analytics configurado",
    "Entrega de accesos al cliente",
  ],
}

export interface Profile {
  id: string
  full_name: string
  email: string
  role: Role
  position: string | null
  phone: string | null
  avatar_url: string | null
  created_at: string
}

export type CustomerStatus = "Prospect" | "Active" | "Inactive" | "Churned"

export interface Customer {
  id: string
  name: string
  status: CustomerStatus
  company: string | null
  email: string | null
  phone: string | null
  created_at: string
}

export type ProjectStatus = "Planning" | "In Progress" | "Review" | "Completed"

export interface Project {
  id: string
  name: string
  customer_id: string | null
  status: ProjectStatus
  project_type: ProjectType
  progress: number
  start_date: string | null
  end_date: string | null
  budget: number | null
  description: string | null
  created_at: string
  customer?: Customer
  tasks?: Task[]
  members?: Profile[]
  paid_media_context?: PaidMediaContext
  web_context?: WebContext
}

export type TaskStatus = "Todo" | "In Progress" | "Done"
export type TaskPriority = "Low" | "Medium" | "High"

export interface Task {
  id: string
  project_id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  assignee_id: string | null
  created_at: string
  project?: Project
  assignee?: Profile
}

export type ExpenseFrequency = "Monthly" | "Weekly" | "Annual" | "One-time"
export type ExpenseCategory = "Payroll" | "Software" | "Rent" | "Utilities" | "Other"

export interface RecurringExpense {
  id: string
  name: string
  amount: number
  frequency: ExpenseFrequency
  category: ExpenseCategory
  start_date: string
  is_active: boolean
  created_at: string
}

export interface Income {
  id: string
  project_id: string | null
  amount: number
  date: string
  description: string | null
  invoice_number: string | null
  created_at: string
  project?: Project
}

export interface ProjectExpense {
  id: string
  project_id: string
  amount: number
  date: string
  description: string | null
  category: string | null
  created_at: string
  project?: Project
}
