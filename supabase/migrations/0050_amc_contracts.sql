-- ============================================================
-- 0050_amc_contracts.sql — Raj demo Phase 4 (Blueprint CS-009)
--
-- AMC (Annual Maintenance Contract) module. Second piece of Customer
-- Success. Stays small in v1 — entity + scheduled visits + minimal
-- lifecycle. Sets up the linkage that complaint module needs
-- (complaint.amc_contract_id) so a "breakdown under AMC" complaint
-- can be tracked against the right contract.
--
-- ARCHITECTURAL DECISIONS (full reasoning in OVERNIGHT-NOTES.md):
--
-- 1. State machine — simple text + CHECK (draft / active / expired /
--    renewed / cancelled). 5 states, no stage table needed.
-- 2. Visit frequency = TEXT enum (monthly / quarterly / bi_annual /
--    annual / custom). custom = explicit visit dates only, no auto-gen.
-- 3. amc_visit_schedule rows generated at contract activation time
--    (in the createAmcContract action) based on frequency + start_date
--    + end_date. Not via Inngest cron — simpler + bounded.
-- 4. Renewal = explicit action creating a new contract row with
--    parent_contract_id FK; old contract advances to 'renewed' status.
-- 5. Billing — v1 contract carries `value` field only. AMC-specific
--    invoice schedule deferred (would need milestone-billing too,
--    which is Q5b — out of scope).
-- 6. Linkage — adds complaint.amc_contract_id FK (nullable) for
--    "complaint under AMC contract" tracking.
-- 7. Task auto-generation deferred — schedule rows exist; UI surfaces
--    overdue visits. Inngest task-generator can be added in v2.
--
-- Reverse: drop tables + drop complaint.amc_contract_id column.
-- ============================================================


-- ─── 1. AMC CONTRACT ─────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS amc_contract_seq;

CREATE TABLE amc_contract (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenant(id),

  -- Identity
  contract_number         TEXT NOT NULL,   -- auto VT-AMC-YYYY-NNNN; tenant-overridable
  title                   TEXT NOT NULL,
  scope                   TEXT,            -- what's covered (free text in v1)

  -- Customer
  firm_id                 UUID NOT NULL REFERENCES firm(id),

  -- Linked (nullable — AMC may stand alone or follow a project / order)
  project_id              UUID REFERENCES project(id),
  source_sales_order_id   UUID REFERENCES sales_order(id),
  parent_contract_id      UUID REFERENCES amc_contract(id),  -- for renewals

  -- Period + commercials
  start_date              DATE NOT NULL,
  end_date                DATE NOT NULL,
  value                   NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Service cadence
  visit_frequency         TEXT NOT NULL DEFAULT 'quarterly'
                            CHECK (visit_frequency IN ('monthly', 'quarterly', 'bi_annual', 'annual', 'custom')),
  visits_per_year         INTEGER,  -- computed from frequency at create time; 0 for 'custom'

  -- State
  status                  TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'active', 'expired', 'renewed', 'cancelled')),
  activated_at            TIMESTAMPTZ,
  activated_by            UUID REFERENCES auth.users(id),
  cancelled_at            TIMESTAMPTZ,
  cancelled_by            UUID REFERENCES auth.users(id),
  cancellation_reason     TEXT,

  -- Audit
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              UUID REFERENCES auth.users(id),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by              UUID REFERENCES auth.users(id),
  deleted_at              TIMESTAMPTZ,

  CHECK (end_date > start_date)
);

ALTER TABLE amc_contract ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON amc_contract
  FOR ALL USING (tenant_id = current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY "tenant_insert" ON amc_contract
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX amc_contract_number_tenant_idx ON amc_contract (tenant_id, contract_number);
CREATE INDEX amc_contract_firm_idx ON amc_contract (firm_id) WHERE deleted_at IS NULL;
CREATE INDEX amc_contract_status_idx ON amc_contract (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX amc_contract_end_date_idx ON amc_contract (tenant_id, end_date) WHERE deleted_at IS NULL AND status = 'active';
CREATE INDEX amc_contract_parent_idx ON amc_contract (parent_contract_id) WHERE parent_contract_id IS NOT NULL;

-- Auto-generate contract number (same VT-* hardcoded Vyara-ism as
-- quotation / order / invoice triggers — Phase 6 will fix all together).
CREATE OR REPLACE FUNCTION set_amc_contract_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.contract_number IS NULL OR NEW.contract_number = '' THEN
    NEW.contract_number :=
      'VT-AMC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('amc_contract_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_amc_contract_number
  BEFORE INSERT ON amc_contract
  FOR EACH ROW EXECUTE FUNCTION set_amc_contract_number();


-- ─── 2. AMC VISIT SCHEDULE ───────────────────────────────────
-- One row per scheduled visit. status enum tracks lifecycle.

CREATE TABLE amc_visit_schedule (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenant(id),
  amc_contract_id   UUID NOT NULL REFERENCES amc_contract(id) ON DELETE CASCADE,

  -- Scheduling
  visit_number      INTEGER NOT NULL,  -- 1-N within contract
  scheduled_date    DATE NOT NULL,
  scheduled_window  TEXT,              -- free text e.g. "morning" / "10am-12pm"

  -- Execution
  status            TEXT NOT NULL DEFAULT 'scheduled'
                      CHECK (status IN ('scheduled', 'done', 'missed', 'cancelled', 'rescheduled')),
  done_at           TIMESTAMPTZ,
  done_by           UUID REFERENCES user_profile(id),
  /** When the engineer logs the visit (often via Field Ops), the
   *  field_visit.id can be referenced here for cross-linkage. */
  field_visit_id    UUID,  -- soft FK (no DB-level FK to avoid coupling)
  notes             TEXT,

  -- Audit
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE amc_visit_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON amc_visit_schedule
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON amc_visit_schedule
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX amc_visit_contract_seq_idx ON amc_visit_schedule (amc_contract_id, visit_number);
CREATE INDEX amc_visit_date_idx ON amc_visit_schedule (tenant_id, scheduled_date) WHERE status = 'scheduled';
CREATE INDEX amc_visit_status_idx ON amc_visit_schedule (tenant_id, status);


-- ─── 3. COMPLAINT LINKAGE ────────────────────────────────────
-- Add the amc_contract_id FK to complaint so "complaint under AMC"
-- relationships are first-class. Nullable — most complaints are NOT
-- AMC-related.

ALTER TABLE complaint ADD COLUMN IF NOT EXISTS amc_contract_id UUID REFERENCES amc_contract(id);
CREATE INDEX IF NOT EXISTS complaint_amc_contract_idx ON complaint (amc_contract_id) WHERE deleted_at IS NULL AND amc_contract_id IS NOT NULL;


-- ─── 4. ACTIVITY TYPE EXTENSIONS ─────────────────────────────

ALTER TABLE activity DROP CONSTRAINT IF EXISTS activity_type_check;
ALTER TABLE activity ADD CONSTRAINT activity_type_check
  CHECK (type IN (
    'created', 'updated', 'stage_changed', 'sample_requested', 'sample_updated',
    'quote_created', 'quote_sent', 'task_created', 'task_done', 'note', 'call',
    'visit', 'notification', 'system',
    'dispatch_scheduled', 'dispatch_delivered', 'invoice_created', 'invoice_sent',
    'invoice_overdue', 'payment_received', 'dunning_sent', 'ptp_recorded',
    'lead_won', 'lost', 'lead_lost', 'lead_assigned', 'lead_meeting',
    'lead_quote_request', 'lead_sample_request',
    'stock_movement', 'stock_adjustment', 'stock_transfer', 'stock_reservation',
    'ai_extraction',
    'complaint_logged', 'complaint_triaged', 'complaint_assigned',
    'complaint_in_progress', 'complaint_resolved', 'complaint_closed',
    'complaint_rejected', 'complaint_reopened',
    -- 0050 AMC additions
    'amc_created', 'amc_activated', 'amc_renewed', 'amc_cancelled',
    'amc_visit_scheduled', 'amc_visit_done', 'amc_visit_missed'
  ));

INSERT INTO activity_type_master (tenant_id, code, label, category, module_code, sort_order) VALUES
  (NULL, 'amc_created',         'AMC contract created',     'customer_success', NULL, 510),
  (NULL, 'amc_activated',       'AMC contract activated',   'customer_success', NULL, 520),
  (NULL, 'amc_renewed',         'AMC contract renewed',     'customer_success', NULL, 530),
  (NULL, 'amc_cancelled',       'AMC contract cancelled',   'customer_success', NULL, 540),
  (NULL, 'amc_visit_scheduled', 'AMC visit scheduled',      'customer_success', NULL, 550),
  (NULL, 'amc_visit_done',      'AMC visit completed',      'customer_success', NULL, 560),
  (NULL, 'amc_visit_missed',    'AMC visit missed',         'customer_success', NULL, 570)
ON CONFLICT DO NOTHING;


-- ─── 5. ACTIVITY TRIGGER ─────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_fn_amc_contract_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
    VALUES (NEW.tenant_id, 'amc_contract', NEW.id, NEW.project_id, 'amc_created', auth.uid(),
            jsonb_build_object(
              'contract_number', NEW.contract_number,
              'firm_id', NEW.firm_id,
              'value', NEW.value,
              'start_date', NEW.start_date,
              'end_date', NEW.end_date
            ));

  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
    VALUES (NEW.tenant_id, 'amc_contract', NEW.id, NEW.project_id,
            CASE NEW.status
              WHEN 'active'    THEN 'amc_activated'
              WHEN 'renewed'   THEN 'amc_renewed'
              WHEN 'cancelled' THEN 'amc_cancelled'
              ELSE 'updated'
            END,
            auth.uid(),
            jsonb_build_object('contract_number', NEW.contract_number, 'from', OLD.status, 'to', NEW.status));
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_amc_contract_activity
  AFTER INSERT OR UPDATE ON amc_contract
  FOR EACH ROW EXECUTE FUNCTION trg_fn_amc_contract_activity();
