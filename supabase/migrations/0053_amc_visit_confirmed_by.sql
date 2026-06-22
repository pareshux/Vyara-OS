-- ============================================================
-- 0053_amc_visit_confirmed_by.sql — Phase 7f
--
-- Adds a nullable confirmed_by_contact_id FK on amc_visit_schedule.
-- Captures the customer-side person who signed off on the visit
-- (their plant engineer, maintenance lead, etc.) — distinct from
-- done_by which is the Raj engineer who performed the service.
--
-- Notes column already exists (0050) for the service summary text.
-- This migration just adds the proper relationship to the customer
-- sign-off contact so it's first-class data (queryable, joinable)
-- rather than free-form in notes.
--
-- Reverse: ALTER TABLE amc_visit_schedule DROP COLUMN confirmed_by_contact_id;
-- ============================================================

ALTER TABLE amc_visit_schedule
  ADD COLUMN IF NOT EXISTS confirmed_by_contact_id UUID REFERENCES contact(id);

CREATE INDEX IF NOT EXISTS amc_visit_confirmed_by_idx
  ON amc_visit_schedule (confirmed_by_contact_id)
  WHERE confirmed_by_contact_id IS NOT NULL;
