-- ============================================================
-- 0056_procurement_demo_data.sql — superseded NOOP placeholder
--
-- Original intent: seed procurement demo data (vendors + POs).
-- Outcome: the sentinel-based idempotency check tripped on V-CEM-01
-- (which already existed from earlier Vyara demo data) AND the SELECT
-- ahead of the sentinel referenced `user_profile.deleted_at` — a
-- column that doesn't exist (user_profile has no soft-delete column;
-- see migration 0003).
--
-- Rather than mutate an already-applied migration, the corrected seed
-- ships as 0057_procurement_demo_data_fix.sql with proper per-row
-- ON CONFLICT + IF NOT EXISTS idempotency. This file is kept as a
-- NOOP so:
--   1. Remote DBs (where 0056 was already marked applied) stay in
--      sync.
--   2. Fresh DBs don't crash on the buggy original — they just
--      RAISE NOTICE and continue to 0057, which does the real work.
--
-- Do not extend this file. Add new seed in a new migration.
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '[migration 0056] superseded — actual seed lives in 0057_procurement_demo_data_fix.sql';
END $$;
