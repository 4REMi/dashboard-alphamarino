-- ============================================================
-- 053_drop_creative_requests.sql
-- Retires the "creative requests" system (manual image requests +
-- auto-created video requests on client script approval, "Mis
-- Solicitudes"). Keeps image_clones.concept_id — that column also
-- backs the unrelated "drafts for this concept" feature in Ad Lab.
-- ============================================================

DROP TABLE IF EXISTS creative_requests;

ALTER TABLE creative_assets DROP COLUMN IF EXISTS script_key;
