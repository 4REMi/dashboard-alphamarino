-- ============================================================
-- MIGRATION 003: Alpha Marino Dashboard — Full Rewrite Schema
-- ============================================================
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================

-- ============================================================
-- 1. HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role = 'admin' FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_admin_or_subadmin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role IN ('admin', 'subadmin') FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

-- ============================================================
-- 2. ALTER EXISTING TABLES
-- ============================================================

-- profiles: agregar subadmin al role check
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'subadmin', 'employee'));

-- recurring_expenses: agregar next_payment_date + Semestral
ALTER TABLE recurring_expenses
  ADD COLUMN IF NOT EXISTS next_payment_date DATE;

ALTER TABLE recurring_expenses DROP CONSTRAINT IF EXISTS recurring_expenses_frequency_check;
ALTER TABLE recurring_expenses ADD CONSTRAINT recurring_expenses_frequency_check
  CHECK (frequency IN ('Monthly', 'Weekly', 'Annual', 'Semestral', 'One-time'));

ALTER TABLE recurring_expenses DROP CONSTRAINT IF EXISTS recurring_expenses_category_check;
ALTER TABLE recurring_expenses ADD CONSTRAINT recurring_expenses_category_check
  CHECK (category IN ('Payroll', 'Software', 'Rent', 'Services', 'Other'));

-- ============================================================
-- 3. DROP OLD HUB TABLES (schema cambió demasiado)
-- ============================================================

DROP TABLE IF EXISTS paid_media_cycle_deliverables CASCADE;
DROP TABLE IF EXISTS paid_media_cycles CASCADE;
DROP TABLE IF EXISTS paid_media_context CASCADE;
DROP TABLE IF EXISTS web_deliverables CASCADE;
DROP TABLE IF EXISTS web_phases CASCADE;
DROP TABLE IF EXISTS web_context CASCADE;

-- project_log_entries: mantener pero quitar columna pinned
ALTER TABLE project_log_entries DROP COLUMN IF EXISTS pinned;

-- ============================================================
-- 4. CONFIGURATION TABLES (nuevas)
-- ============================================================

CREATE TABLE IF NOT EXISTS project_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  default_phase_set_id UUID, -- FK se agrega después de crear phase_sets
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS phase_sets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  project_type_id UUID REFERENCES project_types(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FK circular: project_types → phase_sets
ALTER TABLE project_types
  ADD COLUMN IF NOT EXISTS default_phase_set_id UUID REFERENCES phase_sets(id) ON DELETE SET NULL;

-- Drop the column we created above without FK first (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'project_types_default_phase_set_id_fkey'
  ) THEN
    ALTER TABLE project_types
      ADD CONSTRAINT project_types_default_phase_set_id_fkey
      FOREIGN KEY (default_phase_set_id) REFERENCES phase_sets(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS phase_set_phases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phase_set_id UUID NOT NULL REFERENCES phase_sets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  phase_order INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. PROJECTS: agregar campos nuevos
-- ============================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_type_id UUID REFERENCES project_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_value NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS monthly_fee NUMERIC(12,2);

-- ============================================================
-- 6. PROJECT PHASES (instancias copiadas del phase set)
-- ============================================================

CREATE TABLE IF NOT EXISTS project_phases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  phase_order INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at_project_phases
  BEFORE UPDATE ON project_phases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 7. PAID MEDIA (rediseñado)
-- ============================================================

CREATE TABLE IF NOT EXISTS paid_media_context (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  platforms TEXT[] NOT NULL DEFAULT '{}',
  monthly_ad_budget NUMERIC(12,2),
  main_objective TEXT CHECK (main_objective IN ('conversions', 'leads', 'traffic', 'awareness')),
  target_roas NUMERIC(8,2),
  target_cpa NUMERIC(12,2),
  target_cpl NUMERIC(12,2),
  target_leads_per_month INT,
  account_notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at_paid_media_context
  BEFORE UPDATE ON paid_media_context
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS paid_media_cycles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cycle_month DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  campaign_status TEXT CHECK (campaign_status IN ('active', 'paused', 'review', 'optimizing')),
  report_cutoff_date DATE,
  report_delivery_date DATE,
  report_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (report_status IN ('pending', 'in_progress', 'delivered')),
  creative_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (creative_status IN ('pending', 'in_progress', 'delivered')),
  roas_real NUMERIC(8,2),
  cpa_real NUMERIC(12,2),
  cpl_real NUMERIC(12,2),
  real_spend NUMERIC(12,2),
  real_results NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, cycle_month)
);

-- ============================================================
-- 8. WEB DEV CONTEXT (rediseñado)
-- ============================================================

CREATE TABLE IF NOT EXISTS web_project_context (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT,
  staging_url TEXT,
  production_url TEXT,
  technical_notes TEXT,
  revisions_included INT NOT NULL DEFAULT 0,
  revisions_used INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at_web_project_context
  BEFORE UPDATE ON web_project_context
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 9. DOMAINS (nuevo)
-- ============================================================

CREATE TABLE IF NOT EXISTS domains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  domain TEXT NOT NULL,
  registrar TEXT,
  renewal_date DATE,
  renewal_cost NUMERIC(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 10. PROGRESS TRIGGERS
-- ============================================================

-- Función que recalcula el progreso de un proyecto.
-- Si tiene fases: % de fases completadas.
-- Si no tiene fases: % de tareas completadas.
CREATE OR REPLACE FUNCTION recalculate_project_progress()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_project_id UUID;
  v_phase_count INT;
  v_completed_phases INT;
  v_task_count INT;
  v_done_tasks INT;
  v_progress INT;
BEGIN
  IF TG_TABLE_NAME = 'project_phases' THEN
    v_project_id := COALESCE(NEW.project_id, OLD.project_id);
  ELSE
    v_project_id := COALESCE(NEW.project_id, OLD.project_id);
  END IF;

  SELECT COUNT(*) INTO v_phase_count FROM project_phases WHERE project_id = v_project_id;

  IF v_phase_count > 0 THEN
    SELECT COUNT(*) FILTER (WHERE status = 'completed')
    INTO v_completed_phases
    FROM project_phases WHERE project_id = v_project_id;

    v_progress := ROUND(v_completed_phases::NUMERIC / v_phase_count * 100);
  ELSE
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'Done')
    INTO v_task_count, v_done_tasks
    FROM tasks WHERE project_id = v_project_id;

    IF v_task_count = 0 THEN
      v_progress := 0;
    ELSE
      v_progress := ROUND(v_done_tasks::NUMERIC / v_task_count * 100);
    END IF;
  END IF;

  UPDATE projects SET progress = v_progress WHERE id = v_project_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger en project_phases
DROP TRIGGER IF EXISTS trg_progress_from_phases ON project_phases;
CREATE TRIGGER trg_progress_from_phases
  AFTER INSERT OR UPDATE OF status OR DELETE ON project_phases
  FOR EACH ROW EXECUTE FUNCTION recalculate_project_progress();

-- Trigger en tasks (ya existe update_project_progress — reemplazarlo)
DROP TRIGGER IF EXISTS update_project_progress_trigger ON tasks;
DROP FUNCTION IF EXISTS update_project_progress() CASCADE;

DROP TRIGGER IF EXISTS trg_progress_from_tasks ON tasks;
CREATE TRIGGER trg_progress_from_tasks
  AFTER INSERT OR UPDATE OF status OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION recalculate_project_progress();

-- ============================================================
-- 11. ROW LEVEL SECURITY
-- ============================================================

-- project_types
ALTER TABLE project_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_types_select" ON project_types;
DROP POLICY IF EXISTS "project_types_insert" ON project_types;
DROP POLICY IF EXISTS "project_types_update" ON project_types;
DROP POLICY IF EXISTS "project_types_delete" ON project_types;
CREATE POLICY "project_types_select" ON project_types FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "project_types_insert" ON project_types FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "project_types_update" ON project_types FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "project_types_delete" ON project_types FOR DELETE TO authenticated USING (is_admin());

-- phase_sets
ALTER TABLE phase_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "phase_sets_select" ON phase_sets;
DROP POLICY IF EXISTS "phase_sets_insert" ON phase_sets;
DROP POLICY IF EXISTS "phase_sets_update" ON phase_sets;
DROP POLICY IF EXISTS "phase_sets_delete" ON phase_sets;
CREATE POLICY "phase_sets_select" ON phase_sets FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "phase_sets_insert" ON phase_sets FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "phase_sets_update" ON phase_sets FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "phase_sets_delete" ON phase_sets FOR DELETE TO authenticated USING (is_admin());

-- phase_set_phases
ALTER TABLE phase_set_phases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "phase_set_phases_select" ON phase_set_phases;
DROP POLICY IF EXISTS "phase_set_phases_insert" ON phase_set_phases;
DROP POLICY IF EXISTS "phase_set_phases_update" ON phase_set_phases;
DROP POLICY IF EXISTS "phase_set_phases_delete" ON phase_set_phases;
CREATE POLICY "phase_set_phases_select" ON phase_set_phases FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "phase_set_phases_insert" ON phase_set_phases FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "phase_set_phases_update" ON phase_set_phases FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "phase_set_phases_delete" ON phase_set_phases FOR DELETE TO authenticated USING (is_admin());

-- project_phases
ALTER TABLE project_phases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_phases_select" ON project_phases;
DROP POLICY IF EXISTS "project_phases_insert" ON project_phases;
DROP POLICY IF EXISTS "project_phases_update" ON project_phases;
DROP POLICY IF EXISTS "project_phases_delete" ON project_phases;
CREATE POLICY "project_phases_select" ON project_phases FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "project_phases_insert" ON project_phases FOR INSERT TO authenticated WITH CHECK (is_admin_or_subadmin());
CREATE POLICY "project_phases_update" ON project_phases FOR UPDATE TO authenticated USING (
  is_admin_or_subadmin() OR
  auth.uid() IN (SELECT profile_id FROM project_members WHERE project_id = project_phases.project_id)
);
CREATE POLICY "project_phases_delete" ON project_phases FOR DELETE TO authenticated USING (is_admin_or_subadmin());

-- paid_media_context
ALTER TABLE paid_media_context ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pmc_select" ON paid_media_context;
DROP POLICY IF EXISTS "pmc_insert" ON paid_media_context;
DROP POLICY IF EXISTS "pmc_update" ON paid_media_context;
DROP POLICY IF EXISTS "pmc_delete" ON paid_media_context;
CREATE POLICY "pmc_select" ON paid_media_context FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "pmc_insert" ON paid_media_context FOR INSERT TO authenticated WITH CHECK (is_admin_or_subadmin());
CREATE POLICY "pmc_update" ON paid_media_context FOR UPDATE TO authenticated USING (is_admin_or_subadmin());
CREATE POLICY "pmc_delete" ON paid_media_context FOR DELETE TO authenticated USING (is_admin_or_subadmin());

-- paid_media_cycles
ALTER TABLE paid_media_cycles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pmcy_select" ON paid_media_cycles;
DROP POLICY IF EXISTS "pmcy_insert" ON paid_media_cycles;
DROP POLICY IF EXISTS "pmcy_update" ON paid_media_cycles;
DROP POLICY IF EXISTS "pmcy_delete" ON paid_media_cycles;
CREATE POLICY "pmcy_select" ON paid_media_cycles FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "pmcy_insert" ON paid_media_cycles FOR INSERT TO authenticated WITH CHECK (is_admin_or_subadmin());
CREATE POLICY "pmcy_update" ON paid_media_cycles FOR UPDATE TO authenticated USING (is_admin_or_subadmin());
CREATE POLICY "pmcy_delete" ON paid_media_cycles FOR DELETE TO authenticated USING (is_admin_or_subadmin());

-- web_project_context
ALTER TABLE web_project_context ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wpc_select" ON web_project_context;
DROP POLICY IF EXISTS "wpc_insert" ON web_project_context;
DROP POLICY IF EXISTS "wpc_update" ON web_project_context;
DROP POLICY IF EXISTS "wpc_delete" ON web_project_context;
CREATE POLICY "wpc_select" ON web_project_context FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "wpc_insert" ON web_project_context FOR INSERT TO authenticated WITH CHECK (is_admin_or_subadmin());
CREATE POLICY "wpc_update" ON web_project_context FOR UPDATE TO authenticated USING (is_admin_or_subadmin());
CREATE POLICY "wpc_delete" ON web_project_context FOR DELETE TO authenticated USING (is_admin_or_subadmin());

-- domains
ALTER TABLE domains ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "domains_select" ON domains;
DROP POLICY IF EXISTS "domains_insert" ON domains;
DROP POLICY IF EXISTS "domains_update" ON domains;
DROP POLICY IF EXISTS "domains_delete" ON domains;
CREATE POLICY "domains_select" ON domains FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "domains_insert" ON domains FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "domains_update" ON domains FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "domains_delete" ON domains FOR DELETE TO authenticated USING (is_admin());

-- recurring_expenses: solo admin
DROP POLICY IF EXISTS "expenses_select" ON recurring_expenses;
DROP POLICY IF EXISTS "expenses_insert" ON recurring_expenses;
DROP POLICY IF EXISTS "expenses_update" ON recurring_expenses;
DROP POLICY IF EXISTS "expenses_delete" ON recurring_expenses;
CREATE POLICY "expenses_select" ON recurring_expenses FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "expenses_insert" ON recurring_expenses FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "expenses_update" ON recurring_expenses FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "expenses_delete" ON recurring_expenses FOR DELETE TO authenticated USING (is_admin());

-- income: SELECT admin+subadmin, mutaciones solo admin
DROP POLICY IF EXISTS "income_select" ON income;
DROP POLICY IF EXISTS "income_insert" ON income;
DROP POLICY IF EXISTS "income_delete" ON income;
CREATE POLICY "income_select" ON income FOR SELECT TO authenticated USING (is_admin_or_subadmin());
CREATE POLICY "income_insert" ON income FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "income_delete" ON income FOR DELETE TO authenticated USING (is_admin());

-- project_expenses: SELECT admin+subadmin, mutaciones solo admin
DROP POLICY IF EXISTS "proj_expenses_select" ON project_expenses;
DROP POLICY IF EXISTS "proj_expenses_insert" ON project_expenses;
DROP POLICY IF EXISTS "proj_expenses_delete" ON project_expenses;
CREATE POLICY "proj_expenses_select" ON project_expenses FOR SELECT TO authenticated USING (is_admin_or_subadmin());
CREATE POLICY "proj_expenses_insert" ON project_expenses FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "proj_expenses_delete" ON project_expenses FOR DELETE TO authenticated USING (is_admin());

-- project_log_entries: cualquier autenticado puede ver, autor puede insertar y borrar, admin puede borrar todo
DROP POLICY IF EXISTS "log_select" ON project_log_entries;
DROP POLICY IF EXISTS "log_insert" ON project_log_entries;
DROP POLICY IF EXISTS "log_delete" ON project_log_entries;
CREATE POLICY "log_select" ON project_log_entries FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "log_insert" ON project_log_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "log_delete" ON project_log_entries FOR DELETE TO authenticated USING (
  is_admin() OR auth.uid() = author_id
);
