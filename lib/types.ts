// ============================================================
// CORE TYPES
// ============================================================

export type Role = "admin" | "subadmin" | "employee"
export type ProjectStatus = "Active" | "Completed" | "Archived"
export type TaskStatus = "Todo" | "In Progress" | "Done"
/** @deprecated Use is_urgent boolean instead */
export type TaskPriority = "Low" | "Medium" | "High"
export type CustomerStatus = "Prospect" | "Active" | "Inactive"
export type ExpenseFrequency = "Monthly" | "Weekly" | "Annual" | "Semestral" | "One-time"
export type ExpenseCategory = "Payroll" | "Software" | "Rent" | "Services" | "Other"
export type PhaseStatus = "pending" | "in_progress" | "completed" | "blocked"
export type CycleDeliverableStatus = "pending" | "in_progress" | "delivered"
export type CampaignStatus = "active" | "paused" | "review" | "optimizing"
export type SopVisibility = "public" | "restricted"
export type SopRequestStatus = "pending" | "fulfilled" | "dismissed"
export type MainObjective = "conversions" | "leads" | "traffic" | "awareness"
export type ConceptStatus = "Active" | "Archived" | "Transmuted" | "Evergreen"
export type ClientReviewStatus = "pending_review" | "approved" | "changes_requested"
export type ProductionStatus = "Pending" | "In Production" | "In Review" | "Approved" | "Published"
export type AssetVerdict = "Winner" | "Scale" | "Iterate" | "Archive"
export type OrganizingPrinciple = "Pain-First" | "Desire-First"

// ============================================================
// ENTITIES
// ============================================================

export interface Profile {
  id: string
  full_name: string
  email: string
  role: Role
  position: string | null
  phone: string | null
  avatar_url: string | null
  permissions: Record<string, boolean> | null
  language: "es" | "en" | null
  created_at: string
}

export interface Customer {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  status: CustomerStatus
  created_at: string
  projects?: Array<{ id: string; name: string; status: string }>
}

// ============================================================
// CONFIGURATION
// ============================================================

export interface ProjectType {
  id: string
  name: string
  description: string | null
  default_phase_set_id: string | null
  color: string | null
  icon: string | null
  created_at: string
  default_phase_set?: PhaseSet
}

export interface PhaseSet {
  id: string
  name: string
  project_type_id: string | null
  created_at: string
  phases?: PhaseSetPhase[]
}

export interface PhaseSetPhase {
  id: string
  phase_set_id: string
  name: string
  description: string | null
  phase_order: number
  default_task_set_id: string | null
  created_at: string
}

export interface TaskSet {
  id: string
  name: string
  description: string | null
  default_assignee_id: string | null
  created_at: string
  tasks?: TaskSetTask[]
  default_assignee?: Profile | null
}

export interface TaskSetTask {
  id: string
  task_set_id: string
  title: string
  description: string | null
  priority: TaskPriority // kept for DB compat
  is_urgent: boolean
  requires_deliverable: boolean
  task_order: number
  sop_id: string | null
  created_at: string
  sop?: Sop | null
  checklist_items?: TaskSetChecklistItem[]
}

export interface TaskSetChecklistItem {
  id: string
  task_set_task_id: string
  text: string
  is_blocking: boolean
  item_order: number
  created_at: string
}

export interface TaskChecklistItem {
  id: string
  task_id: string
  text: string
  is_blocking: boolean
  is_checked: boolean
  item_order: number
  created_at: string
}

// ============================================================
// PROJECTS
// ============================================================

export interface Project {
  id: string
  name: string
  customer_id: string | null
  project_type_id: string | null
  status: ProjectStatus
  progress: number
  project_value: number | null
  monthly_fee: number | null
  start_date: string | null
  end_date: string | null
  description: string | null
  created_at: string
  // Relations
  customer?: Customer | null
  project_type?: ProjectType | null
  members?: Profile[]
  tasks?: Task[]
  phases?: ProjectPhase[]
}

export interface ProjectWithAttention extends Project {
  attention: {
    hasOverdueTasks: boolean
    hasBlockedPhase: boolean
    hasPendingCycleReport: boolean
    inactiveForDays: number
  }
}

export interface ProjectPhase {
  id: string
  project_id: string
  name: string
  description: string | null
  phase_order: number
  status: PhaseStatus
  started_at: string | null
  completed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ============================================================
// TASKS
// ============================================================

export type DeliverableType = "text" | "document" | "image"

export interface Deliverable {
  id: string
  task_id: string
  project_id: string
  type: DeliverableType
  title: string
  content: string | null      // for type = 'text'
  file_url: string | null     // for type = 'document' | 'image'
  file_name: string | null
  uploaded_by: string | null
  created_at: string
  updated_at: string
  // Relations
  task?: { title: string } | null
  uploader?: Profile | null
}

export interface Task {
  id: string
  project_id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority // kept for DB compat, use is_urgent in UI
  is_urgent: boolean
  requires_deliverable: boolean
  task_order: number
  phase_id: string | null
  due_date: string | null
  assignee_id: string | null
  sop_id: string | null
  task_set_task_id: string | null
  created_at: string
  project?: Project | null
  assignee?: Profile | null
  phase?: { id: string; name: string; phase_order: number } | null
  sop?: Sop | null
  task_set_task?: { sop_id: string | null; sop?: Sop | null } | null
  checklist_items?: TaskChecklistItem[]
}

// ============================================================
// SOPs
// ============================================================

export interface Sop {
  id: string
  title: string
  description: string | null
  doc_url: string | null
  video_url: string | null
  category: string | null
  tags: string[]
  visibility: SopVisibility
  author_id: string | null
  created_at: string
  updated_at: string
  author?: Profile | null
}

export interface SopRequest {
  id: string
  task_set_task_id: string | null
  task_id: string | null
  requested_by: string | null
  assigned_to: string | null
  note: string | null
  status: SopRequestStatus
  created_at: string
  requester?: Profile | null
  assignee?: Profile | null
  task?: { title: string } | null
  task_set_task?: { title: string } | null
}

// ============================================================
// PAID MEDIA HUB
// ============================================================

export interface PaidMediaContext {
  id: string
  project_id: string
  platforms: string[]
  monthly_ad_budget: number | null
  main_objective: MainObjective | null
  target_roas: number | null
  target_cpa: number | null
  target_cpl: number | null
  target_leads_per_month: number | null
  account_notes: string | null
  updated_at: string
}

export interface ProjectIntegration {
  id: string
  project_id: string
  platform: string
  account_id: string
  extra: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface MetaCampaign {
  id: string
  project_id: string
  cycle_id: string | null
  campaign_id: string
  campaign_name: string | null
  spend: number | null
  impressions: number | null
  clicks: number | null
  ctr: number | null
  cpc: number | null
  cpm: number | null
  reach: number | null
  results: number | null
  results_type: string | null
  date_start: string | null
  date_stop: string | null
  synced_at: string
}

export interface PaidMediaCycle {
  id: string
  project_id: string
  cycle_month: string // ISO date, first of month
  is_active: boolean
  campaign_status: CampaignStatus | null
  report_cutoff_date: string | null
  report_delivery_date: string | null
  report_status: CycleDeliverableStatus
  creative_status: CycleDeliverableStatus
  roas_real: number | null
  cpa_real: number | null
  cpl_real: number | null
  real_spend: number | null
  real_results: number | null
  created_at: string
}

export const PAID_MEDIA_PLATFORMS = [
  "Meta Ads",
  "Google Ads",
  "TikTok Ads",
  "LinkedIn Ads",
  "X Ads",
  "Pinterest Ads",
] as const

export const MAIN_OBJECTIVES: Record<MainObjective, string> = {
  conversions: "Conversiones",
  leads: "Leads",
  traffic: "Tráfico",
  awareness: "Reconocimiento",
}

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  active: "Activas",
  paused: "Pausadas",
  review: "En revisión",
  optimizing: "En optimización",
}

export const DELIVERABLE_STATUS_LABELS: Record<CycleDeliverableStatus, string> = {
  pending: "Pendiente",
  in_progress: "En proceso",
  delivered: "Entregado",
}

// ============================================================
// WEB DEV HUB
// ============================================================

export interface WebProjectContext {
  id: string
  project_id: string
  platform: string | null
  staging_url: string | null
  production_url: string | null
  technical_notes: string | null
  revisions_included: number
  revisions_used: number
  updated_at: string
}

// ============================================================
// PROJECT LOG
// ============================================================

export interface ProjectLogEntry {
  id: string
  project_id: string
  author_id: string
  body: string
  created_at: string
  author?: Profile | null
}

// ============================================================
// FINANCES
// ============================================================

export interface Income {
  id: string
  project_id: string | null
  amount: number
  date: string
  description: string | null
  invoice_number: string | null
  created_at: string
  project?: Project | null
}

export interface ProjectExpense {
  id: string
  project_id: string
  amount: number
  date: string
  description: string | null
  category: string | null
  created_at: string
  project?: Project | null
}

export interface RecurringExpense {
  id: string
  name: string
  amount: number
  frequency: ExpenseFrequency
  category: ExpenseCategory
  next_payment_date: string | null
  is_active: boolean
  created_at: string
}

export interface Domain {
  id: string
  customer_id: string | null
  domain: string
  registrar: string | null
  renewal_date: string | null
  renewal_cost: number | null
  notes: string | null
  created_at: string
  customer?: Customer | null
}

// ============================================================
// CREATIVE TRACKER
// ============================================================

export type FunnelStage = "TOF" | "MOF" | "BOF"

export interface CreativeConcept {
  id: string
  project_id: string
  cycle_id: string | null
  parent_concept_id: string | null
  name: string | null
  organizing_principle: OrganizingPrinciple | null
  product_service: string | null
  angle_type: string | null
  target_persona: string
  why_it_works: string | null
  pain_point: string | null
  objection: string | null
  transformation: string | null
  awareness_stage: number | null
  funnel_stage: FunnelStage | null
  ref_links: string | null
  proposed_hook: string | null
  status: ConceptStatus
  insight: string | null  // admin/subadmin only
  created_by: string | null
  created_at: string
  // relations
  parent?: Pick<CreativeConcept, "id" | "angle_type" | "status" | "insight"> | null
  creator?: Pick<Profile, "id" | "full_name"> | null
}

export interface CreativeAsset {
  id: string
  project_id: string
  cycle_id: string | null
  concept_id: string | null
  format: string | null
  platform: string | null
  variant: string | null
  iteration: string | null
  hook: string | null
  copy: string | null
  cta: string | null
  format_meta: Record<string, unknown> | null
  mechanic_primary: string | null
  mechanic_secondary: string | null
  asset_url: string | null
  production_status: ProductionStatus
  client_visible: boolean
  client_status: ClientReviewStatus | null
  client_feedback: string | null
  // admin/subadmin only
  ctr: number | null
  cpc: number | null
  cpm: number | null
  roas: number | null
  cpa: number | null
  spend: number | null
  results: number | null
  results_type: string | null
  verdict: AssetVerdict | null
  verdict_notes: string | null
  created_at: string
  // relations
  concept?: Pick<CreativeConcept, "id" | "name" | "angle_type" | "target_persona"> | null
}

// ============================================================
// HELPERS
// ============================================================

/** Normaliza un monto a su equivalente mensual */
export function normalizeToMonthly(amount: number, frequency: ExpenseFrequency): number {
  switch (frequency) {
    case "Monthly": return amount
    case "Weekly": return amount * 4.33
    case "Annual": return amount / 12
    case "Semestral": return amount / 6
    case "One-time": return 0
  }
}

export const PHASE_STATUS_LABELS: Record<PhaseStatus, string> = {
  pending: "Pendiente",
  in_progress: "En proceso",
  completed: "Completada",
  blocked: "Bloqueada",
}

export const PHASE_STATUS_COLORS: Record<PhaseStatus, string> = {
  pending: "text-muted-foreground",
  in_progress: "text-amber-500",
  completed: "text-green-500",
  blocked: "text-destructive",
}
