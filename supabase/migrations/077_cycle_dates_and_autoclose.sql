-- ============================================================
-- 077_cycle_dates_and_autoclose.sql
-- Two follow-ups to the "ciclos" pain points:
--
-- 1. Editing a cycle's start/end dates after creation was previously only
--    possible via direct SQL — updateCycle() never touched them. Safe to
--    add now: creative_concepts/creative_assets link to a cycle by id, not
--    by date, so correcting dates never reshuffles what "belongs" to a
--    cycle.
-- 2. A daily check (app/api/cron/check-cycles) sends a preventive warning
--    ~4 days before a cycle's end_date, and a one-time notice if it's
--    still active past end_date. *_notice_sent_at columns make both
--    idempotent (the job runs daily, but each notice fires once per
--    cycle). auto_close_cycles is an explicit per-project opt-in — off by
--    default everywhere, since the user was clear this should never be a
--    blanket behavior.
-- ============================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS auto_close_cycles BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE paid_media_cycles
  ADD COLUMN IF NOT EXISTS end_warning_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS overdue_notice_sent_at TIMESTAMPTZ;
