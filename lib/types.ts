// ============================================================
// CORE TYPES
// ============================================================

export type Role = "admin" | "subadmin" | "employee"
export type ProjectStatus = "Active" | "Completed" | "Archived"
export type TaskStatus = "Todo" | "In Progress" | "Done"
/** @deprecated Kept for task_set_tasks/Ops Lab template compat only — live tasks use is_pinged instead */
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

export interface Position {
  id: string
  name: string
  created_at: string
}

export interface Profile {
  id: string
  full_name: string
  email: string
  role: Role
  position: string | null
  position_id: string | null
  position_obj?: Position | null
  phone: string | null
  avatar_url: string | null
  permissions: Record<string, boolean> | null
  language: "es" | "en" | null
  telegram_chat_id: number | null
  telegram_linked_at: string | null
  telegram_unlinked_at: string | null
  notification_preferences: Record<string, boolean> | null
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
  created_at: string
  tasks?: TaskSetTask[]
}

export interface TaskSetTask {
  id: string
  task_set_id: string
  title: string
  description: string | null
  priority: TaskPriority // kept for DB compat
  is_urgent: boolean
  // Template default for Ping — resolved into a real task's is_pinged /
  // ping_recipient_ids when this template is applied to a project (puestos
  // resolve against that project's actual roster; no puesto match falls
  // back to broadcasting to everyone rather than notifying no one).
  is_pinged: boolean
  ping_position_ids: string[] | null
  requires_deliverable: boolean
  deliverable_instructions: string | null
  task_order: number
  sop_id: string | null
  default_position_id: string | null
  created_at: string
  sop?: Sop | null
  default_position?: Position | null
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
  brand_brain_id: string | null
  paid_media_cycle_start_day: number | null
  // Opt-in only — a cycle still open past its end_date auto-closes instead
  // of just getting a one-time overdue notice. Off by default; never a
  // blanket behavior across projects.
  auto_close_cycles: boolean
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
    hasPendingClientChanges: boolean
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
  project_id: string | null
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
  project_id: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority // kept for DB compat, unused in UI
  // "Ping" — marking a task pinged and later completing it notifies the
  // whole project team. Replaces the old decorative "Urgente" flag.
  is_pinged: boolean
  // NULL/empty = broadcast to every project member (default). Non-empty =
  // only these profile ids get notified on completion — narrows WHO hears
  // about it, never blocks the task itself on anything.
  ping_recipient_ids: string[] | null
  requires_deliverable: boolean
  deliverable_instructions: string | null
  // Stays linked to project_id for context/grouping in "Mi lista", but is
  // deliberately excluded from that project's shared board/progress — for
  // personal-only detail work that shouldn't clutter the team's view.
  is_personal: boolean
  task_order: number
  phase_id: string | null
  due_date: string | null
  assignee_id: string | null
  position_id?: string | null
  assignment_flag?: "no_match" | "multi" | null
  sop_id: string | null
  task_set_task_id: string | null
  created_at: string
  project?: Project | null
  assignee?: Profile | null
  position?: Position | null
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

export type LabPhaseStatus = "draft" | "submitted" | "approved" | "rejected"
export type LabReviewAction = "comment" | "approve" | "reject"

export interface LabPhaseTaskChecklistItem {
  id: string
  task_id: string
  text: string
  is_blocking: boolean
  item_order: number
  created_at: string
}

export interface LabPhaseTask {
  id: string
  phase_id: string
  title: string
  description: string | null
  task_order: number
  requires_deliverable: boolean
  deliverable_instructions: string | null
  sop_id: string | null
  default_position_id: string | null
  sop?: Pick<Sop, "id" | "title"> | null
  default_position?: Position | null
  checklist_items?: LabPhaseTaskChecklistItem[]
  created_at: string
}

export interface LabPhaseReview {
  id: string
  phase_id: string
  reviewer_id: string
  action: LabReviewAction
  comment: string | null
  created_at: string
  reviewer?: Profile | null
}

export interface LabPhase {
  id: string
  author_id: string
  name: string
  description: string | null
  status: LabPhaseStatus
  created_at: string
  updated_at: string
  source_phase_set_id: string | null
  source_phase_set_phase_id: string | null
  author?: Profile | null
  tasks?: LabPhaseTask[]
  reviews?: LabPhaseReview[]
  source_phase_set?: {
    id: string
    name: string
    project_type_name: string | null
    project_type_icon: string | null
    project_type_color: string | null
  } | null
}

export type LabProposedStatus = "draft" | "submitted" | "approved" | "rejected"

// ── Proposed task (anchored to a canonical PhaseSetPhase) ─────────────────────

export interface LabProposedTaskChecklistItem {
  id: string
  proposed_task_id: string
  text: string
  is_blocking: boolean
  item_order: number
  created_at: string
}

export interface LabProposedTaskReview {
  id: string
  proposed_task_id: string
  reviewer_id: string
  action: LabReviewAction
  comment: string | null
  created_at: string
  reviewer?: Pick<Profile, "id" | "full_name"> | null
}

export interface LabProposedTask {
  id: string
  author_id: string
  anchor_phase_set_phase_id: string
  anchor_task_set_id: string | null
  anchor_task_set_task_id?: string | null
  position_after_task_id: string | null
  title: string
  description: string | null
  requires_deliverable: boolean
  deliverable_instructions: string | null
  sop_id: string | null
  default_position_id: string | null
  status: LabProposedStatus
  created_at: string
  updated_at: string
  author?: Pick<Profile, "id" | "full_name"> | null
  sop?: Pick<Sop, "id" | "title"> | null
  default_position?: Position | null
  checklist_items?: LabProposedTaskChecklistItem[]
  reviews?: LabProposedTaskReview[]
  anchor_phase?: (Pick<PhaseSetPhase, "id" | "name"> & { phase_set_id?: string | null }) | null
}

// ── Proposed checklist addition (anchored to a canonical TaskSetTask) ─────────

export interface LabProposedChecklistItem {
  id: string
  addition_id: string
  text: string
  is_blocking: boolean
  item_order: number
  created_at: string
}

export interface LabProposedChecklistAdditionReview {
  id: string
  addition_id: string
  reviewer_id: string
  action: LabReviewAction
  comment: string | null
  created_at: string
  reviewer?: Pick<Profile, "id" | "full_name"> | null
}

export interface LabProposedChecklistAddition {
  id: string
  author_id: string
  anchor_task_set_task_id: string
  status: LabProposedStatus
  created_at: string
  updated_at: string
  author?: Pick<Profile, "id" | "full_name"> | null
  items?: LabProposedChecklistItem[]
  reviews?: LabProposedChecklistAdditionReview[]
  anchor_task?: (Pick<TaskSetTask, "id" | "title"> & { task_set_id?: string | null }) | null
}

// ── Canonical tree (read-only snapshot for Mi Ops Lab) ───────────────────────

export interface CanonicalTask {
  id: string
  title: string
  description: string | null
  task_order: number
  requires_deliverable: boolean
  deliverable_instructions: string | null
  default_position_id: string | null
  default_position_name: string | null
  sop_id: string | null
  sop_title: string | null
  checklist_items: { id: string; text: string; is_blocking: boolean; item_order: number }[]
}

export interface CanonicalPhase {
  id: string
  name: string
  description: string | null
  phase_order: number
  task_set_id: string | null
  tasks: CanonicalTask[]
}

export interface CanonicalPhaseSet {
  id: string
  name: string
  project_type_name: string | null
  project_type_color: string | null
  project_type_icon: string | null
  phases: CanonicalPhase[]
}

// ── Proposed phase (anchored to a canonical PhaseSet) ─────────────────────────

export interface LabProposedPhaseTaskChecklistItem {
  id: string
  task_id: string
  text: string
  is_blocking: boolean
  item_order: number
  created_at: string
}

export interface LabProposedPhaseTask {
  id: string
  proposed_phase_id: string
  title: string
  description: string | null
  task_order: number
  requires_deliverable: boolean
  deliverable_instructions: string | null
  sop_id: string | null
  default_position_id: string | null
  sop?: Pick<Sop, "id" | "title"> | null
  default_position?: Position | null
  checklist_items?: LabProposedPhaseTaskChecklistItem[]
  created_at: string
}

export interface LabProposedPhase {
  id: string
  user_id: string
  phase_set_id: string
  name: string
  description: string | null
  position_after_phase_id: string | null
  status: LabProposedStatus
  created_at: string
  updated_at: string
  author?: Pick<Profile, "id" | "full_name"> | null
  phase_set?: Pick<PhaseSet, "id" | "name"> | null
  tasks?: LabProposedPhaseTask[]
}

// ── Unified pending-change aggregate (application-layer only) ─────────────────
// Combines lab_phases (forks), lab_proposed_phases, lab_proposed_tasks and
// lab_proposed_checklist_additions into one shape for the "Mis Propuestas" tab.
// No new table — purely a normalized view over the 4 existing "get mine" queries.

export type PendingChangeKind = "phase_fork" | "phase_new" | "task" | "checklist"

export interface PendingChange {
  kind: PendingChangeKind
  id: string
  status: LabProposedStatus
  title: string
  createdAt: string
  updatedAt: string
  phaseSetId: string | null
  phaseSetName: string | null
  phaseSetIcon: string | null
  phaseSetColor: string | null
  /** The canonical phase this change lives in/under. Null for phase_fork (it IS the phase) and phase_new (it becomes one). */
  phaseName: string | null
  /** True when the canonical row this proposal anchors to no longer exists. */
  anchorMissing: boolean
  raw: LabPhase | LabProposedPhase | LabProposedTask | LabProposedChecklistAddition
}

// ============================================================
// PAID MEDIA HUB
// ============================================================

// Mismos presets de comparación que ofrece Meta Ads Manager.
export type TrendWindow = "previous_day" | "last_3d" | "last_7d" | "last_14d" | "baseline"

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
  // Preferencias del grid creative-first (ver components/projects/hub/
  // creative-performance-grid.tsx) — qué métricas mostrar por default y
  // con qué ventana de tendencia, con override puntual por campaña.
  display_metrics: string[]
  trend_window: TrendWindow
  campaign_trend_overrides: Record<string, TrendWindow>
  // null/vacío = sincronizar todas las campañas (default de siempre) —
  // ver components/projects/hub/creative-performance-grid.tsx.
  synced_campaign_ids: string[] | null
  updated_at: string
}

export interface ProjectIntegration {
  id: string
  project_id: string
  platform: string
  account_id: string
  // Moneda de la cuenta publicitaria (USD, MXN...) — la llena el sync.
  currency?: string | null
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
  purchase_value: number | null
  status: string | null
  date_start: string | null
  date_stop: string | null
  synced_at: string
}

// Historial de Meta — creativos importados de campañas pasadas de la
// cuenta del cliente (no ligados a un ciclo). Ver
// components/projects/hub/creatives/meta-history.tsx.
export interface MetaCampaignCreative {
  id: string
  project_id: string
  campaign_id: string
  campaign_name: string | null
  ad_set_id: string
  ad_set_name: string | null
  ad_id: string
  ad_name: string | null
  image_url: string | null
  video_url: string | null
  thumbnail_url: string | null
  body: string | null
  title: string | null
  cta: string | null
  spend: number | null
  impressions: number | null
  clicks: number | null
  ctr: number | null
  cpc: number | null
  results: number | null
  results_type: string | null
  date_start: string | null
  date_stop: string | null
  imported_by: string | null
  imported_at: string
}

// Dimensión — un ad real de Meta, sincronizado con su creativo (ver
// components/projects/hub/creative-performance-grid.tsx). Las métricas
// viven aparte, en MetaAdDailyStat (una fila por día habilita tendencia
// sin depender de cada cuándo se sincroniza).
export interface MetaAd {
  id: string
  project_id: string
  ad_id: string
  ad_name: string | null
  ad_set_id: string | null
  ad_set_name: string | null
  campaign_id: string | null
  campaign_name: string | null
  status: string | null
  thumbnail_url: string | null
  image_url: string | null
  video_url: string | null
  updated_at: string
}

export interface MetaAdDailyStat {
  id: string
  project_id: string
  cycle_id: string | null
  ad_id: string
  date: string
  spend: number | null
  impressions: number | null
  clicks: number | null
  results: number | null
  results_type: string | null
  purchase_value: number | null
  reach: number | null
  frequency: number | null
  link_clicks: number | null
  video_views: number | null
  messaging_conversations: number | null
  synced_at: string
}

// Puente many-to-many: qué creative_assets (con su concept_id, y por lo
// tanto su persona/ángulo) se volvió cuál ad real de Meta.
export interface CreativeAssetMetaAdLink {
  id: string
  creative_asset_id: string
  project_id: string
  meta_ad_id: string
  linked_by: string | null
  linked_at: string
}

export interface PaidMediaCycle {
  id: string
  project_id: string
  cycle_month: string // ISO date, kept for backward compat — mirrors start_date, not the source of truth
  start_date: string // ISO date, real cycle start
  end_date: string // ISO date, real cycle end
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
  // Desglose manual por canal; los totales real_* se calculan de aquí.
  channel_breakdown?: CycleChannelRow[] | null
  // Cerrado sin repaso (a mano o por auto-cierre) — ver lib/actions/cycle-review.ts
  review_pending?: boolean
  // A qué ciclo se traspasó lo que continuó en el repaso de cierre
  next_cycle_id?: string | null
  created_at: string
}

export interface CycleChannelRow {
  channel: string
  spend: number | null
  results: number | null
  roas: number | null
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

export type ProjectLogCategory = "Decisión" | "Bloqueo" | "Cliente" | "Interno"

export interface ProjectLogEntry {
  id: string
  project_id: string
  author_id: string
  body: string
  created_at: string
  // Fecha del evento que describe la nota — distinta de created_at
  // cuando se registra algo que ya pasó. null = se asume created_at.
  event_date: string | null
  category: ProjectLogCategory | null
  author?: Profile | null
}

// ============================================================
// FINANCES
// ============================================================

export type Currency = "USD" | "MXN"

export interface Income {
  id: string
  project_id: string | null
  amount: number
  currency: Currency
  original_amount: number | null
  exchange_rate: number | null
  tax_rate: number | null
  tax_amount: number | null
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
  tax_rate: number | null
  tax_amount: number | null
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
  expense_date: string | null
  is_active: boolean
  created_at: string
}

export type DomainMaintenanceType = "client" | "own_project" | "n_a"

export interface Domain {
  id: string
  customer_id: string | null
  domain: string
  registrar: string | null
  hosted_at: string | null
  renewal_date: string | null
  renewal_cost: number | null
  maintenance_type: DomainMaintenanceType
  maintenance_cost: number | null
  last_maintenance_date: string | null
  last_maintenance_notes: string | null
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
  brand_line_id: string | null
  created_by: string | null
  created_at: string
  // relations
  parent?: Pick<CreativeConcept, "id" | "angle_type" | "status" | "insight"> | null
  creator?: Pick<Profile, "id" | "full_name"> | null
  brand_line?: Pick<BrandLine, "id" | "name" | "color"> | null
}

export interface BriefContent {
  summary: string
  strategy_rationale: string
  key_messages: string[]
  tone_direction: string
  visual_direction: string
  reference_insights: string
  do_list: string[]
  dont_list: string[]
  suggested_formats: string[]
}

export interface CreativeBrief {
  id: string
  project_id: string
  concept_id: string
  brand_brain_id: string | null
  brand_line_id: string | null
  title: string | null
  important_notes: string | null
  brief_content: BriefContent
  attached_ad_ids: string[]
  // Video refs in attached_ad_ids that should NOT be transcribed/tropicalized
  // — b-roll, stitched montages, anything with no dialogue to adapt.
  no_transcribe_ad_ids: string[]
  attached_board_ids: string[]
  adapted_script: Record<string, AdCloneLine[]> | AdCloneLine[] | null
  script_titles: Record<string, string>
  share_token: string
  script_reviews: Record<string, { client_status: ClientReviewStatus | null; client_feedback: string | null }>
  created_by: string | null
  created_at: string
  updated_at: string
  // relations
  concept?: Pick<CreativeConcept, "id" | "name" | "angle_type" | "target_persona"> | null
  brand_brain?: Pick<BrandBrain, "id" | "name" | "industry"> | null
  brand_line?: Pick<BrandLine, "id" | "name" | "color"> | null
}

export interface CreativeAsset {
  id: string
  project_id: string
  cycle_id: string | null
  concept_id: string | null
  brief_id: string | null
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
  file_path: string | null
  thumbnail_path: string | null
  file_type: string | null
  production_status: ProductionStatus
  client_visible: boolean
  client_status: ClientReviewStatus | null
  client_feedback: string | null
  // Si no es null, este asset es una revisión de otro (reemplaza a esa
  // versión anterior en vez de ser un asset nuevo sin relación) — ver
  // createAsset en lib/actions/creatives.ts.
  revises_asset_id: string | null
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

// A single generated (or refined) copy variant in an asset's reusable copy
// bank — see lib/actions/creatives.ts generateCopyForAsset/refineAssetCopy.
export type AssetCopySource = "generated" | "shorter" | "longer" | "richer"

export interface AssetCopy {
  id: string
  asset_id: string
  hook: string | null
  copy: string | null
  cta: string | null
  source: AssetCopySource
  parent_copy_id: string | null
  created_by: string | null
  created_at: string
}

// ============================================================
// AD LAB
// ============================================================

export type AdStatus = "active" | "inactive"
export type AdFormat = "UGC" | "Studio" | "Founder POV" | "Static + VO" | "Carousel" | "Other"

export interface TrackedBrand {
  id: string
  customer_id: string | null
  name: string
  meta_page_id: string | null
  instagram_handle: string | null
  page_url: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  customer?: Pick<Customer, "id" | "name" | "company"> | null
}

export type SavedAdPostType = "meta_ad" | "organic_post"

export interface SavedAd {
  id: string
  ad_archive_id: string | null   // null for organic_post rows
  page_id: string
  page_name: string
  body: string | null
  image_url: string | null
  video_url: string | null
  cached_image_url: string | null
  cached_video_url: string | null
  snapshot_url: string | null
  ad_snapshot: MetaAdResult | null  // full ad data frozen at save time
  start_date: string | null
  end_date: string | null
  status: AdStatus | null
  platforms: string[]
  spend_lower: number | null
  spend_upper: number | null
  impressions_lower: number | null
  impressions_upper: number | null
  currency: string
  // Enriched
  hook: string | null
  format: AdFormat | null
  notes: string | null
  source: string | null   // 'discovery' | 'upload'
  created_by: string | null
  created_at: string
  // Organic Discovery (post_type = "organic_post")
  post_type: SavedAdPostType
  external_id: string | null                  // e.g. IG shortcode — organic posts' equivalent of ad_archive_id
  caption: string | null
  likes_count: number | null
  comments_count: number | null
  post_url: string | null
  posted_at: string | null
  carousel_image_urls: string[]
  cached_carousel_image_urls: string[]
}


// ============================================================
// BRAND BRAINS
// ============================================================

export interface BrandBrainColor {
  hex: string
  label: string
}

export interface BrandBrain {
  id: string
  name: string
  initials: string | null
  industry: string | null
  language: string | null
  logo_url: string | null
  logo_square_url: string | null
  logo_horizontal_url: string | null
  brand_colors: BrandBrainColor[]
  description: string | null
  usps: string[]
  key_benefits: string[]
  pain_points: string[]
  target_audience: string | null
  key_features: string[]
  ctas: string[]
  tone_of_voice: string | null
  additional_context: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  assets?: BrandBrainAsset[]
}

export interface BrandBrainAsset {
  id: string
  brand_brain_id: string
  name: string | null
  url: string
  type: "image" | "video" | null
  size: number | null
  added_by: string | null
  created_at: string
}

export interface BrandLine {
  id: string
  brand_brain_id: string
  name: string
  description: string | null
  usps: string[]
  pain_points: string[]
  keywords: string[]
  color: string
  position: number
  created_at: string
  updated_at: string
}

export interface AdBoard {
  id: string
  name: string
  description: string | null
  cover_ad_id: string | null
  share_token: string
  created_by: string | null
  created_at: string
  // Relations
  cover_ad?: Pick<SavedAd, "id" | "image_url" | "cached_image_url" | "page_name"> | null
  ad_count?: number
  preview_ads?: Pick<SavedAd, "id" | "cached_image_url" | "image_url">[]
}

export interface ClientCreativeContext {
  id: string
  customer_id: string
  brand_name: string | null
  brand_voice: string | null
  product_description: string | null
  target_audience: string | null
  key_differentiators: string | null
  content_restrictions: string | null
  reference_urls: string[]
  updated_at: string
  updated_by: string | null
}

// Shape returned by Apify curious_coder/facebook-ads-library-scraper
export interface ApifyAdCard {
  body: string | null
  title: string | null
  link_url: string | null
  cta_text: string | null
  original_image_url: string | null
  resized_image_url: string | null
  video_hd_url: string | null
  video_sd_url: string | null
  video_preview_image_url: string | null
}

export interface ApifyAdSnapshot {
  page_name: string
  page_profile_picture_url: string | null
  body: { text: string | null } | null
  cards: ApifyAdCard[]
  cta_text: string | null
  display_format: string | null
  link_url: string | null
  page_like_count: number | null
  images: unknown[]
  videos: unknown[]
}

export interface MetaAdResult {
  ad_archive_id: string
  page_id: string
  page_name: string
  is_active: boolean
  start_date: number | null          // unix timestamp
  end_date: number | null            // unix timestamp
  start_date_formatted: string | null
  end_date_formatted: string | null
  publisher_platform: string[]       // ["FACEBOOK", "INSTAGRAM"]
  spend: { lower_bound: number; upper_bound: number } | null
  currency: string | null
  snapshot: ApifyAdSnapshot
  impressions_with_index: {
    impressions_text: string | null
    impressions_index: number
  } | null
  ad_library_url: string | null
  total: number
}

// Raw dataset item shape from Apify's apify/instagram-post-scraper.
// Kept loose/optional — parsing is defensive since Apify actors change
// their output shape without warning, same posture as MetaAdResult's
// nested snapshot handling.
export interface InstagramPostResult {
  id: string
  shortCode: string
  type?: string             // "Image" | "Video" | "Sidecar"
  caption?: string | null
  url?: string               // post URL
  timestamp?: string | null  // ISO
  likesCount?: number | null
  commentsCount?: number | null
  displayUrl?: string | null       // main/cover image
  videoUrl?: string | null
  images?: string[]                // carousel (Sidecar) slide URLs
  ownerUsername?: string | null
  ownerId?: string | null
  ownerFullName?: string | null
}

// Live typeahead suggestion for a real Facebook Page / Instagram account
// (not a previously saved/tracked one) — Ad Discovery search box.
export interface AccountSuggestion {
  id: string
  name: string
  handle: string | null
  thumbnail: string | null
  url: string | null
  isVerified: boolean
}

// ============================================================
// AD CLONE
// ============================================================

export type AdCloneStatus = "pending" | "transcribing" | "adapting" | "ready" | "error"

export interface AdCloneLine {
  speaker: string | null
  original: string
  adapted: string
}

export interface AdClone {
  id: string
  saved_ad_id: string
  brand_brain_id: string | null
  share_token: string
  status: AdCloneStatus
  assemblyai_transcript_id: string | null
  original_lines: AdCloneLine[]
  adapted_lines: AdCloneLine[]
  error_message: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  brand_brain?: Pick<BrandBrain, "id" | "name"> | null
  saved_ad?: Pick<SavedAd, "id" | "page_name" | "cached_video_url" | "video_url" | "cached_image_url" | "image_url"> | null
}

export type ImageCloneStatus = "pending" | "extracting" | "ready" | "generating" | "reviewing" | "done" | "error"

export interface ImageCloneLine {
  element: string    // e.g. "Headline", "CTA", "Body"
  original: string
  adapted: string
}

// Plan de art direction que Claude genera ANTES de la generación de
// imagen — ver generateVisualDirection() en lib/actions/image-clone.ts.
// Esquema fijo (no free-form) para poder mostrarlo estructurado en la UI
// y para poder referenciarlo de forma predecible dentro del prompt final
// de generación.
export interface VisualDirection {
  direction_name: string
  summary: string
  design_diagnosis: {
    core_mechanic: string
    retain: string[]
    translate: string[]
    issues_to_correct: string[]
  }
  visual_anchor: { source: string; reason: string }
  style: { keywords: string[]; intensity: "subtle" | "balanced" | "bold" }
  palette: {
    canvas: string
    primary_text: string
    neutral_surface: string
    brand_surface: string
    accent: string
    supporting_accent: string
  }
  color_logic: {
    dominant: string[]
    supporting: string[]
    accent_only: string[]
    accent_budget: string
  }
  background_strategy: {
    source_role: string
    preserve_literal_environment: boolean
    reason: string
    destination_treatment: string
  }
  element_map: Record<string, string>
  emphasis: { primary: string[]; secondary: string[]; tertiary: string[] }
  avoid: string[]
}

export interface ImageClone {
  id: string
  // NULL for a "from scratch" clone (source: "scratch") — nothing to
  // reference, there's no saved ad this one came from.
  saved_ad_id: string | null
  brand_brain_id: string | null
  concept_id: string | null
  // "reference" = the original clone-from-a-competitor-ad flow. "scratch" =
  // generated from a ScratchAdIdea instead, no reference ad involved.
  source: "reference" | "scratch"
  scratch_idea_id: string | null
  share_token: string
  status: ImageCloneStatus
  original_lines: ImageCloneLine[]
  adapted_lines: ImageCloneLine[]
  reference_image_urls: string[]
  brand_color: string | null
  aspect_ratio: "1:1" | "9:16" | "16:9" | "4:5"
  num_images: number
  // Plan de art direction aprobado (o el último generado) — null hasta que
  // el usuario pasa por el paso de "Dirección Visual". Se inyecta en el
  // prompt de generación final si está presente.
  visual_direction: VisualDirection | null
  // Qué API generó (o va a generar) las imágenes de este clon — Replicate
  // (google/nano-banana-pro, el original) o APIMart (gpt-image-2.5-sunburst).
  // pollImageGeneration lo necesita para saber contra cuál API consultar.
  generation_provider: "replicate" | "apimart"
  fal_request_id: string | null
  generated_image_urls: string[]
  accepted_image_urls: string[]   // locked-in variants from earlier review rounds
  error_message: string | null
  batch_id: string | null   // groups the N clones from "Clonar carrusel completo"
  created_by: string | null
  created_at: string
  updated_at: string
  brand_brain?: Pick<BrandBrain, "id" | "name"> | null
  saved_ad?: Pick<SavedAd, "id" | "page_name" | "cached_image_url" | "image_url"> | null
}

// ============================================================
// AD LAB — CREAR DESDE CERO (sin referencia)
// ============================================================

export type ScratchAdIdeaStatus = "proposed" | "edited" | "discarded" | "approved"

export interface ScratchAdIdea {
  id: string
  brand_brain_id: string
  concept_id: string | null
  brief: string | null
  batch_id: string
  round: number
  headline: string
  copy_angle: string
  visual_description: string
  brand_elements_used: string[]
  status: ScratchAdIdeaStatus
  edited_headline: string | null
  edited_copy_angle: string | null
  edited_visual_description: string | null
  image_clone_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// ============================================================
// SERVICE CATALOG (offers & addons)
// ============================================================

export type ServiceStatus = "active" | "archived"
// once = hito de arranque; monthly = por periodo del proyecto (ya no mes
// calendario); quarterly/biannual = cada 3/6 periodos; continuous = parte
// del alcance sin conteo (gestión, optimización).
export type DeliverableCadence = "once" | "monthly" | "quarterly" | "biannual" | "continuous"

export interface ServiceDeliverable {
  // Generated client-side (crypto.randomUUID()) when a line is added — lets a
  // project_deliverable_period reference a specific line stably even though
  // deliverables live as a JSONB array with no row id of its own. Older
  // entries saved before this field existed get one assigned lazily when
  // loaded into the editor (see parseDeliverables/DeliverablesEditor).
  id: string
  text: string
  cadence: DeliverableCadence
  // Units expected per period of that cadence (e.g. "4" videos/month). null
  // = no defined quantity — treated as 1 (a single trackable unit) wherever
  // this gets turned into a tracked deliverable period.
  quantity: number | null
  // Texto corto para operar (lo que se ve en el proyecto). `text` queda
  // como texto de venta del catálogo. Vacío = se usa `text`.
  control_text?: string | null
}

export interface ServiceAddon {
  id: string
  name: string
  description: string | null
  price: number | null
  currency: Currency
  price_note: string | null
  status: ServiceStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ServiceOffer {
  id: string
  category: string
  name: string
  description: string | null
  deliverables: ServiceDeliverable[]
  is_base: boolean
  based_on_offer_id: string | null
  default_project_type_id: string | null
  price: number | null
  currency: Currency
  price_note: string | null
  status: ServiceStatus
  created_by: string | null
  created_at: string
  updated_at: string
  // relations
  based_on_offer?: Pick<ServiceOffer, "id" | "name"> | null
  default_project_type?: Pick<ProjectType, "id" | "name" | "color" | "icon"> | null
  addons?: ServiceAddon[]
}

// A project can have several offers attached at once (many-to-many) — each
// one contributes its own deliverables to that project's tracked scope.
// Entirely separate from the internal task/deliverable system
// (tasks.requires_deliverable, the `deliverables` table): this is about what
// the client tangibly receives, not internal work artifacts.
export interface ProjectServiceOffer {
  id: string
  project_id: string
  service_offer_id: string
  added_by: string | null
  created_at: string
  service_offer?: ServiceOffer | null
}

// One row per (project, offer, deliverable line, period) — lazily created
// the first time that period is viewed, so expected_quantity can be
// overridden for one specific period without touching the offer's own
// definition or any other period.
export interface ProjectDeliverablePeriod {
  id: string
  project_id: string
  // null when this period comes from a project_custom_deliverables line
  // instead of a catalog offer — a one-off deliverable for a project whose
  // scope isn't common enough to formalize as a reusable Servicios offer.
  service_offer_id: string | null
  deliverable_key: string
  deliverable_text: string
  period_start: string
  period_label: string
  expected_quantity: number
  fulfilled_quantity: number
  period_end?: string | null
  // Marcado cuando el periodo ya había terminado.
  marked_late?: boolean
  fulfilled_at?: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// The definition behind a custom (non-catalog) deliverable period — one row
// per one-off entregable a project tracks outside of any attached offer.
export interface ProjectCustomDeliverable {
  id: string
  project_id: string
  text: string
  cadence: DeliverableCadence
  quantity: number | null
  created_by: string | null
  created_at: string
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

// ============================================================
// AUTOMATIONS (Telegram bot + Vowen voice webhook review)
// ============================================================

export type AutomationSource = "telegram" | "vowen"
export type AutomationStatus = "ok" | "partial" | "error"

export interface AutomationLog {
  id: string
  source: AutomationSource
  raw_text: string
  movements: Array<{ tipo: string; error?: string }>
  status: AutomationStatus
  error_message: string | null
  created_at: string
}

// ============================================================
// AD LAB — AD NODES (canvas visual de workflows de IA)
// ============================================================

export type AdNodeType = "text" | "image" | "analysis" | "llm" | "generate_image" | "generate_video" | "sticky_note" | "split_text"

export interface AdNodeConfig {
  // text / sticky_note
  value?: string
  // image
  imageUrl?: string
  // llm / analysis
  prompt?: string
  systemPrompt?: string
  // generate_image / generate_video
  provider?: "replicate" | "apimart" | "anthropic"
  model?: string
  aspectRatio?: string
  numImages?: number
  safetyFilterLevel?: string
  // generate_video only — seconds, matters for APIMart's per-second video
  // billing (Seedance-style models).
  durationSeconds?: number
  // generate_video only — the resolution key APIMart's pricing table uses
  // (e.g. "720P") — separate from aspectRatio, which controls shape not
  // resolution tier.
  resolution?: string
  // split_text only — "newline" splits on \n (trimmed, empty lines
  // dropped); "json" expects a JSON array of strings or a JSON object
  // (its values become the parts) — deliberately just these two, no custom
  // regex delimiter, to keep the node predictable instead of reinventing a
  // parsing DSL.
  splitDelimiter?: "newline" | "json"
}

export interface AdNodeData {
  label: string
  type: AdNodeType
  config: AdNodeConfig
}

// Matches @xyflow/react's Node/Edge shape closely enough to persist as-is —
// kept as a plain interface here (not importing the library's own types
// into lib/types.ts) so this file has no client-library dependency.
export interface AdNodeGraphNode {
  id: string
  type: "adNode"
  position: { x: number; y: number }
  data: AdNodeData
}

export interface AdNodeGraphEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  // Set only for edges coming out of a split_text node's numbered part
  // handles — "splitOrder" renders a colored numbered badge at the edge's
  // midpoint (assigned in the order the connections were made), so it's
  // visually obvious which downstream node consumes which split part.
  // Edges from any other node type omit both fields entirely.
  type?: "splitOrder"
  data?: { order: number; color: string }
}

export interface AdNodeGraph {
  nodes: AdNodeGraphNode[]
  edges: AdNodeGraphEdge[]
}

export interface AdNodeWorkflow {
  id: string
  name: string
  brand_brain_id: string | null
  graph: AdNodeGraph
  created_by: string | null
  created_at: string
  updated_at: string
}

export type AdNodeRunStatus = "idle" | "running" | "done" | "error"

export interface AdNodeRunOutput {
  text?: string
  image_urls?: string[]
  video_url?: string
  analysis?: string
  // split_text only — the pieces the input text was split into, in order.
  parts?: string[]
}

export interface AdNodeRun {
  id: string
  workflow_id: string
  node_id: string
  status: AdNodeRunStatus
  input_snapshot: Record<string, unknown> | null
  output: AdNodeRunOutput | null
  error_message: string | null
  provider_job_id: string | null
  // Fetched live from APIMart's public pricing endpoint at submit time —
  // an estimate against their official rate, never a hardcoded number, so
  // it stays accurate as prices change. Null for Replicate-backed nodes
  // (no live pricing source for those) or non-generation node types.
  estimated_cost_usd: number | null
  started_at: string | null
  finished_at: string | null
  updated_at: string
}
