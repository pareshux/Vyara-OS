-- ============================================================
-- 0048_complaint_module.sql — Raj demo Phase 3 (Blueprint CS-001)
--
-- Minimum-viable complaint module — first piece of the Customer
-- Success capability. Drives Raj's AMC + breakdown service motion
-- (the "73% retention" headline metric depends on this surface
-- existing). Also a real Sprint 2 item (CS-001 was 📋 Planned)
-- that gets built now because the Raj demo needs it.
--
-- ARCHITECTURAL DECISIONS (every one is flippable — documented in
-- OVERNIGHT-NOTES.md with cost-to-flip).
--
-- 1. Severity model — system+tenant master (severity_master), NOT
--    hardcoded enum. Same cross-industry-by-configuration pattern as
--    task_type_master / activity_type_master / relationship_type_master.
-- 2. Complaint type model — system+tenant master (complaint_type_master).
-- 3. State machine — dedicated complaint_stage table (system+tenant),
--    same shape as order_stage from 0004. NOT reused pipeline_stage
--    (that's project-shaped). 7 system stages: logged → triaged →
--    assigned → in_progress → resolved → closed; + rejected as terminal.
-- 4. Assignment — complaint.assignee_id FK to user_profile, set
--    manually by manager. Auto-routing (round-robin / territory /
--    competency) deferred to v2.
-- 5. SLA — deferred to CS-003. v1 captures timestamps (logged_at,
--    triaged_at, resolved_at, closed_at); SLA tooling derives later.
-- 6. Linkage — complaint.firm_id required (the customer);
--    project_id / sales_order_id / amc_contract_id all nullable
--    (amc_contract_id FK added in Phase 4 / CS-009).
-- 7. Event emissions — skip Inngest events for v1 (no consumers yet).
--    Activity timeline writes via trigger (same pattern as other entities).
-- 8. UI scope — /complaints list + /complaints/[id] detail. Mobile
--    surface deferred (responsive list is sufficient for v1).
-- 9. Permissions — tenant_isolation RLS only. Per-user scoping
--    (engineer sees own assigned; manager sees team) deferred to v2.
--
-- Reverse: see end of file.
-- ============================================================


-- ─── 1. SEVERITY MASTER ──────────────────────────────────────
-- Same system+tenant pattern as task_type_master (migration 0029).

CREATE TABLE severity_master (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenant(id),  -- NULL = system row
  code        TEXT NOT NULL,
  label       TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#94a3b8',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  /** 1 = lowest severity; higher numbers = more severe. Used by
      Attention Centre + sort-by-severity views. */
  rank        INTEGER NOT NULL DEFAULT 1,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE severity_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_system_or_own" ON severity_master
  FOR SELECT USING ((tenant_id IS NULL OR tenant_id = current_tenant_id()) AND deleted_at IS NULL);
CREATE POLICY "tenant_write" ON severity_master
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "tenant_update" ON severity_master
  FOR UPDATE USING (tenant_id = current_tenant_id() AND deleted_at IS NULL);

CREATE UNIQUE INDEX severity_master_system_uniq ON severity_master (code) WHERE tenant_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX severity_master_tenant_uniq ON severity_master (tenant_id, code) WHERE tenant_id IS NOT NULL AND deleted_at IS NULL;

INSERT INTO severity_master (tenant_id, code, label, color, sort_order, rank) VALUES
  (NULL, 'low',      'Low',      '#16a34a',  10, 1),
  (NULL, 'medium',   'Medium',   '#eab308',  20, 2),
  (NULL, 'high',     'High',     '#ea580c',  30, 3),
  (NULL, 'critical', 'Critical', '#dc2626',  40, 4);


-- ─── 2. COMPLAINT TYPE MASTER ────────────────────────────────

CREATE TABLE complaint_type_master (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenant(id),  -- NULL = system row
  code        TEXT NOT NULL,
  label       TEXT NOT NULL,
  /** Hint for industry-pack filtering. */
  category    TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE complaint_type_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_system_or_own" ON complaint_type_master
  FOR SELECT USING ((tenant_id IS NULL OR tenant_id = current_tenant_id()) AND deleted_at IS NULL);
CREATE POLICY "tenant_write" ON complaint_type_master
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "tenant_update" ON complaint_type_master
  FOR UPDATE USING (tenant_id = current_tenant_id() AND deleted_at IS NULL);

CREATE UNIQUE INDEX complaint_type_master_system_uniq ON complaint_type_master (code) WHERE tenant_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX complaint_type_master_tenant_uniq ON complaint_type_master (tenant_id, code) WHERE tenant_id IS NOT NULL AND deleted_at IS NULL;

INSERT INTO complaint_type_master (tenant_id, code, label, category, sort_order) VALUES
  (NULL, 'product_defect',          'Product defect',                  'product',      10),
  (NULL, 'installation_issue',      'Installation issue',              'installation', 20),
  (NULL, 'performance_below_spec',  'Performance below specification', 'product',      30),
  (NULL, 'warranty_claim',          'Warranty claim',                  'warranty',     40),
  (NULL, 'breakdown',               'Breakdown / outage',              'service',      50),
  (NULL, 'damaged_in_transit',      'Damaged in transit',              'delivery',     60),
  (NULL, 'billing_dispute',         'Billing / invoice dispute',       'finance',      70),
  (NULL, 'training_request',        'Training / how-to request',       'service',      80),
  (NULL, 'other',                   'Other',                           'other',       900);


-- ─── 3. COMPLAINT STAGE ──────────────────────────────────────
-- Dedicated state machine for complaints. Same shape as order_stage.

CREATE TABLE complaint_stage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenant(id),
  stage_key   TEXT NOT NULL,
  label       TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#94a3b8',
  order_index INTEGER NOT NULL,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  /** True for the "actively being worked on" stages — drives Attention
      Centre filters ("show me open complaints"). */
  is_open     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE complaint_stage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_system_or_own" ON complaint_stage
  FOR SELECT USING (tenant_id IS NULL OR tenant_id = current_tenant_id());
CREATE POLICY "write_own" ON complaint_stage
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX complaint_stage_system_uniq ON complaint_stage (stage_key) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX complaint_stage_tenant_uniq ON complaint_stage (tenant_id, stage_key) WHERE tenant_id IS NOT NULL;
CREATE INDEX complaint_stage_order_idx ON complaint_stage (order_index);

-- Seed 7 system stages — visible to all tenants. Same shape as Vyara's
-- pipeline_stage system seeds (deterministic UUIDs for stable references).
INSERT INTO complaint_stage (id, tenant_id, stage_key, label, color, order_index, is_terminal, is_open) VALUES
  ('b0000000-0000-0000-0000-000000000001'::uuid, NULL, 'logged',       'Logged',        '#94a3b8', 1, false, true),
  ('b0000000-0000-0000-0000-000000000002'::uuid, NULL, 'triaged',      'Triaged',       '#60a5fa', 2, false, true),
  ('b0000000-0000-0000-0000-000000000003'::uuid, NULL, 'assigned',     'Assigned',      '#818cf8', 3, false, true),
  ('b0000000-0000-0000-0000-000000000004'::uuid, NULL, 'in_progress',  'In progress',   '#fbbf24', 4, false, true),
  ('b0000000-0000-0000-0000-000000000005'::uuid, NULL, 'resolved',     'Resolved',      '#22c55e', 5, false, true),
  ('b0000000-0000-0000-0000-000000000006'::uuid, NULL, 'closed',       'Closed',        '#6b7280', 6, true,  false),
  ('b0000000-0000-0000-0000-000000000007'::uuid, NULL, 'rejected',     'Rejected',      '#ef4444', 7, true,  false);


-- ─── 4. COMPLAINT ────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS complaint_seq;

CREATE TABLE complaint (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenant(id),

  -- Identification
  complaint_number    TEXT NOT NULL,   -- auto VT-CMP-YYYY-NNNN; pre-fillable for tenant overrides
  title               TEXT NOT NULL,
  description         TEXT,

  -- Classification
  type_id             UUID NOT NULL REFERENCES complaint_type_master(id),
  severity_id         UUID NOT NULL REFERENCES severity_master(id),

  -- State
  current_stage_id    UUID NOT NULL REFERENCES complaint_stage(id),

  -- Who / where (firm_id required; project / order / amc_contract nullable)
  firm_id             UUID NOT NULL REFERENCES firm(id),
  reported_by_contact_id UUID REFERENCES contact(id),
  project_id          UUID REFERENCES project(id),
  sales_order_id      UUID REFERENCES sales_order(id),

  -- Assignment (nullable until assigned)
  assignee_id         UUID REFERENCES user_profile(id),
  assigned_at         TIMESTAMPTZ,
  assigned_by         UUID REFERENCES auth.users(id),

  -- Resolution
  resolution_notes    TEXT,
  root_cause          TEXT,
  resolved_at         TIMESTAMPTZ,
  resolved_by         UUID REFERENCES auth.users(id),
  closed_at           TIMESTAMPTZ,
  closed_by           UUID REFERENCES auth.users(id),

  -- Audit timestamps (set as state advances)
  logged_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  triaged_at          TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES auth.users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID REFERENCES auth.users(id),
  deleted_at          TIMESTAMPTZ
);

ALTER TABLE complaint ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON complaint
  FOR ALL USING (tenant_id = current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY "tenant_insert" ON complaint
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX complaint_number_tenant_idx ON complaint (tenant_id, complaint_number);
CREATE INDEX complaint_firm_idx ON complaint (firm_id) WHERE deleted_at IS NULL;
CREATE INDEX complaint_assignee_idx ON complaint (tenant_id, assignee_id) WHERE deleted_at IS NULL;
CREATE INDEX complaint_stage_idx ON complaint (tenant_id, current_stage_id) WHERE deleted_at IS NULL;
CREATE INDEX complaint_severity_idx ON complaint (tenant_id, severity_id) WHERE deleted_at IS NULL;
CREATE INDEX complaint_project_idx ON complaint (project_id) WHERE deleted_at IS NULL AND project_id IS NOT NULL;
CREATE INDEX complaint_order_idx ON complaint (sales_order_id) WHERE deleted_at IS NULL AND sales_order_id IS NOT NULL;

-- Auto-generate complaint number (Vyara-ism — VT-CMP prefix hardcoded;
-- consistent with quotation/order/invoice triggers. Phase 6 will rewrite
-- all of these to use tenant.settings.codes / next_code_sequence RPC.)
CREATE OR REPLACE FUNCTION set_complaint_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.complaint_number IS NULL OR NEW.complaint_number = '' THEN
    NEW.complaint_number :=
      'VT-CMP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('complaint_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_complaint_number
  BEFORE INSERT ON complaint
  FOR EACH ROW EXECUTE FUNCTION set_complaint_number();


-- ─── 5. COMPLAINT STAGE HISTORY (append-only) ────────────────

CREATE TABLE complaint_stage_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenant(id),
  complaint_id  UUID NOT NULL REFERENCES complaint(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES complaint_stage(id),
  to_stage_id   UUID NOT NULL REFERENCES complaint_stage(id),
  actor_id      UUID REFERENCES auth.users(id),
  remark        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE complaint_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON complaint_stage_history
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON complaint_stage_history
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

REVOKE UPDATE, DELETE ON complaint_stage_history FROM authenticated;

CREATE INDEX complaint_stage_history_idx ON complaint_stage_history (complaint_id, created_at DESC);


-- ─── 6. ACTIVITY TYPE EXTENSIONS ─────────────────────────────
-- Add complaint event types to the activity type CHECK (the existing
-- ones from 0004 + 0006 + lead extensions don't cover complaint).

ALTER TABLE activity DROP CONSTRAINT IF EXISTS activity_type_check;
ALTER TABLE activity ADD CONSTRAINT activity_type_check
  CHECK (type IN (
    -- Slice 1
    'created', 'updated', 'stage_changed', 'sample_requested', 'sample_updated',
    'quote_created', 'quote_sent', 'task_created', 'task_done', 'note', 'call',
    'visit', 'notification', 'system',
    -- Slice 2
    'dispatch_scheduled', 'dispatch_delivered', 'invoice_created', 'invoice_sent',
    'invoice_overdue', 'payment_received', 'dunning_sent', 'ptp_recorded',
    -- Lead extensions (0022)
    'lead_won', 'lost', 'lead_lost', 'lead_assigned', 'lead_meeting',
    'lead_quote_request', 'lead_sample_request',
    -- Inventory (0009)
    'stock_movement', 'stock_adjustment', 'stock_transfer', 'stock_reservation',
    -- AI extraction (0021)
    'ai_extraction',
    -- 0048 Complaint additions
    'complaint_logged', 'complaint_triaged', 'complaint_assigned',
    'complaint_in_progress', 'complaint_resolved', 'complaint_closed',
    'complaint_rejected', 'complaint_reopened'
  ));


-- ─── 7. ACTIVITY AUTO-LOG TRIGGER ────────────────────────────

CREATE OR REPLACE FUNCTION trg_fn_complaint_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_stage_key TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT stage_key INTO v_stage_key FROM complaint_stage WHERE id = NEW.current_stage_id;
    INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
    VALUES (NEW.tenant_id, 'complaint', NEW.id, NEW.project_id, 'complaint_logged', auth.uid(),
            jsonb_build_object(
              'complaint_number', NEW.complaint_number,
              'title', NEW.title,
              'firm_id', NEW.firm_id,
              'severity_id', NEW.severity_id,
              'stage', v_stage_key
            ));

  ELSIF TG_OP = 'UPDATE'
    AND OLD.current_stage_id IS DISTINCT FROM NEW.current_stage_id THEN
    SELECT stage_key INTO v_stage_key FROM complaint_stage WHERE id = NEW.current_stage_id;
    INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
    VALUES (NEW.tenant_id, 'complaint', NEW.id, NEW.project_id,
            CASE v_stage_key
              WHEN 'triaged'     THEN 'complaint_triaged'
              WHEN 'assigned'    THEN 'complaint_assigned'
              WHEN 'in_progress' THEN 'complaint_in_progress'
              WHEN 'resolved'    THEN 'complaint_resolved'
              WHEN 'closed'      THEN 'complaint_closed'
              WHEN 'rejected'    THEN 'complaint_rejected'
              ELSE 'stage_changed'
            END,
            auth.uid(),
            jsonb_build_object(
              'complaint_number', NEW.complaint_number,
              'from_stage_id', OLD.current_stage_id,
              'to_stage_id', NEW.current_stage_id,
              'stage', v_stage_key
            ));
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_complaint_activity
  AFTER INSERT OR UPDATE ON complaint
  FOR EACH ROW EXECUTE FUNCTION trg_fn_complaint_activity();


-- ─── 8. AI EXTRACTION ENTITY-KIND EXTENSION ──────────────────
-- Future complaint-classifier AI (CS-013) would write to ai_extraction.
-- Pre-add the entity_kind so the consumer doesn't need a separate migration.
-- Carry forward the canonical list from 0044 and append 'complaint_classification'.

ALTER TABLE ai_extraction DROP CONSTRAINT IF EXISTS ai_extraction_entity_kind_check;
ALTER TABLE ai_extraction ADD CONSTRAINT ai_extraction_entity_kind_check
  CHECK (entity_kind IN (
    'dispatch_diary', 'invoice_photo', 'voice_quote',
    'voice_sample_outcome', 'whatsapp_ptp', 'playground',
    'business_card',
    'odometer_photo', 'voice_visit_note',
    'visit_prep_brief',
    'team_day_summary',
    'firm_brief',
    'owner_brief',
    -- 0048 Raj demo Phase 3 (CS-001): complaint classification
    'complaint_classification'
  ));


-- ============================================================
-- REVERSE (for emergency rollback):
--   DROP TRIGGER trg_complaint_activity ON complaint;
--   DROP FUNCTION trg_fn_complaint_activity;
--   DROP TRIGGER trg_complaint_number ON complaint;
--   DROP FUNCTION set_complaint_number;
--   DROP TABLE complaint_stage_history;
--   DROP TABLE complaint;
--   DROP SEQUENCE complaint_seq;
--   DROP TABLE complaint_stage;
--   DROP TABLE complaint_type_master;
--   DROP TABLE severity_master;
--   ALTER TABLE activity DROP CONSTRAINT activity_type_check, ADD CONSTRAINT activity_type_check CHECK (... pre-0048 set ...);
-- ============================================================
