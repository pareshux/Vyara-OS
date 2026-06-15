-- ============================================================
-- 0004_orders.sql  — Slice 2 / Step 1: Order module
--
-- Modular monolith: this module OWNS its own tables (prefix sales_order_*).
-- Communication with other modules is via Inngest events, not cross-module
-- writes. Reads from other modules' tables are allowed at snapshot time
-- (e.g. seeding a sales_order from a quotation) — never on the hot path.
--
-- Invariants (per Constitution + Slice 1):
--   - tenant_id on every table
--   - audit cols + soft-delete on mutable business objects
--   - Supabase RLS on every table
--   - sales_order_stage_history is append-only
--   - Activity timeline auto-written via triggers
-- ============================================================


-- ─── 1. TRANSPORTER (master) ─────────────────────────────────────────────────
CREATE TABLE transporter (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenant(id),
  name          TEXT NOT NULL,
  contact_name  TEXT,
  phone         TEXT,
  vehicle_count INTEGER,
  notes         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES auth.users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID REFERENCES auth.users(id),
  deleted_at    TIMESTAMPTZ
);

ALTER TABLE transporter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON transporter
  FOR ALL USING (tenant_id = current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY "tenant_insert" ON transporter
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX transporter_tenant_active_idx ON transporter (tenant_id, is_active) WHERE deleted_at IS NULL;


-- ─── 2. ORDER_STAGE (data-driven, mirrors pipeline_stage pattern) ────────────
-- tenant_id NULL → system stage shared by all tenants.

CREATE TABLE order_stage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenant(id),
  stage_key   TEXT NOT NULL,
  label       TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  color       TEXT NOT NULL DEFAULT '#94a3b8',
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE order_stage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_system_or_own" ON order_stage
  FOR SELECT USING (tenant_id IS NULL OR tenant_id = current_tenant_id());
CREATE POLICY "write_own" ON order_stage
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX order_stage_system_uniq
  ON order_stage (stage_key) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX order_stage_tenant_uniq
  ON order_stage (tenant_id, stage_key) WHERE tenant_id IS NOT NULL;
CREATE INDEX order_stage_order_idx ON order_stage (order_index);


-- ─── 3. SALES_ORDER ──────────────────────────────────────────────────────────
-- Created from quote.won event OR manually. quote_id is nullable
-- because direct orders (no quote) are allowed.

CREATE SEQUENCE IF NOT EXISTS sales_order_seq;

CREATE TABLE sales_order (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenant(id),
  order_number          TEXT NOT NULL,
  project_id            UUID NOT NULL REFERENCES project(id),
  quote_id              UUID REFERENCES quotation(id),   -- snapshot source (nullable)
  buyer_firm_id         UUID REFERENCES firm(id),
  current_stage_id      UUID NOT NULL REFERENCES order_stage(id),
  order_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_at  DATE,
  value                 NUMERIC(14,2) NOT NULL DEFAULT 0,  -- snapshot total
  notes                 TEXT,
  owner_id              UUID NOT NULL REFERENCES user_profile(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES auth.users(id),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by            UUID REFERENCES auth.users(id),
  deleted_at            TIMESTAMPTZ
);

ALTER TABLE sales_order ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON sales_order
  FOR ALL USING (tenant_id = current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY "tenant_insert" ON sales_order
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX sales_order_number_tenant_idx ON sales_order (tenant_id, order_number);
CREATE INDEX sales_order_project_idx  ON sales_order (project_id) WHERE deleted_at IS NULL;
CREATE INDEX sales_order_quote_idx    ON sales_order (quote_id)   WHERE deleted_at IS NULL;
CREATE INDEX sales_order_stage_idx    ON sales_order (tenant_id, current_stage_id) WHERE deleted_at IS NULL;
CREATE INDEX sales_order_owner_idx    ON sales_order (tenant_id, owner_id) WHERE deleted_at IS NULL;

-- Auto-generate order number: VT-SO-YYYY-NNNN
CREATE OR REPLACE FUNCTION set_sales_order_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number :=
      'VT-SO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('sales_order_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sales_order_number
  BEFORE INSERT ON sales_order
  FOR EACH ROW EXECUTE FUNCTION set_sales_order_number();


-- ─── 4. SALES_ORDER_LINE ─────────────────────────────────────────────────────
-- Snapshots product details at order time (Constitution §8 — immutable snapshots).

CREATE TABLE sales_order_line (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenant(id),
  sales_order_id  UUID NOT NULL REFERENCES sales_order(id) ON DELETE CASCADE,
  product_id      UUID REFERENCES product(id),  -- nullable: snapshot survives catalog delete
  product_name    TEXT NOT NULL,   -- snapshot
  sku_code        TEXT NOT NULL,   -- snapshot
  unit            TEXT NOT NULL,   -- snapshot
  quantity        NUMERIC(10,2) NOT NULL,
  unit_price      NUMERIC(10,2) NOT NULL,
  line_total      NUMERIC(14,2) NOT NULL,
  notes           TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE sales_order_line ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON sales_order_line
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON sales_order_line
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX sales_order_line_order_idx ON sales_order_line (sales_order_id);


-- ─── 5. SALES_ORDER_STAGE_HISTORY (append-only) ──────────────────────────────
CREATE TABLE sales_order_stage_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenant(id),
  sales_order_id  UUID NOT NULL REFERENCES sales_order(id) ON DELETE CASCADE,
  from_stage_id   UUID REFERENCES order_stage(id),
  to_stage_id     UUID NOT NULL REFERENCES order_stage(id),
  actor_id        UUID REFERENCES auth.users(id),
  remark          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sales_order_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON sales_order_stage_history
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON sales_order_stage_history
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

REVOKE UPDATE, DELETE ON sales_order_stage_history FROM authenticated;

CREATE INDEX so_stage_history_order_idx ON sales_order_stage_history (sales_order_id, created_at DESC);


-- ─── 6. ACTIVITY AUTO-LOG (timeline) ─────────────────────────────────────────
-- Mirrors the project trigger pattern. project_id denormalized for fast queries.

CREATE OR REPLACE FUNCTION trg_fn_sales_order_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
    VALUES (NEW.tenant_id, 'sales_order', NEW.id, NEW.project_id, 'created', auth.uid(),
            jsonb_build_object('order_number', NEW.order_number, 'value', NEW.value,
                               'stage_id', NEW.current_stage_id));

  ELSIF TG_OP = 'UPDATE'
    AND OLD.current_stage_id IS DISTINCT FROM NEW.current_stage_id THEN
    INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
    VALUES (NEW.tenant_id, 'sales_order', NEW.id, NEW.project_id, 'stage_changed', auth.uid(),
            jsonb_build_object('order_number', NEW.order_number,
                               'from_stage_id', OLD.current_stage_id,
                               'to_stage_id', NEW.current_stage_id));
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sales_order_activity
  AFTER INSERT OR UPDATE ON sales_order
  FOR EACH ROW EXECUTE FUNCTION trg_fn_sales_order_activity();


-- ─── 7. EXTEND task.type CHECK ───────────────────────────────────────────────
-- Slice 2 task types: order_followup, dispatch_schedule, dispatch_pod_pending,
-- invoice_send, invoice_overdue, collection_followup, payment_ptp.
-- We extend the existing CHECK to admit them.

ALTER TABLE task DROP CONSTRAINT IF EXISTS task_type_check;
ALTER TABLE task ADD CONSTRAINT task_type_check
  CHECK (type IN ('manual', 'paving_followup', 'stale_quote', 'sample_outcome', 'system',
                  'order_followup', 'dispatch_schedule', 'dispatch_pod_pending',
                  'invoice_send', 'invoice_overdue', 'collection_followup', 'payment_ptp'));


-- ─── 8. EXTEND activity.type CHECK ───────────────────────────────────────────
-- Slice 2 activity types: order_created/updated/stage_changed (re-uses existing),
-- dispatch_scheduled, dispatch_delivered, invoice_created, invoice_sent,
-- payment_received, dunning_sent, ptp_recorded.

ALTER TABLE activity DROP CONSTRAINT IF EXISTS activity_type_check;
ALTER TABLE activity ADD CONSTRAINT activity_type_check
  CHECK (type IN ('created', 'updated', 'stage_changed', 'sample_requested',
                  'sample_updated', 'quote_created', 'quote_sent',
                  'task_created', 'task_done', 'note', 'call',
                  'visit', 'notification', 'system',
                  -- Slice 2 additions
                  'dispatch_scheduled', 'dispatch_delivered',
                  'invoice_created', 'invoice_sent', 'invoice_overdue',
                  'payment_received', 'dunning_sent', 'ptp_recorded'));


-- ─── 9. SEED order_stage system rows ─────────────────────────────────────────
INSERT INTO order_stage (id, tenant_id, stage_key, label, order_index, color, is_terminal) VALUES
  ('a0000000-0000-0000-0000-000000000001'::uuid, NULL, 'confirmed',     'Confirmed',      1, '#60a5fa', false),
  ('a0000000-0000-0000-0000-000000000002'::uuid, NULL, 'in_production', 'In Production',  2, '#a78bfa', false),
  ('a0000000-0000-0000-0000-000000000003'::uuid, NULL, 'ready',         'Ready',          3, '#fbbf24', false),
  ('a0000000-0000-0000-0000-000000000004'::uuid, NULL, 'dispatched',    'Dispatched',     4, '#f97316', false),
  ('a0000000-0000-0000-0000-000000000005'::uuid, NULL, 'delivered',     'Delivered',      5, '#22c55e', false),
  ('a0000000-0000-0000-0000-000000000006'::uuid, NULL, 'closed',        'Closed',         6, '#6b7280', true),
  ('a0000000-0000-0000-0000-000000000007'::uuid, NULL, 'cancelled',     'Cancelled',      7, '#ef4444', true);
