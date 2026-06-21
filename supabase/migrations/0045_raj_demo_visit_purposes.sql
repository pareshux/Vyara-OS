-- ============================================================
-- 0045_raj_demo_visit_purposes.sql — Raj demo Phase 1 (Blueprint FLD-009)
--
-- Adds two system visit_purpose codes that EPC contractors need
-- (Raj Avinsys is the first cross-industry tenant — Constitution v3,
-- 2026-06-22). Same pattern as migration 0032's seed: tenant_id NULL
-- (= system row visible to all tenants); per the cross-industry-by-
-- configuration principle, vocabulary that benefits any future
-- EPC / electrical / industrial-manufacturing tenant goes system.
--
-- Most of Raj's vocabulary is already covered by 0032's 16 seeds
-- (commissioning, amc_visit, installation, handover, breakdown_response,
-- service_call, inspection, audit, training, etc). These two are
-- the only genuinely new codes:
--
--   - drawing_review_meeting · engineering review with customer on
--     approval drawings (EPC stage 8→9 transition)
--   - fat_witness · customer attends Factory Acceptance Test at the
--     panel-maker's workshop (EPC stage 12, Panel stage 8)
--
-- Migration is purely an INSERT — no schema change, fully reversible
-- (DELETE WHERE code IN (...) AND tenant_id IS NULL).
-- ============================================================

INSERT INTO visit_purpose (tenant_id, code, label, category, sort_order) VALUES
  (NULL, 'drawing_review_meeting', 'Drawing review meeting', 'installation',  95),
  (NULL, 'fat_witness',            'FAT witness (factory)',   'installation', 105)
ON CONFLICT DO NOTHING;
