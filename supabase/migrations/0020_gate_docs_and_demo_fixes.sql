-- ============================================================
-- 0020_gate_docs_and_demo_fixes.sql
--
-- Pre-commit cleanup after the Scannable Project Tracking wiring:
--
-- 1. Re-point the two field-based gates to DOCUMENT gates so they
--    flip when a document is uploaded, not when a column is set.
--    Acceptance certificate + retention release letter become the
--    two hard Closeout gates; the soft installation-field gate on
--    Paving is dropped (subsumed by the acceptance certificate).
--
-- 2. Move Rajhans Mall back to Tracking so the demo story
--    (one in Tracking, one mid-Paving, one in Closeout) holds.
--    Greenvista stays on Paving; Surat SC stays on Closeout.
--
-- 3. Backdate Surat SC's transition into Closeout so the Closeout
--    SLA (30d) is exceeded — that's what flips its header to
--    "blocked" (gate unsatisfied + stage stalled past SLA).
-- ============================================================


-- ─── 1. Re-point the two field-based gates to document gates ────────────────

-- Drop the soft Paving `installation_completed_at` gate. The new
-- Closeout acceptance_certificate gate covers the same meaning.
DELETE FROM gate_requirement
WHERE id = uuid_in(md5('gate_paving_installation_done')::cstring);

-- Closeout's existing acceptance_certificate doc gate — relabel.
UPDATE gate_requirement
SET required_document_type = 'acceptance_certificate',
    label = 'Acceptance certificate uploaded'
WHERE id = uuid_in(md5('gate_closeout_acceptance')::cstring);

-- Closeout's existing retention_released field gate — convert to a
-- document gate. The column must flip from field → doc atomically.
UPDATE gate_requirement
SET required_field_name = NULL,
    required_document_type = 'retention_release_letter',
    label = 'Retention release letter uploaded'
WHERE id = uuid_in(md5('gate_closeout_retention_released')::cstring);


-- ─── 2. Bump Rajhans Mall back to Tracking ──────────────────────────────────
-- Live state had it on Paving (likely advanced manually during dev).
-- For the demo story we want it on Tracking with no orders.

UPDATE project
SET current_stage_id = 'c0000000-0000-0000-0000-000000000002'::uuid,  -- Tracking
    updated_at = now()
WHERE id = 'abcdef00-0000-0000-0000-000000000003'::uuid
  AND current_stage_id <> 'c0000000-0000-0000-0000-000000000002'::uuid;

-- Record the back-flow honestly in stage history so the timeline reads correctly.
INSERT INTO project_stage_history (tenant_id, project_id, from_stage_id, to_stage_id, actor_id, remark, created_at)
SELECT
  'a1111111-1111-1111-1111-111111111111'::uuid,
  'abcdef00-0000-0000-0000-000000000003'::uuid,
  -- Whatever the previous stage was (will resolve at insert-time via a subquery in real usage; here we just put NULL for the demo bump)
  NULL,
  'c0000000-0000-0000-0000-000000000002'::uuid,
  'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
  'Demo reset: returned to Tracking for the headline demo story.',
  now() - interval '2 days'
WHERE NOT EXISTS (
  SELECT 1 FROM project_stage_history
  WHERE project_id = 'abcdef00-0000-0000-0000-000000000003'::uuid
    AND remark = 'Demo reset: returned to Tracking for the headline demo story.'
);


-- ─── 3. Backdate Surat SC's Closeout entry so SLA is exceeded ───────────────
-- The Closeout stage has sla_days = 30. The latest stage transition
-- for Surat SC was 'tracking → paving_stage' (then in-place renamed
-- to → closeout via migration 0018). We add a new history row to
-- model the transition INTO the renamed stage, dated 45d ago.

INSERT INTO project_stage_history (tenant_id, project_id, from_stage_id, to_stage_id, actor_id, remark, created_at)
SELECT
  'a1111111-1111-1111-1111-111111111111'::uuid,
  'abcdef00-0000-0000-0000-000000000002'::uuid,
  'c0000000-0000-0000-0000-000000000003'::uuid,  -- Paving
  'c0000000-0000-0000-0000-000000000004'::uuid,  -- Closeout (the row originally seeded as Quoting, renamed in 0018)
  '98bcb345-ff63-4bc0-9587-e53bad54f367'::uuid,
  'Closeout — final bill issued, awaiting acceptance + retention release.',
  now() - interval '45 days'
WHERE NOT EXISTS (
  SELECT 1 FROM project_stage_history
  WHERE project_id = 'abcdef00-0000-0000-0000-000000000002'::uuid
    AND remark = 'Closeout — final bill issued, awaiting acceptance + retention release.'
);
