-- ============================================================
-- 0025_field_visit_lifecycle.sql — Field Sales Step 4
--
-- Adds the per-visit "arrive → meet → complete" lifecycle to
-- field_visit, and the 'planned_visit' task type so planned visits
-- ride the existing task/timeline spine (per Constitution #3).
--
-- Visit lifecycle:
--   - planned: a row exists in task (type='planned_visit'), no
--     field_visit row yet
--   - in_progress: rep tapped "Start visit" — field_visit row
--     exists with state='in_progress', started_at + arrival
--     odometer recorded
--   - completed: rep filled the completion form — state='completed',
--     visited_at set, purpose/outcome/contact/notes saved
--
-- Per-leg km is derived in code from arrival odometers, not stored,
-- so superseding a prior visit's odometer (e.g. edit) cascades
-- correctly without trigger plumbing.
-- ============================================================


-- ─── 1. Extend task.type to include 'planned_visit' ─────────────────────────
ALTER TABLE task DROP CONSTRAINT IF EXISTS task_type_check;
ALTER TABLE task ADD CONSTRAINT task_type_check
  CHECK (type IN ('manual', 'paving_followup', 'stale_quote', 'sample_outcome', 'system',
                  'order_followup', 'dispatch_schedule', 'dispatch_pod_pending',
                  'invoice_send', 'invoice_overdue', 'collection_followup', 'payment_ptp',
                  'stock_low', 'stock_adjustment_approval', 'stock_transfer_confirm',
                  'lead_followup', 'lead_stale',
                  -- Field sales
                  'planned_visit'));


-- ─── 2. Optional contact pointer on tasks ───────────────────────────────────
-- Planned visits often target a specific contact ("meet Architect Rakesh
-- about Greenvista"). Nullable; only set for planned_visit type today, but
-- usable by any future task type without another migration.
ALTER TABLE task
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contact(id);

CREATE INDEX IF NOT EXISTS task_contact_idx
  ON task (contact_id) WHERE contact_id IS NOT NULL AND deleted_at IS NULL;


-- ─── 3. Lifecycle columns on field_visit ────────────────────────────────────
-- visited_at remains the canonical "when the visit happened" timestamp; for
-- live (start→complete) visits, started_at marks the arrival and visited_at
-- is set on completion. For backdated entries (rep logs a visit later),
-- visited_at is the only timestamp and started_at stays null.
ALTER TABLE field_visit
  ADD COLUMN IF NOT EXISTS started_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS odometer_km_at_arrival INTEGER
                             CHECK (odometer_km_at_arrival IS NULL OR odometer_km_at_arrival >= 0),
  ADD COLUMN IF NOT EXISTS odometer_photo_url     TEXT,
  ADD COLUMN IF NOT EXISTS state                  TEXT NOT NULL DEFAULT 'completed'
                             CHECK (state IN ('in_progress', 'completed')),
  ADD COLUMN IF NOT EXISTS planned_task_id        UUID REFERENCES task(id);

-- For pulling the rep's currently-live visit on /field.
CREATE INDEX IF NOT EXISTS field_visit_state_idx
  ON field_visit (tenant_id, user_id, state)
  WHERE state = 'in_progress' AND deleted_at IS NULL;

-- For tying a completed visit back to the planning task.
CREATE INDEX IF NOT EXISTS field_visit_planned_task_idx
  ON field_visit (planned_task_id)
  WHERE planned_task_id IS NOT NULL AND deleted_at IS NULL;

-- For computing per-leg distance — pull arrival odometers for a day's visits.
CREATE INDEX IF NOT EXISTS field_visit_arrival_odo_idx
  ON field_visit (user_id, visited_at)
  WHERE odometer_km_at_arrival IS NOT NULL AND deleted_at IS NULL;
