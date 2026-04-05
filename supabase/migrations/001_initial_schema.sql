-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
  position TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'employee')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Prospect' CHECK (status IN ('Prospect', 'Active', 'Inactive', 'Churned')),
  company TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Planning' CHECK (status IN ('Planning', 'In Progress', 'Review', 'Completed')),
  progress INT NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  start_date DATE,
  end_date DATE,
  budget NUMERIC(12, 2),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TASKS
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'Todo' CHECK (status IN ('Todo', 'In Progress', 'Done')),
  priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High')),
  due_date DATE,
  assignee_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update project progress when tasks change
CREATE OR REPLACE FUNCTION update_project_progress()
RETURNS TRIGGER AS $$
DECLARE
  total_tasks INT;
  done_tasks INT;
  new_progress INT;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'Done')
  INTO total_tasks, done_tasks
  FROM tasks
  WHERE project_id = COALESCE(NEW.project_id, OLD.project_id);

  IF total_tasks > 0 THEN
    new_progress := ROUND((done_tasks::NUMERIC / total_tasks) * 100);
  ELSE
    new_progress := 0;
  END IF;

  UPDATE projects
  SET progress = new_progress
  WHERE id = COALESCE(NEW.project_id, OLD.project_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_task_change ON tasks;
CREATE TRIGGER on_task_change
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE PROCEDURE update_project_progress();

-- ============================================================
-- PROJECT MEMBERS (many-to-many)
-- ============================================================
CREATE TABLE IF NOT EXISTS project_members (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, profile_id)
);

-- ============================================================
-- RECURRING EXPENSES (payroll, software, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('Monthly', 'Weekly', 'Annual', 'One-time')),
  category TEXT NOT NULL DEFAULT 'Other' CHECK (category IN ('Payroll', 'Software', 'Rent', 'Utilities', 'Other')),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INCOME (by project)
-- ============================================================
CREATE TABLE IF NOT EXISTS income (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  invoice_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PROJECT EXPENSES (specific costs per project)
-- ============================================================
CREATE TABLE IF NOT EXISTS project_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE income ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_expenses ENABLE ROW LEVEL SECURITY;

-- Helper: check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT role = 'admin' FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- PROFILES: everyone can read own profile; admin reads all
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (id = auth.uid() OR is_admin());
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING (id = auth.uid());
CREATE POLICY "profiles_admin_all" ON profiles FOR ALL
  USING (is_admin());

-- CUSTOMERS: admin full access; employee read-only
CREATE POLICY "customers_admin" ON customers FOR ALL USING (is_admin());
CREATE POLICY "customers_employee_read" ON customers FOR SELECT USING (auth.uid() IS NOT NULL);

-- PROJECTS: admin full; employee reads projects they are members of
CREATE POLICY "projects_admin" ON projects FOR ALL USING (is_admin());
CREATE POLICY "projects_employee_read" ON projects FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      is_admin() OR
      EXISTS (SELECT 1 FROM project_members WHERE project_id = projects.id AND profile_id = auth.uid())
    )
  );

-- TASKS: admin full; employee reads/updates tasks in their projects
CREATE POLICY "tasks_admin" ON tasks FOR ALL USING (is_admin());
CREATE POLICY "tasks_employee_read" ON tasks FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM project_members WHERE project_id = tasks.project_id AND profile_id = auth.uid())
    OR assignee_id = auth.uid()
  );
CREATE POLICY "tasks_employee_update" ON tasks FOR UPDATE
  USING (assignee_id = auth.uid());

-- PROJECT MEMBERS: admin full; employee read-only
CREATE POLICY "pm_admin" ON project_members FOR ALL USING (is_admin());
CREATE POLICY "pm_employee_read" ON project_members FOR SELECT USING (auth.uid() IS NOT NULL);

-- FINANCES: admin only
CREATE POLICY "re_admin" ON recurring_expenses FOR ALL USING (is_admin());
CREATE POLICY "income_admin" ON income FOR ALL USING (is_admin());
CREATE POLICY "pe_admin" ON project_expenses FOR ALL USING (is_admin());

-- ============================================================
-- SAMPLE DATA (optional — remove before production)
-- ============================================================
INSERT INTO customers (name, status, company, email, phone) VALUES
  ('Adriana Rivera', 'Prospect', 'Sirena', 'riveraromo.ad@gmail.com', '+51920073547'),
  ('Carlos Mendez', 'Active', 'Tech Corp', 'carlos@techcorp.com', '+50769887766'),
  ('María Santos', 'Active', 'Innovate SA', 'maria@innovate.com', '+50762334455'),
  ('Juan Pérez', 'Inactive', 'Old Co', 'juan@oldco.com', NULL),
  ('Luisa Fernandez', 'Churned', 'Gone Ltd', NULL, '+50799112233')
ON CONFLICT DO NOTHING;
