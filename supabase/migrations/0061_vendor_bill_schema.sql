-- ============================================================
-- 0061_vendor_bill_schema.sql — Vendor Bills + 3-way match (P2α)
--
-- Blueprint: DEL-018 (Vendor Bill core).
--
-- Adds the AP-side foundation: vendor invoices arrive, get matched
-- against the PO (rate, HSN, GST) and the cumulative GRN (qty), and
-- become outstanding payables. Payment + AP ageing + MSME compliance
-- ship in subsequent slices (P2β / P3).
--
--   vendor_bill (header)
--     - vendor_invoice_no + _at — the vendor's tax invoice
--     - po_id (optional, typical) + grn_id (optional, v1 = single GRN)
--     - bill_date, received_at (drives MSME 45-day calc), due_date
--     - money rollups + match_status (bill-level aggregate)
--     - status state machine: draft → submitted → approved →
--       (partly_paid → paid) | cancelled
--
--   vendor_bill_line
--     - po_line_id (optional — sets the 3-way match path)
--     - qty/rate/HSN/GST stored verbatim from the vendor invoice
--     - igst/cgst/sgst stored separately so reconciliation against
--       the PO snapshot is line-comparable
--     - match_status per line (matched / qty_over / rate_mismatch /
--       hsn_mismatch / gst_mismatch / unlinked)
--     - match_notes carries the per-line diagnostic
--
--   purchase_order_line gets `qty_billed` so a partial billing run
--   doesn't have to derive cumulative-billed at every read.
--
-- Approval seeding mirrors the PO bands (₹50k - ₹5L manager, etc.).
-- ============================================================


-- ─── 1. purchase_order_line.qty_billed ──────────────────────

ALTER TABLE purchase_order_line
  ADD COLUMN IF NOT EXISTS qty_billed NUMERIC(14,3) NOT NULL DEFAULT 0
    CHECK (qty_billed >= 0);

COMMENT ON COLUMN purchase_order_line.qty_billed IS
  'Cumulative qty billed via approved vendor bills. Set by vendor-bill approve action. Partial billing: qty_received can be 100 while qty_billed is 50 (vendor split into two invoices).';


-- ─── 2. vendor_bill ───────────────────────────────────────────

CREATE TABLE vendor_bill (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenant(id),
  bill_number              TEXT NOT NULL,                                  -- our internal ref (VT-VB-*)
  vendor_id                UUID NOT NULL REFERENCES vendor(id),
  po_id                    UUID REFERENCES purchase_order(id),             -- optional (direct bills allowed in v2)
  grn_id                   UUID REFERENCES goods_receipt_note(id),         -- v1 single-GRN bill; multi-GRN later via join table
  -- Vendor's tax invoice (the legal document)
  vendor_invoice_no        TEXT NOT NULL,
  vendor_invoice_date      DATE NOT NULL,
  -- Our booking
  bill_date                DATE NOT NULL DEFAULT CURRENT_DATE,
  received_at              DATE,                                            -- when goods were received (drives MSME 45-day)
  due_date                 DATE,                                            -- computed from received_at + payment_terms_days
  currency                 TEXT NOT NULL DEFAULT 'INR',
  -- Status
  status                   TEXT NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'submitted', 'approved', 'partly_paid', 'paid', 'cancelled')),
  -- Bill-level 3-way match outcome (aggregated from line match)
  match_status             TEXT NOT NULL DEFAULT 'pending'
                             CHECK (match_status IN ('pending', 'matched', 'under_review', 'mismatched')),
  match_run_at             TIMESTAMPTZ,
  match_notes              TEXT,                                            -- summary of issues, surfaces in UI
  -- Money rollups
  subtotal                 NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount               NUMERIC(14,2) NOT NULL DEFAULT 0,
  round_off                NUMERIC(10,2) NOT NULL DEFAULT 0,                -- vendor invoices often round to nearest rupee
  total                    NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- Payment state (P3 wires these — kept here as columns so the ageing read works as soon as P3 lands)
  amount_paid              NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_outstanding       NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- Address snapshots (PO already has them; copy at bill creation so vendor invoice doc render is stable even if vendor master changes)
  vendor_address_snapshot  TEXT,
  bill_to_snapshot         TEXT,
  -- Workflow
  approval_request_id      UUID REFERENCES approval_request(id),
  submitted_at             TIMESTAMPTZ,
  approved_at              TIMESTAMPTZ,
  approved_by              UUID REFERENCES user_profile(id),
  cancelled_at             TIMESTAMPTZ,
  cancelled_by             UUID REFERENCES user_profile(id),
  cancellation_reason      TEXT,
  notes                    TEXT,
  -- Audit
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               UUID REFERENCES user_profile(id),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by               UUID REFERENCES user_profile(id),
  deleted_at               TIMESTAMPTZ,

  UNIQUE (tenant_id, bill_number),
  -- Vendor's invoice number should be unique per vendor (matches Indian
  -- GST: each vendor invoice number is unique to the supplier).
  UNIQUE (tenant_id, vendor_id, vendor_invoice_no)
);

ALTER TABLE vendor_bill ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON vendor_bill
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX vb_vendor_idx      ON vendor_bill (vendor_id) WHERE deleted_at IS NULL;
CREATE INDEX vb_po_idx          ON vendor_bill (po_id) WHERE po_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX vb_grn_idx         ON vendor_bill (grn_id) WHERE grn_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX vb_status_idx      ON vendor_bill (tenant_id, status, bill_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX vb_match_idx       ON vendor_bill (tenant_id, match_status) WHERE deleted_at IS NULL;
CREATE INDEX vb_due_idx         ON vendor_bill (tenant_id, due_date) WHERE status IN ('approved', 'partly_paid') AND deleted_at IS NULL;
CREATE INDEX vb_approval_idx    ON vendor_bill (approval_request_id) WHERE approval_request_id IS NOT NULL;


-- Sequence + render_tenant_code-aware auto-number trigger
CREATE SEQUENCE vendor_bill_seq START 1;

CREATE OR REPLACE FUNCTION set_vendor_bill_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq  BIGINT;
  v_code TEXT;
BEGIN
  IF NEW.bill_number IS NOT NULL AND NEW.bill_number <> '' THEN
    RETURN NEW;
  END IF;
  v_seq := nextval('vendor_bill_seq');
  v_code := render_tenant_code(NEW.tenant_id, 'vendor_bill', v_seq);
  IF v_code IS NULL THEN
    v_code := 'VT-VB-' || EXTRACT(YEAR FROM NEW.bill_date)::TEXT || '-' || LPAD(v_seq::TEXT, 4, '0');
  END IF;
  NEW.bill_number := v_code;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_vendor_bill_number_t
  BEFORE INSERT ON vendor_bill
  FOR EACH ROW EXECUTE FUNCTION set_vendor_bill_number();


-- ─── 3. vendor_bill_line ──────────────────────────────────────

CREATE TABLE vendor_bill_line (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenant(id),
  bill_id          UUID NOT NULL REFERENCES vendor_bill(id) ON DELETE CASCADE,
  line_no          INTEGER NOT NULL,
  -- 3-way match path
  po_line_id       UUID REFERENCES purchase_order_line(id),
  product_id       UUID REFERENCES product(id),
  description      TEXT NOT NULL,
  hsn_code         TEXT,
  unit             TEXT NOT NULL DEFAULT 'nos',
  quantity         NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  rate             NUMERIC(14,2) NOT NULL CHECK (rate >= 0),
  discount_pct     NUMERIC(5,2) NOT NULL DEFAULT 0
                     CHECK (discount_pct >= 0 AND discount_pct <= 100),
  taxable_value    NUMERIC(14,2) NOT NULL,
  is_interstate    BOOLEAN NOT NULL DEFAULT false,
  gst_rate_pct     NUMERIC(5,2) NOT NULL DEFAULT 0
                     CHECK (gst_rate_pct IN (0, 0.1, 0.25, 1, 3, 5, 6, 12, 18, 28)),
  igst_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  cgst_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  sgst_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_total     NUMERIC(14,2) NOT NULL,
  -- Match outcome (set by run3WayMatch)
  match_status     TEXT NOT NULL DEFAULT 'pending'
                     CHECK (match_status IN ('pending', 'matched', 'qty_over', 'rate_mismatch', 'hsn_mismatch', 'gst_mismatch', 'unlinked')),
  match_notes      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (bill_id, line_no)
);

ALTER TABLE vendor_bill_line ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON vendor_bill_line
  FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX vbl_bill_idx     ON vendor_bill_line (bill_id);
CREATE INDEX vbl_po_line_idx  ON vendor_bill_line (po_line_id) WHERE po_line_id IS NOT NULL;


-- ─── 4. EXTEND next_code_sequence RPC ─────────────────────────

CREATE OR REPLACE FUNCTION next_code_sequence(p_kind TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq_name TEXT;
BEGIN
  v_seq_name := CASE p_kind
    WHEN 'quotation'          THEN 'quotation_seq'
    WHEN 'sales_order'        THEN 'sales_order_seq'
    WHEN 'invoice'            THEN 'invoice_seq'
    WHEN 'dispatch'           THEN 'dispatch_seq'
    WHEN 'dealer'             THEN 'dealer_seq'
    WHEN 'lead'               THEN 'lead_seq'
    WHEN 'stock_transfer'     THEN 'stock_transfer_seq'
    WHEN 'purchase_order'     THEN 'purchase_order_seq'
    WHEN 'goods_receipt_note' THEN 'goods_receipt_note_seq'
    WHEN 'return_to_vendor'   THEN 'return_to_vendor_seq'
    WHEN 'vendor_bill'        THEN 'vendor_bill_seq'
    ELSE NULL
  END;

  IF v_seq_name IS NULL THEN
    RAISE EXCEPTION 'next_code_sequence: unknown kind %', p_kind;
  END IF;

  RETURN nextval(v_seq_name::regclass);
END;
$$;


-- ─── 5. PER-TENANT CODE TEMPLATE SEED ─────────────────────────

UPDATE tenant
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{codes,vendor_bill}',
  '"VT-VB-{yyyy}-{nnnn}"'::jsonb,
  true
)
WHERE slug = 'vyara-tiles';

UPDATE tenant
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{codes,vendor_bill}',
  '"RA-VB-{yyyy}-{nnnn}"'::jsonb,
  true
)
WHERE slug = 'raj-avinsys';


-- ─── 6. APPROVAL POLICY SEED (mirrors PO bands) ───────────────

DO $$
DECLARE
  t_record       RECORD;
  v_policy_mid   UUID;
  v_policy_high  UUID;
  v_policy_top   UUID;
BEGIN
  FOR t_record IN
    SELECT id, slug FROM tenant WHERE slug IN ('vyara-tiles', 'raj-avinsys')
  LOOP
    -- Skip if already seeded (idempotency)
    IF EXISTS (
      SELECT 1 FROM approval_policy
      WHERE tenant_id = t_record.id AND entity_type = 'vendor_bill'
    ) THEN
      RAISE NOTICE '[vendor-bill] approval policies already exist for tenant %, skipping', t_record.slug;
      CONTINUE;
    END IF;

    -- Band 1: ₹50k - ₹5L → manager
    INSERT INTO approval_policy (
      tenant_id, entity_type, name, min_amount, max_amount, mode,
      require_all_parallel, active, notes
    ) VALUES (
      t_record.id, 'vendor_bill', 'Vendor bill ₹50k - ₹5L',
      50000.01, 500000, 'sequential', true, true,
      'Manager approval for routine vendor invoices.'
    )
    RETURNING id INTO v_policy_mid;

    INSERT INTO approval_policy_step (
      tenant_id, policy_id, step_order, approver_via, approver_role, label
    ) VALUES (
      t_record.id, v_policy_mid, 1, 'role', 'manager', 'Manager approval'
    );

    -- Band 2: ₹5L - ₹25L → manager → admin
    INSERT INTO approval_policy (
      tenant_id, entity_type, name, min_amount, max_amount, mode,
      require_all_parallel, active, notes
    ) VALUES (
      t_record.id, 'vendor_bill', 'Vendor bill ₹5L - ₹25L',
      500000.01, 2500000, 'sequential', true, true,
      'Two-step: manager then director.'
    )
    RETURNING id INTO v_policy_high;

    INSERT INTO approval_policy_step (
      tenant_id, policy_id, step_order, approver_via, approver_role, label
    ) VALUES
      (t_record.id, v_policy_high, 1, 'role', 'manager', 'Manager approval'),
      (t_record.id, v_policy_high, 2, 'role', 'admin',   'Director approval');

    -- Band 3: ≥ ₹25L → admin
    INSERT INTO approval_policy (
      tenant_id, entity_type, name, min_amount, max_amount, mode,
      require_all_parallel, active, notes
    ) VALUES (
      t_record.id, 'vendor_bill', 'Vendor bill ≥ ₹25L',
      2500000.01, NULL, 'sequential', true, true,
      'Capital procurement — director sign-off only.'
    )
    RETURNING id INTO v_policy_top;

    INSERT INTO approval_policy_step (
      tenant_id, policy_id, step_order, approver_via, approver_role, label
    ) VALUES (
      t_record.id, v_policy_top, 1, 'role', 'admin', 'Director approval'
    );

    RAISE NOTICE '[vendor-bill] seeded approval policies for tenant %', t_record.slug;
  END LOOP;
END $$;
