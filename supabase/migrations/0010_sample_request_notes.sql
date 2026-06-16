-- ============================================================
-- 0010_sample_request_notes.sql
-- Tiny semantic fix discovered during Slice 1 drift cleanup.
--
-- The Slice 1 UI captures notes at sample-request creation time, but
-- the schema only had `outcome_notes` (for the post-delivery outcome).
-- The code was writing request notes into outcome_notes — semantically
-- wrong + breaks any downstream "what did the customer say after the
-- sample arrived?" reporting.
--
-- Adding a real `notes` column. Backwards-safe: nullable, defaults
-- to NULL.
-- ============================================================

ALTER TABLE sample_request
  ADD COLUMN IF NOT EXISTS notes TEXT;
