-- ============================================================
-- MIGRATION 002: Project Hubs (Paid Media + Sitio Web)
-- ============================================================

-- Shared updated_at trigger function (used by multiple tables below)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add project_type to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'paid_media'
  CHECK (project_type IN ('paid_media', 'sitio_web'));

-- ============================================================
-- PAID MEDIA CONTEXT
-- ============================================================
CREATE TABLE IF NOT EXISTS paid_media_context (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
  platforms TEXT[] NOT NULL DEFAULT '{}',
  monthly_budget NUMERIC(12,2),
  target_cpa NUMERIC(12,2),
  target_roas NUMERIC(8,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PAID MEDIA CYCLES (monthly)
-- ============================================================
CREATE TABLE IF NOT EXISTS paid_media_cycles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cycle_month DATE NOT NULL, -- first day of the month
  budget_spent NUMERIC(12,2),
  impressions INTEGER,
  clicks INTEGER,
  conversions INTEGER,
  cpa NUMERIC(12,2),
  roas NUMERIC(8,2),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, cycle_month)
);

-- ============================================================
-- PAID MEDIA CYCLE DELIVERABLES
-- ============================================================
CREATE TABLE IF NOT EXISTS paid_media_cycle_deliverables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cycle_id UUID NOT NULL REFERENCES paid_media_cycles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- WEB CONTEXT
-- ============================================================
CREATE TABLE IF NOT EXISTS web_context (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
  tech_stack TEXT[] NOT NULL DEFAULT '{}',
  repo_url TEXT,
  staging_url TEXT,
  production_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- WEB PHASES
-- ============================================================
CREATE TABLE IF NOT EXISTS web_phases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phase_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, phase_order)
);

-- ============================================================
-- WEB DELIVERABLES
-- ============================================================
CREATE TABLE IF NOT EXISTS web_deliverables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phase_id UUID NOT NULL REFERENCES web_phases(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PROJECT LOG / BITÁCORA (shared across types)
-- ============================================================
CREATE TABLE IF NOT EXISTS project_log_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- RPC: get_web_progress
-- Returns (total_deliverables, done_deliverables, progress_pct)
-- ============================================================
CREATE OR REPLACE FUNCTION get_web_progress(p_project_id UUID)
RETURNS TABLE(total_deliverables INTEGER, done_deliverables INTEGER, progress_pct INTEGER)
LANGUAGE sql STABLE
AS $$
  SELECT
    COUNT(*)::INTEGER AS total_deliverables,
    COUNT(*) FILTER (WHERE done = TRUE)::INTEGER AS done_deliverables,
    CASE
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND(COUNT(*) FILTER (WHERE done = TRUE)::NUMERIC / COUNT(*) * 100)::INTEGER
    END AS progress_pct
  FROM web_deliverables
  WHERE project_id = p_project_id;
$$;

-- ============================================================
-- Modify progress trigger: skip Sitio Web (uses web deliverables)
-- ============================================================
CREATE OR REPLACE FUNCTION update_project_progress()
RETURNS TRIGGER AS $$
DECLARE
  v_project_id UUID;
  v_type TEXT;
  total_tasks INT;
  done_tasks INT;
BEGIN
  -- Determine project_id from NEW or OLD
  IF TG_OP = 'DELETE' THEN
    v_project_id := OLD.project_id;
  ELSE
    v_project_id := NEW.project_id;
  END IF;

  -- Get project type
  SELECT project_type INTO v_type FROM projects WHERE id = v_project_id;

  -- Only auto-update progress for paid_media (sitio_web uses deliverables)
  IF v_type = 'sitio_web' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'done')
  INTO total_tasks, done_tasks
  FROM tasks
  WHERE project_id = v_project_id;

  UPDATE projects
  SET progress = CASE
    WHEN total_tasks = 0 THEN 0
    ELSE ROUND(done_tasks::NUMERIC / total_tasks * 100)
  END
  WHERE id = v_project_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RLS: Enable and add policies
-- ============================================================

ALTER TABLE paid_media_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE paid_media_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE paid_media_cycle_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_log_entries ENABLE ROW LEVEL SECURITY;

-- paid_media_context
CREATE POLICY "paid_media_context_select" ON paid_media_context FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "paid_media_context_insert" ON paid_media_context FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "paid_media_context_update" ON paid_media_context FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "paid_media_context_delete" ON paid_media_context FOR DELETE TO authenticated USING (is_admin());

-- paid_media_cycles
CREATE POLICY "paid_media_cycles_select" ON paid_media_cycles FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "paid_media_cycles_insert" ON paid_media_cycles FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "paid_media_cycles_update" ON paid_media_cycles FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "paid_media_cycles_delete" ON paid_media_cycles FOR DELETE TO authenticated USING (is_admin());

-- paid_media_cycle_deliverables
CREATE POLICY "pm_deliverables_select" ON paid_media_cycle_deliverables FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "pm_deliverables_insert" ON paid_media_cycle_deliverables FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "pm_deliverables_update" ON paid_media_cycle_deliverables FOR UPDATE TO authenticated USING (
  is_admin() OR auth.uid() IN (
    SELECT profile_id FROM project_members pm
    JOIN paid_media_cycles pmc ON pmc.id = cycle_id
    WHERE pm.project_id = pmc.project_id
  )
);
CREATE POLICY "pm_deliverables_delete" ON paid_media_cycle_deliverables FOR DELETE TO authenticated USING (is_admin());

-- web_context
CREATE POLICY "web_context_select" ON web_context FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "web_context_insert" ON web_context FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "web_context_update" ON web_context FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "web_context_delete" ON web_context FOR DELETE TO authenticated USING (is_admin());

-- web_phases
CREATE POLICY "web_phases_select" ON web_phases FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "web_phases_insert" ON web_phases FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "web_phases_update" ON web_phases FOR UPDATE TO authenticated USING (
  is_admin() OR auth.uid() IN (
    SELECT profile_id FROM project_members WHERE project_id = web_phases.project_id
  )
);
CREATE POLICY "web_phases_delete" ON web_phases FOR DELETE TO authenticated USING (is_admin());

-- web_deliverables
CREATE POLICY "web_deliverables_select" ON web_deliverables FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "web_deliverables_insert" ON web_deliverables FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "web_deliverables_update" ON web_deliverables FOR UPDATE TO authenticated USING (
  is_admin() OR auth.uid() IN (
    SELECT profile_id FROM project_members WHERE project_id = web_deliverables.project_id
  )
);
CREATE POLICY "web_deliverables_delete" ON web_deliverables FOR DELETE TO authenticated USING (is_admin());

-- project_log_entries
CREATE POLICY "log_select" ON project_log_entries FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "log_insert" ON project_log_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "log_update" ON project_log_entries FOR UPDATE TO authenticated USING (is_admin() OR auth.uid() = author_id);
CREATE POLICY "log_delete" ON project_log_entries FOR DELETE TO authenticated USING (is_admin() OR auth.uid() = author_id);

-- ============================================================
-- Updated_at triggers
-- ============================================================
CREATE TRIGGER set_updated_at_paid_media_context
  BEFORE UPDATE ON paid_media_context
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_paid_media_cycles
  BEFORE UPDATE ON paid_media_cycles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_web_context
  BEFORE UPDATE ON web_context
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_web_phases
  BEFORE UPDATE ON web_phases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
