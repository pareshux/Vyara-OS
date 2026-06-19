-- ============================================================
-- 0035_expenses.sql — FO-5 (Blueprint FIN-006 + FIN-007)
--
-- Multi-category expense module. Reps log non-vehicle expenses
-- (fuel/tolls/food/parking/accommodation/etc.) — separate from the
-- vehicle km-reimbursement that already lives on field_attendance.
--
-- Two tables:
--   1. expense_category — system + tenant-extensible master (same
--      pattern as task_type / activity_type / relationship_type)
--   2. expense           — one row per expense line item
--
-- Lifecycle:
--   draft → submitted → (auto or via approval engine) → approved
--                                                    → rejected
--                                                    → exported
--   draft → cancelled  (rep deletes before submit)
--
-- Approval wiring (FO-4 / PLAT-014):
--   On `submitExpense`:
--     - findMatchingPolicy(entity_type='expense', amount=expense.amount)
--     - if matching policy → requestApproval(...) → store
--       approval_request_id on the expense; status='submitted'
--     - if no policy + autoApprove=true → status='approved' directly
--   On `decideApproval` for an expense-tagged request:
--     - The engine just records the action; a small Inngest handler
--       (or read-time computation) reflects status back onto expense.
--     For v1 we read approval_request.status at render time via the
--     <ApprovalCard> on expense detail and update expense.status when
--     the rep / accounts hit "refresh" — clean enough until usage shows
--     this needs an event-driven write-back.
--
-- Receipt photos come from PLAT-013 attachments
-- (entity_type='expense', kind='receipt').
-- ============================================================


-- ─── 1. expense_category ─────────────────────────────────────
CREATE TABLE expense_category (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenant(id),         -- NULL = system row
  code        TEXT NOT NULL,                       -- lowercase machine key
  label       TEXT NOT NULL,                       -- human label
  icon_key    TEXT,                                 -- lucide icon name hint
  sort_order  INTEGER NOT NULL DEFAULT 100,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE expense_category ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_system_or_own" ON expense_category
  FOR SELECT
  USING ((tenant_id IS NULL OR tenant_id = current_tenant_id()) AND deleted_at IS NULL);

CREATE POLICY "tenant_write" ON expense_category
  FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "tenant_update" ON expense_category
  FOR UPDATE
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL);

CREATE UNIQUE INDEX expense_category_system_uniq
  ON expense_category (code)
  WHERE tenant_id IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX expense_category_tenant_uniq
  ON expense_category (tenant_id, code)
  WHERE tenant_id IS NOT NULL AND deleted_at IS NULL;


-- ─── 2. expense ──────────────────────────────────────────────
CREATE TABLE expense (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenant(id),
  user_id               UUID NOT NULL REFERENCES user_profile(id),  -- the rep who spent
  expense_date          DATE NOT NULL,                              -- the day it was incurred
  category_id           UUID NOT NULL REFERENCES expense_category(id),
  amount                NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  notes                 TEXT,

  -- Optional reference to a parent entity. Keeps the cross-capability
  -- read clean: "show me every expense logged during this visit".
  subject_type          TEXT CHECK (subject_type IN ('field_visit', 'project', 'lead', 'firm')),
  subject_id            UUID,

  -- Lifecycle.
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN
                            ('draft', 'submitted', 'approved', 'rejected', 'cancelled', 'exported')),
  submitted_at          TIMESTAMPTZ,
  approved_at           TIMESTAMPTZ,
  rejected_at           TIMESTAMPTZ,
  rejection_reason      TEXT,
  exported_at           TIMESTAMPTZ,
  exported_batch_ref    TEXT,                                     -- accounting export batch id

  -- Approval engine link. NULL when the expense auto-approves
  -- (no matching policy) or is still a draft.
  approval_request_id   UUID REFERENCES approval_request(id),

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES auth.users(id),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by            UUID REFERENCES auth.users(id),
  deleted_at            TIMESTAMPTZ,

  -- Subject id must be set when subject_type is set, and vice-versa.
  CHECK ((subject_type IS NULL AND subject_id IS NULL) OR
         (subject_type IS NOT NULL AND subject_id IS NOT NULL))
);

ALTER TABLE expense ENABLE ROW LEVEL SECURITY;

-- Reps see only their own; managers/admins see everyone in the tenant.
-- Same shape as field_attendance / field_visit.
CREATE POLICY "own_or_team_select" ON expense
  FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    AND deleted_at IS NULL
    AND (user_id = auth.uid() OR current_actor_role() IN ('admin', 'manager'))
  );

CREATE POLICY "own_or_admin_insert" ON expense
  FOR INSERT
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND (user_id = auth.uid() OR current_actor_role() IN ('admin', 'manager'))
  );

-- Reps update only their own drafts; managers/admins can change status
-- (mark exported, fix mistakes, etc.).
CREATE POLICY "own_or_admin_update" ON expense
  FOR UPDATE
  USING (
    tenant_id = current_tenant_id()
    AND deleted_at IS NULL
    AND (
      (user_id = auth.uid() AND status = 'draft')
      OR current_actor_role() IN ('admin', 'manager')
    )
  );

-- Hot path: "my expenses for date range, sorted newest first".
CREATE INDEX expense_user_date_idx
  ON expense (tenant_id, user_id, expense_date DESC, status)
  WHERE deleted_at IS NULL;

-- Manager queue: "all submitted expenses awaiting export, by date".
CREATE INDEX expense_status_idx
  ON expense (tenant_id, status, expense_date DESC)
  WHERE deleted_at IS NULL AND status IN ('submitted', 'approved');

-- "Show every expense from this visit" — rendered on the visit detail.
CREATE INDEX expense_subject_idx
  ON expense (subject_type, subject_id, expense_date DESC)
  WHERE deleted_at IS NULL AND subject_type IS NOT NULL;


-- ─── 3. Seed system categories ───────────────────────────────
-- 12 cross-industry defaults; tenants add / hide via the master.
-- Codes are lowercase (system-row convention from 0029 / 0031 / 0032).

INSERT INTO expense_category (tenant_id, code, label, icon_key, sort_order) VALUES
  (NULL, 'fuel',           'Fuel',                    'Fuel',          10),
  (NULL, 'tolls',          'Tolls & parking',         'CircleParking', 20),
  (NULL, 'food_self',      'Food (self)',             'Utensils',      30),
  (NULL, 'food_client',    'Food (client)',           'Coffee',        40),
  (NULL, 'taxi',           'Taxi / auto',             'Car',           50),
  (NULL, 'train_air',      'Train / flight',          'Plane',         60),
  (NULL, 'accommodation',  'Accommodation',           'Bed',           70),
  (NULL, 'mobile_recharge','Mobile / data',           'Smartphone',    80),
  (NULL, 'gift',           'Customer gift',           'Gift',          90),
  (NULL, 'sample_courier', 'Sample courier',          'Package',      100),
  (NULL, 'site_supplies',  'Site supplies',           'Wrench',       110),
  (NULL, 'other',          'Other',                   'Receipt',      900);
