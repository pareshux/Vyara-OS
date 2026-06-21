-- ============================================================
-- 0046_extend_project_segment_for_raj.sql — Raj demo Phase 2 (Blueprint REV-001)
--
-- Extends project.segment CHECK to admit the two Raj-specific
-- pipeline segments (epc_project + panel_order) that Phase 1 seeded
-- in pipeline_stage. Without this, INSERT INTO project (..., segment,
-- ...) VALUES (..., 'epc_project', ...) fails the CHECK from migration
-- 0039.
--
-- Additive only — existing values preserved. Same surgical pattern as
-- 0039_electrical_demo_schema.sql.
--
-- Architectural note (recorded in OVERNIGHT-NOTES.md): a more
-- cross-industry-by-configuration move would be to drop the CHECK
-- entirely and let each tenant's segment vocabulary live in
-- tenant.settings or a master table. Deferred — single-line CHECK
-- extension lands the demo without scope creep; the broader refactor
-- can happen when a 3rd industry surfaces a 3rd vocabulary need.
--
-- Reverse: ALTER TABLE project DROP CONSTRAINT project_segment_check;
--          ALTER TABLE project ADD CONSTRAINT project_segment_check
--            CHECK (segment IN (... original list ...));
-- ============================================================

ALTER TABLE project DROP CONSTRAINT IF EXISTS project_segment_check;
ALTER TABLE project ADD CONSTRAINT project_segment_check
  CHECK (segment IN (
    -- Original (0003 baseline)
    'architect', 'dealer', 'tender', 'retail', 'government', 'corporate', 'generic',
    -- 0039 cross-industry additions
    'electrical', 'mechanical', 'civil',
    -- 0046 Raj demo: pipeline_stage.segment values for the two Raj templates
    'epc_project', 'panel_order'
  ));
