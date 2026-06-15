-- ============================================================
-- 0007_collections.sql  — Slice 2 / Step 4: Collection module (HERO)
--
-- Owns its own tables (collection_*, receipt, promise_to_pay).
-- Listens on invoice.synced to create one collection per invoice.
-- Drives the automated WhatsApp dunning cadence via Inngest cron.
-- ============================================================


-- ─── 1. COLLECTION_STAGE ─────────────────────────────────────────────────────
CREATE TABLE collection_stage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenant(id),
  stage_key   TEXT NOT NULL,
  label       TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  color       TEXT NOT NULL DEFAULT '#94a3b8',
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE collection_stage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_system_or_own" ON collection_stage
  FOR SELECT USING (tenant_id IS NULL OR tenant_id = current_tenant_id());
CREATE POLICY "write_own" ON collection_stage
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX collection_stage_system_uniq ON collection_stage (stage_key) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX collection_stage_tenant_uniq ON collection_stage (tenant_id, stage_key) WHERE tenant_id IS NOT NULL;


-- ─── 2. COLLECTION (one per invoice) ─────────────────────────────────────────
CREATE TABLE collection (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenant(id),
  invoice_id         UUID NOT NULL REFERENCES invoice(id),
  current_stage_id   UUID NOT NULL REFERENCES collection_stage(id),

  escalation_level   INTEGER NOT NULL DEFAULT 0,
  last_dunning_at    TIMESTAMPTZ,
  next_action_at     TIMESTAMPTZ,
  closed_at          TIMESTAMPTZ,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES auth.users(id),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         UUID REFERENCES auth.users(id),
  deleted_at         TIMESTAMPTZ,

  UNIQUE (invoice_id)
);

ALTER TABLE collection ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON collection
  FOR ALL USING (tenant_id = current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY "tenant_insert" ON collection
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX collection_invoice_idx     ON collection (invoice_id);
CREATE INDEX collection_stage_idx       ON collection (tenant_id, current_stage_id) WHERE deleted_at IS NULL;
CREATE INDEX collection_next_action_idx ON collection (tenant_id, next_action_at) WHERE deleted_at IS NULL AND closed_at IS NULL;


-- ─── 3. COLLECTION_STAGE_HISTORY ─────────────────────────────────────────────
CREATE TABLE collection_stage_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenant(id),
  collection_id   UUID NOT NULL REFERENCES collection(id) ON DELETE CASCADE,
  from_stage_id   UUID REFERENCES collection_stage(id),
  to_stage_id     UUID NOT NULL REFERENCES collection_stage(id),
  actor_id        UUID REFERENCES auth.users(id),
  remark          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE collection_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON collection_stage_history
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON collection_stage_history
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

REVOKE UPDATE, DELETE ON collection_stage_history FROM authenticated;

CREATE INDEX c_stage_history_idx ON collection_stage_history (collection_id, created_at DESC);


-- ─── 4. COLLECTION_ACTIVITY (dunning attempts log) ───────────────────────────
CREATE TABLE collection_activity (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenant(id),
  collection_id   UUID NOT NULL REFERENCES collection(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL CHECK (channel IN ('whatsapp', 'sms', 'email', 'voice', 'in_app', 'manual_call', 'manual_visit')),
  template_key    TEXT,
  outcome         TEXT NOT NULL CHECK (outcome IN ('sent', 'delivered', 'replied', 'failed', 'logged')),
  external_id     TEXT,            -- AiSensy / vendor message id
  payload         JSONB NOT NULL DEFAULT '{}',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id)
);

ALTER TABLE collection_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON collection_activity
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON collection_activity
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

REVOKE UPDATE, DELETE ON collection_activity FROM authenticated;

CREATE INDEX collection_activity_collection_idx ON collection_activity (collection_id, created_at DESC);


-- ─── 5. PROMISE_TO_PAY ───────────────────────────────────────────────────────
CREATE TABLE promise_to_pay (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenant(id),
  collection_id   UUID NOT NULL REFERENCES collection(id) ON DELETE CASCADE,
  invoice_id      UUID NOT NULL REFERENCES invoice(id),
  amount          NUMERIC(14,2) NOT NULL,
  promise_date    DATE NOT NULL,
  contact_id      UUID REFERENCES contact(id),
  notes           TEXT,
  is_honoured     BOOLEAN,         -- NULL = pending; true/false on review
  honoured_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id)
);

ALTER TABLE promise_to_pay ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON promise_to_pay
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON promise_to_pay
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX ptp_collection_idx ON promise_to_pay (collection_id, created_at DESC);
CREATE INDEX ptp_invoice_idx    ON promise_to_pay (invoice_id);


-- ─── 6. RECEIPT (payment recording) ──────────────────────────────────────────
CREATE TABLE receipt (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenant(id),
  invoice_id          UUID NOT NULL REFERENCES invoice(id),
  amount              NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_mode        TEXT NOT NULL CHECK (payment_mode IN ('cheque', 'neft', 'rtgs', 'upi', 'cash', 'card', 'other')),
  payment_reference   TEXT,         -- cheque #, UTR, UPI ref
  received_at         DATE NOT NULL DEFAULT CURRENT_DATE,
  bank_account        TEXT,
  notes               TEXT,
  source              TEXT NOT NULL DEFAULT 'manual'
                        CHECK (source IN ('manual', 'tally', 'razorpay')),
  external_id         TEXT,
  source_metadata     JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES auth.users(id),
  deleted_at          TIMESTAMPTZ
);

ALTER TABLE receipt ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON receipt
  FOR ALL USING (tenant_id = current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY "tenant_insert" ON receipt
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX receipt_invoice_idx  ON receipt (invoice_id) WHERE deleted_at IS NULL;
CREATE INDEX receipt_received_idx ON receipt (tenant_id, received_at DESC) WHERE deleted_at IS NULL;


-- ─── 7. ACTIVITY TRIGGERS ────────────────────────────────────────────────────

-- Collection stage changes → timeline
CREATE OR REPLACE FUNCTION trg_fn_collection_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_project_id UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.current_stage_id IS DISTINCT FROM NEW.current_stage_id THEN
    SELECT project_id INTO v_project_id FROM invoice WHERE id = NEW.invoice_id;
    INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
    VALUES (NEW.tenant_id, 'collection', NEW.id, v_project_id, 'stage_changed', auth.uid(),
            jsonb_build_object('invoice_id', NEW.invoice_id,
                               'from_stage_id', OLD.current_stage_id,
                               'to_stage_id', NEW.current_stage_id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_collection_activity
  AFTER UPDATE ON collection
  FOR EACH ROW EXECUTE FUNCTION trg_fn_collection_activity();


-- Receipt insert → timeline + invoice.paid_amount update + invoice status
CREATE OR REPLACE FUNCTION trg_fn_receipt_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invoice    invoice%ROWTYPE;
  v_total_paid NUMERIC(14,2);
  v_new_status TEXT;
  v_project_id UUID;
BEGIN
  SELECT * INTO v_invoice FROM invoice WHERE id = NEW.invoice_id;
  IF v_invoice.id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM receipt
  WHERE invoice_id = NEW.invoice_id AND deleted_at IS NULL;

  -- Determine status
  IF v_total_paid >= v_invoice.billed_amount THEN
    v_new_status := 'paid';
  ELSIF v_total_paid > 0 THEN
    v_new_status := 'partial_paid';
  ELSE
    v_new_status := v_invoice.status;
  END IF;

  UPDATE invoice
  SET paid_amount = v_total_paid,
      status      = v_new_status,
      updated_at  = now()
  WHERE id = NEW.invoice_id;

  -- If fully paid, close the related collection
  IF v_new_status = 'paid' THEN
    UPDATE collection
    SET current_stage_id = (SELECT id FROM collection_stage WHERE stage_key = 'paid' AND tenant_id IS NULL LIMIT 1),
        closed_at = now(),
        updated_at = now()
    WHERE invoice_id = NEW.invoice_id;
  END IF;

  -- Timeline: payment_received
  v_project_id := v_invoice.project_id;
  INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
  VALUES (NEW.tenant_id, 'invoice', NEW.invoice_id, v_project_id, 'payment_received', NEW.created_by,
          jsonb_build_object('receipt_id', NEW.id,
                             'amount', NEW.amount,
                             'mode', NEW.payment_mode,
                             'reference', NEW.payment_reference));

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_receipt_after_insert
  AFTER INSERT ON receipt
  FOR EACH ROW EXECUTE FUNCTION trg_fn_receipt_after_insert();


-- PTP insert → timeline
CREATE OR REPLACE FUNCTION trg_fn_ptp_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_project_id UUID;
BEGIN
  SELECT project_id INTO v_project_id FROM invoice WHERE id = NEW.invoice_id;
  INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
  VALUES (NEW.tenant_id, 'collection', NEW.collection_id, v_project_id, 'ptp_recorded', NEW.created_by,
          jsonb_build_object('amount', NEW.amount,
                             'promise_date', NEW.promise_date,
                             'invoice_id', NEW.invoice_id));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ptp_after_insert
  AFTER INSERT ON promise_to_pay
  FOR EACH ROW EXECUTE FUNCTION trg_fn_ptp_after_insert();


-- collection_activity insert → timeline (only for outbound dunning)
CREATE OR REPLACE FUNCTION trg_fn_collection_activity_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invoice_id UUID;
  v_project_id UUID;
BEGIN
  SELECT invoice_id INTO v_invoice_id FROM collection WHERE id = NEW.collection_id;
  IF v_invoice_id IS NOT NULL THEN
    SELECT project_id INTO v_project_id FROM invoice WHERE id = v_invoice_id;
  END IF;
  IF NEW.outcome IN ('sent', 'delivered') THEN
    INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
    VALUES (NEW.tenant_id, 'collection', NEW.collection_id, v_project_id, 'dunning_sent', NEW.created_by,
            jsonb_build_object('channel', NEW.channel,
                               'template_key', NEW.template_key,
                               'external_id', NEW.external_id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_collection_activity_after_insert
  AFTER INSERT ON collection_activity
  FOR EACH ROW EXECUTE FUNCTION trg_fn_collection_activity_after_insert();


-- ─── 8. SEED collection_stage system rows ────────────────────────────────────
INSERT INTO collection_stage (id, tenant_id, stage_key, label, order_index, color, is_terminal) VALUES
  ('d0000000-0000-0000-0000-000000000001'::uuid, NULL, 'due',                  'Due',              1, '#60a5fa', false),
  ('d0000000-0000-0000-0000-000000000002'::uuid, NULL, 'pre_due_reminder',     'Pre-due reminder', 2, '#fbbf24', false),
  ('d0000000-0000-0000-0000-000000000003'::uuid, NULL, 'overdue',              'Overdue',          3, '#f97316', false),
  ('d0000000-0000-0000-0000-000000000004'::uuid, NULL, 'dunning_whatsapp',     'Dunning — WhatsApp', 4, '#ef4444', false),
  ('d0000000-0000-0000-0000-000000000005'::uuid, NULL, 'ai_voice_escalation',  'AI voice',         5, '#dc2626', false),
  ('d0000000-0000-0000-0000-000000000006'::uuid, NULL, 'promise_to_pay',       'Promise to pay',   6, '#a78bfa', false),
  ('d0000000-0000-0000-0000-000000000007'::uuid, NULL, 'paid',                 'Paid',             7, '#22c55e', true),
  ('d0000000-0000-0000-0000-000000000008'::uuid, NULL, 'disputed',             'Disputed',         8, '#f59e0b', false),
  ('d0000000-0000-0000-0000-000000000009'::uuid, NULL, 'written_off',          'Written off',      9, '#6b7280', true);


-- ─── 9. BACK-FILL collections for existing invoices ──────────────────────────
-- One collection per invoice in 'due' state (idempotent).
INSERT INTO collection (tenant_id, invoice_id, current_stage_id)
SELECT i.tenant_id, i.id, (SELECT id FROM collection_stage WHERE stage_key = 'due' AND tenant_id IS NULL)
FROM invoice i
WHERE i.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM collection c WHERE c.invoice_id = i.id);
