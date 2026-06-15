-- ============================================================
-- 0006_invoices.sql  — Slice 2 / Step 3: Invoice module
--
-- Owns its own tables (invoice_*). Reads from sales_order/project for
-- snapshot data; does not write to any other module's tables. The
-- Collection module (Step 4) listens for invoice.created via Inngest.
--
-- Slice-2 spec highlights handled here:
--   - source flag (manual | csv | tally) for reconciliation
--   - retention money + running-bill tracking (construction reality)
--   - ageing buckets computed via SQL view
-- ============================================================


-- ─── 1. INVOICE ──────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS invoice_seq;

CREATE TABLE invoice (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenant(id),

  -- Numbering — internal sequential always assigned; the external/Tally
  -- number is stored separately for reconciliation
  invoice_number           TEXT NOT NULL,                  -- our internal: VT-INV-YYYY-NNNN
  external_invoice_number  TEXT,                           -- tally/printed-book number, if different

  source                   TEXT NOT NULL DEFAULT 'manual'
                              CHECK (source IN ('manual', 'csv', 'tally')),
  synced_at                TIMESTAMPTZ,                    -- last successful Tally sync
  source_metadata          JSONB NOT NULL DEFAULT '{}',    -- e.g. tally voucher meta, csv row #

  -- Links — sales_order_id is nullable (direct billing allowed)
  project_id               UUID REFERENCES project(id),
  sales_order_id           UUID REFERENCES sales_order(id),
  buyer_firm_id            UUID REFERENCES firm(id),

  -- Dates
  invoice_date             DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date                 DATE NOT NULL,
  payment_terms_days       INTEGER NOT NULL DEFAULT 30,

  -- Money
  subtotal                 NUMERIC(14,2) NOT NULL DEFAULT 0,
  gst_pct                  NUMERIC(5,2)  NOT NULL DEFAULT 18,
  gst_amount               NUMERIC(14,2) NOT NULL DEFAULT 0,
  total                    NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Retention money (% withheld until project completion)
  retention_pct            NUMERIC(5,2)  NOT NULL DEFAULT 0,
  retention_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
  retention_released_at    DATE,
  retention_released_by    UUID REFERENCES auth.users(id),

  -- Billed = total - retention; this is the amount actually due now
  billed_amount            NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount              NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Running-bill tracking (e.g. partial billing across a project)
  is_running_bill          BOOLEAN NOT NULL DEFAULT false,
  running_bill_seq         INTEGER,                       -- 1, 2, 3 ...
  is_final_bill            BOOLEAN NOT NULL DEFAULT false,

  status                   TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'sent', 'paid',
                                                'partial_paid', 'cancelled', 'written_off')),

  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               UUID REFERENCES auth.users(id),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by               UUID REFERENCES auth.users(id),
  deleted_at               TIMESTAMPTZ
);

ALTER TABLE invoice ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON invoice
  FOR ALL USING (tenant_id = current_tenant_id() AND deleted_at IS NULL);
CREATE POLICY "tenant_insert" ON invoice
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE UNIQUE INDEX invoice_number_tenant_idx          ON invoice (tenant_id, invoice_number);
CREATE UNIQUE INDEX invoice_external_number_tenant_idx ON invoice (tenant_id, external_invoice_number) WHERE external_invoice_number IS NOT NULL;
CREATE INDEX invoice_project_idx ON invoice (project_id) WHERE deleted_at IS NULL;
CREATE INDEX invoice_order_idx   ON invoice (sales_order_id) WHERE deleted_at IS NULL;
CREATE INDEX invoice_buyer_idx   ON invoice (tenant_id, buyer_firm_id) WHERE deleted_at IS NULL;
CREATE INDEX invoice_due_idx     ON invoice (tenant_id, due_date) WHERE deleted_at IS NULL AND status NOT IN ('paid','cancelled','written_off');
CREATE INDEX invoice_status_idx  ON invoice (tenant_id, status) WHERE deleted_at IS NULL;

-- Auto-generate internal invoice number: VT-INV-YYYY-NNNN
CREATE OR REPLACE FUNCTION set_invoice_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number :=
      'VT-INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('invoice_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_invoice_number
  BEFORE INSERT ON invoice
  FOR EACH ROW EXECUTE FUNCTION set_invoice_number();


-- ─── 2. INVOICE LINE (optional itemization) ──────────────────────────────────
CREATE TABLE invoice_line (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenant(id),
  invoice_id    UUID NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
  description   TEXT NOT NULL,
  sku_code      TEXT,
  quantity      NUMERIC(10,2),
  unit          TEXT,
  unit_price    NUMERIC(10,2),
  line_total    NUMERIC(14,2) NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE invoice_line ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON invoice_line
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_insert" ON invoice_line
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX invoice_line_invoice_idx ON invoice_line (invoice_id);


-- ─── 3. ACTIVITY TRIGGER ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_fn_invoice_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
    VALUES (NEW.tenant_id, 'invoice', NEW.id, NEW.project_id, 'invoice_created', auth.uid(),
            jsonb_build_object('invoice_number', NEW.invoice_number,
                               'total', NEW.total,
                               'due_date', NEW.due_date));

  ELSIF TG_OP = 'UPDATE'
    AND OLD.status != 'sent' AND NEW.status = 'sent' THEN
    INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content)
    VALUES (NEW.tenant_id, 'invoice', NEW.id, NEW.project_id, 'invoice_sent', auth.uid(),
            jsonb_build_object('invoice_number', NEW.invoice_number, 'total', NEW.total));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_invoice_activity
  AFTER INSERT OR UPDATE ON invoice
  FOR EACH ROW EXECUTE FUNCTION trg_fn_invoice_activity();


-- ─── 4. AGEING VIEW ─────────────────────────────────────────────────────────
-- Per-invoice computed view returning days_overdue, ageing_bucket, outstanding.
-- Used by both the Invoice list and the Finance dashboard.

CREATE OR REPLACE VIEW invoice_ageing_v AS
SELECT
  i.id,
  i.tenant_id,
  i.invoice_number,
  i.external_invoice_number,
  i.buyer_firm_id,
  i.project_id,
  i.sales_order_id,
  i.invoice_date,
  i.due_date,
  i.total,
  i.retention_amount,
  i.billed_amount,
  i.paid_amount,
  i.status,
  (i.billed_amount - i.paid_amount)::NUMERIC(14,2)                       AS outstanding,
  GREATEST(0, CURRENT_DATE - i.due_date)::INTEGER                        AS days_overdue,
  CASE
    WHEN i.status IN ('paid','cancelled','written_off') THEN 'closed'
    WHEN i.billed_amount - i.paid_amount <= 0           THEN 'closed'
    WHEN CURRENT_DATE <= i.due_date                     THEN 'current'
    WHEN CURRENT_DATE - i.due_date BETWEEN 1 AND 30     THEN '1-30'
    WHEN CURRENT_DATE - i.due_date BETWEEN 31 AND 60    THEN '31-60'
    ELSE                                                     '60+'
  END                                                                    AS ageing_bucket
FROM invoice i
WHERE i.deleted_at IS NULL;

GRANT SELECT ON invoice_ageing_v TO authenticated;
