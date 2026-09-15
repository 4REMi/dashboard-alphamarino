-- ============================================================
-- 080_ad_node_run_cost.sql
-- Cost visibility for Ad Nodes — estimated USD cost per node run, fetched
-- live from APIMart's public pricing endpoint (no API key needed) at the
-- moment a generation node is submitted, so the number reflects whatever
-- APIMart's official rates are that day instead of a hardcoded value that
-- goes stale.
-- ============================================================

ALTER TABLE ad_node_runs
  ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC;
