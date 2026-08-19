-- ============================================================
-- 057_service_catalog.sql
-- Internal catalog of sellable offers (services) and addons/
-- upsells, for reference/pitching — not tied into project
-- creation or billing. Admin/subadmin only, same sensitivity
-- tier as pricing data elsewhere.
-- ============================================================

CREATE TABLE IF NOT EXISTS service_offers (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category                TEXT NOT NULL,               -- e.g. "Paid Media", "Desarrollo Web" — free text, small fixed set in practice
  name                    TEXT NOT NULL,
  description             TEXT,
  deliverables            TEXT[] NOT NULL DEFAULT '{}',
  is_base                 BOOLEAN NOT NULL DEFAULT false,
  based_on_offer_id       UUID REFERENCES service_offers(id) ON DELETE SET NULL,
  -- Purely informational pointer into Ops Lab's project type catalog —
  -- no automation reads this, it's just "this offer maps to that
  -- execution template" for reference when pitching/scoping.
  default_project_type_id UUID REFERENCES project_types(id) ON DELETE SET NULL,
  price                   NUMERIC(12, 2),
  price_note              TEXT,                        -- e.g. "Desde $X/mes", "Cotización"
  status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by              UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_offers_category_idx    ON service_offers(category);
CREATE INDEX IF NOT EXISTS service_offers_based_on_idx    ON service_offers(based_on_offer_id);

CREATE TABLE IF NOT EXISTS service_addons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  price       NUMERIC(12, 2),
  price_note  TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_offer_addons (
  offer_id UUID NOT NULL REFERENCES service_offers(id) ON DELETE CASCADE,
  addon_id UUID NOT NULL REFERENCES service_addons(id) ON DELETE CASCADE,
  PRIMARY KEY (offer_id, addon_id)
);

DROP TRIGGER IF EXISTS trg_service_offers_updated_at ON service_offers;
CREATE TRIGGER trg_service_offers_updated_at
  BEFORE UPDATE ON service_offers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_service_addons_updated_at ON service_addons;
CREATE TRIGGER trg_service_addons_updated_at
  BEFORE UPDATE ON service_addons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS — admin/subadmin only, same as other pricing-adjacent data ──
ALTER TABLE service_offers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_addons       ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_offer_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_offers_admin" ON service_offers FOR ALL
  USING (is_admin_or_subadmin()) WITH CHECK (is_admin_or_subadmin());

CREATE POLICY "service_addons_admin" ON service_addons FOR ALL
  USING (is_admin_or_subadmin()) WITH CHECK (is_admin_or_subadmin());

CREATE POLICY "service_offer_addons_admin" ON service_offer_addons FOR ALL
  USING (is_admin_or_subadmin()) WITH CHECK (is_admin_or_subadmin());
