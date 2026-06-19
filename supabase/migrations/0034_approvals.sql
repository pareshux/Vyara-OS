-- ============================================================
-- 0034_approvals.sql — FO-4 (Blueprint PLAT-014)
--
-- Generic, multi-level approval engine used by every capability
-- that needs human sign-off: expense claims (FO-5 / FIN-006), quote
-- discount overrides (REV-007), credit-limit extensions (FIN-009),
-- stock adjustments (DEL-001 already builds today's bespoke flow),
-- leave requests (FLD-001), etc.
--
-- Four tables:
--   1. approval_policy        — the rules (per entity_type + amount band)
--   2. approval_policy_step   — N ordered approval steps per policy
--   3. approval_request       — one row per "ask" raised by the engine
--   4. approval_step_action   — per-step decisions (audit + history)
--
-- Two modes:
--   - sequential: step 1 must clear before step 2 opens
--   - parallel:   all steps open at once; closes on either
--                 (a) require_all_parallel=true ⇒ all N approve,
--                 (b) require_all_parallel=false ⇒ any 1 approves.
--   In both modes, a single rejection closes the whole request as rejected.
--
-- Step approver resolution (`approver_via`):
--   - 'role'         → any active user_profile with role = approver_role
--   - 'specific_user'→ approver_user_id directly
--   (reports_to-based resolution lands when user_profile gets a
--    reports_to_user_id column — not in this migration.)
--
-- Auto-escalation (escalation_hours) — schema only; the Inngest cron
-- that closes idle steps gets wired with the FO-4 action layer.
--
-- entity_type is free-form TEXT (mirrors attachment) — consumers
-- write a known string and the action layer maps to the right
-- detail-page link. Convention documented in lib/actions/approvals.ts.
-- ============================================================


-- ─── 1. approval_policy ──────────────────────────────────────
CREATE TABLE approval_policy (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenant(id),
  entity_type           TEXT NOT NULL,                   -- 'expense_claim' | 'discount' | ...
  name                  TEXT NOT NULL,                   -- 'Expense claim ≥ ₹5k'
  -- Amount band selects which policy matches. NULL = unbounded.
  -- The action layer picks the policy whose band contains the request amount.
  min_amount            NUMERIC(14,2),
  max_amount            NUMERIC(14,2),
  mode                  TEXT NOT NULL DEFAULT 'sequential'
                          CHECK (mode IN ('sequential', 'parallel')),
  require_all_parallel  BOOLEAN NOT NULL DEFAULT true,   -- ignored if mode='sequential'
  escalation_hours      INTEGER,                          -- NULL = no escalation
  active                BOOLEAN NOT NULL DEFAULT true,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ,

  CHECK (min_amount IS NULL OR max_amount IS NULL OR min_amount <= max_amount)
);

ALTER TABLE approval_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON approval_policy
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

-- Hot path: "find matching policy for this entity_type, sorted by min_amount."
CREATE INDEX approval_policy_lookup_idx
  ON approval_policy (tenant_id, entity_type, active, min_amount)
  WHERE deleted_at IS NULL;


-- ─── 2. approval_policy_step ─────────────────────────────────
CREATE TABLE approval_policy_step (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenant(id),
  policy_id           UUID NOT NULL REFERENCES approval_policy(id) ON DELETE CASCADE,
  step_order          INTEGER NOT NULL,                  -- 1-based
  approver_via        TEXT NOT NULL CHECK (approver_via IN ('role', 'specific_user')),
  approver_role       TEXT,                              -- when via='role' — free-form (admin / manager / finance_head / …)
  approver_user_id    UUID REFERENCES user_profile(id),  -- when via='specific_user'
  label               TEXT,                               -- human label shown on the approval card
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Exactly one resolver populated based on approver_via.
  CHECK (
    (approver_via = 'role'         AND approver_role IS NOT NULL AND approver_user_id IS NULL)
    OR
    (approver_via = 'specific_user' AND approver_user_id IS NOT NULL AND approver_role IS NULL)
  ),
  UNIQUE (policy_id, step_order)
);

ALTER TABLE approval_policy_step ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON approval_policy_step
  FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX approval_policy_step_policy_idx
  ON approval_policy_step (policy_id, step_order);


-- ─── 3. approval_request ─────────────────────────────────────
CREATE TABLE approval_request (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenant(id),
  policy_id             UUID NOT NULL REFERENCES approval_policy(id),
  entity_type           TEXT NOT NULL,                   -- 'expense_claim' | 'discount' | ...
  entity_id             UUID NOT NULL,
  amount                NUMERIC(14,2),                   -- the value that picked this policy band
  subject_user_id       UUID NOT NULL REFERENCES user_profile(id),  -- who raised it
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  -- Sequential mode: the current open step. Parallel mode: NULL (all steps open).
  current_step_order    INTEGER,
  decided_at            TIMESTAMPTZ,
  decided_by_summary    TEXT,                             -- short label: 'Approved by Priya (mgr) + Mehul (admin)'
  notes                 TEXT,
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);

ALTER TABLE approval_request ENABLE ROW LEVEL SECURITY;

-- Tenant isolation. Per-user visibility (subject vs approver vs admin)
-- is enforced in the action layer where role context is available.
CREATE POLICY "tenant_isolation" ON approval_request
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

-- Hot path: "show every pending request for this tenant" (the
-- /approvals page filters further in the action layer to those
-- the actor can approve).
CREATE INDEX approval_request_pending_idx
  ON approval_request (tenant_id, status, current_step_order)
  WHERE deleted_at IS NULL;

-- "My requests" — surface on dashboards.
CREATE INDEX approval_request_subject_idx
  ON approval_request (subject_user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- "Approvals for this entity" — render inline on the entity's detail page.
CREATE INDEX approval_request_entity_idx
  ON approval_request (entity_type, entity_id, created_at DESC)
  WHERE deleted_at IS NULL;


-- ─── 4. approval_step_action ─────────────────────────────────
-- One row per decision. Replays the full history of a request.
-- Sequential: one row per cleared step. Parallel: up to N rows.
CREATE TABLE approval_step_action (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenant(id),
  request_id          UUID NOT NULL REFERENCES approval_request(id) ON DELETE CASCADE,
  step_order          INTEGER NOT NULL,
  approver_user_id    UUID NOT NULL REFERENCES user_profile(id),
  action              TEXT NOT NULL CHECK (action IN ('approved', 'rejected', 'escalated')),
  comment             TEXT,
  acted_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE approval_step_action ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON approval_step_action
  FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX approval_step_action_request_idx
  ON approval_step_action (request_id, step_order, acted_at);
