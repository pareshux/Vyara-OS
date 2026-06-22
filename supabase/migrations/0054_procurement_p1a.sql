-- ============================================================
-- 0054_procurement_p1a.sql — Procurement module, Phase 1α
--
-- Blueprint: DEL-015, DEL-016, DEL-017, DEL-018, FIN-019 (schema seed).
--
-- Adds the operational backbone of procurement:
--   - vendor master KYC extensions (PAN, MSME status + Udyam,
--     bank account, default payment terms, GST state code)
--   - purchase_order + purchase_order_line tables with full
--     Indian GST line model (HSN, IGST vs CGST+SGST split,
--     payment + delivery + warranty + LD + retention terms)
--   - goods_receipt_note + goods_receipt_note_line tables
--     (GRN UI consumer arrives in Phase 1β; schema lives here
--     because the PO `qty_received` / `qty_rejected` columns
--     reference it conceptually)
--   - Sequences + safety-net auto-number triggers that read
--     tenant.settings.codes.{kind} via render_tenant_code (0051)
--   - Extends next_code_sequence() RPC whitelist
--   - RLS + indexes
--
-- DEFERRED to Phase 1β:
--   - GRN consumer wiring (server actions + UI)
--   - RTV (Return to Vendor) flow
--   - PO PDF generation + WhatsApp/email send
--   - stock_movement writes triggered by GRN posting
--     (re-uses existing related_entity_type/id polymorphic
--      FK; no schema change needed when 1β lands)
--
-- DEFERRED to Phase 2+:
--   - vendor_bill / vendor_bill_line (AP)
--   - 3-way match engine
--   - MSME 45-day compliance reporting
--   - TDS / GSTR-2B reconciliation
--
-- Architectural note: stock movements for a posted GRN will
-- write through `related_entity_type = 'goods_receipt_note'`
-- on the existing stock_movement table — no FK columns added.
-- This matches the polymorphic convention used by
-- dispatch_issue / sample_issue today.
-- ============================================================


-- ─── 1. VENDOR KYC EXTENSIONS ─────────────────────────────────

ALTER TABLE vendor
  ADD COLUMN IF NOT EXISTS pan                  TEXT,
  ADD COLUMN IF NOT EXISTS msme_status          TEXT,
  ADD COLUMN IF NOT EXISTS msme_udyam_no        TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_no      TEXT,
  ADD COLUMN IF NOT EXISTS bank_ifsc            TEXT,
  ADD COLUMN IF NOT EXISTS bank_name            TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms_days   INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS gst_state_code       TEXT;

-- msme_status is nullable; when set, must be one of the MSMED Act tiers.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendor_msme_status_check'
  ) THEN
    ALTER TABLE vendor
      ADD CONSTRAINT vendor_msme_status_check
        CHECK (msme_status IS NULL OR msme_status IN ('not_msme', 'micro', 'small', 'medium'));
  END IF;
END $$;

-- Backfill: derive vendor.gst_state_code from the first 2 chars of
-- gstin where present, so existing vendor records work with the
-- IGST/CGST+SGST routing immediately.
UPDATE vendor
SET gst_state_code = SUBSTRING(gstin FROM 1 FOR 2)
WHERE gstin IS NOT NULL AND gst_state_code IS NULL;

COMMENT ON COLUMN vendor.msme_status IS
  'MSMED Act 2006 status. Drives 45-day payment-rule compliance reporting (FIN-020) in Phase 2.';
COMMENT ON COLUMN vendor.gst_state_code IS
  '2-char GST state code derived from GSTIN[0:2]. Used to compute IGST vs CGST+SGST on PO lines.';


-- ─── 2. PURCHASE_ORDER ────────────────────────────────────────

CREATE TABLE purchase_order (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenant(id),
  po_number                   TEXT NOT NULL,
  vendor_id                   UUID NOT NULL REFERENCES vendor(id),
  project_id                  UUID REFERENCES project(id),
  ship_to_warehouse_id        UUID NOT NULL REFERENCES warehouse(id),
  po_date                     DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_at        DATE,
  currency                    TEXT NOT NULL DEFAULT 'INR',
  status                      TEXT NOT NULL DEFAULT 'draft'
                                CHECK (status IN (
                                  'draft',
                                  'pending_approval',
                                  'approved',
                                  'sent',
                                  'partly_received',
                                  'received',
                                  'cancelled',
                                  'closed'
                                )),
  -- Address snapshots: PDF rendering + audit need stable values even
  -- if master records change later. Same pattern as
  -- invoice_tax_pt_snapshot (Slice 2).
  vendor_address_snapshot     TEXT,
  bill_to_snapshot            TEXT,
  ship_to_snapshot            TEXT,
  -- Money rollups (computed by server action; trigger could enforce
  -- but the action is the source of truth so trust > defensive trigger).
  subtotal                    NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount             NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount                  NUMERIC(14,2) NOT NULL DEFAULT 0,
  total                       NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- Terms
  payment_terms_days          INTEGER NOT NULL DEFAULT 30,
  delivery_terms              TEXT,
  warranty_terms              TEXT,
  liquidated_damages_terms    TEXT,
  retention_pct               NUMERIC(5,2),
  other_terms                 TEXT,
  notes                       TEXT,
  -- Workflow
  approval_request_id         UUID REFERENCES approval_request(id),
  submitted_at                TIMESTAMPTZ,
  approved_at                 TIMESTAMPTZ,
  approved_by                 UUID REFERENCES user_profile(id),
  sent_at                     TIMESTAMPTZ,
  sent_by                     UUID REFERENCES user_profile(id),
  cancelled_at                TIMESTAMPTZ,
  cancelled_by                UUID REFERENCES user_profile(id),
  cancellation_reason         TEXT,
  -- Audit
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  UUID REFERENCES user_profile(id),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                  UUID REFERENCES user_profile(id),
  deleted_at                  TIMESTAMPTZ,

  UNIQUE (tenant_id, po_number)
);

ALTER TABLE purchase_order ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON purchase_order
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX po_tenant_status_date_idx
  ON purchase_order (tenant_id, status, po_date DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX po_vendor_idx
  ON purchase_order (vendor_id)
  WHERE deleted_at IS NULL;
CREATE INDEX po_project_idx
  ON purchase_order (project_id)
  WHERE project_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX po_approval_idx
  ON purchase_order (approval_request_id)
  WHERE approval_request_id IS NOT NULL;


-- Sequence + safety-net trigger (mirrors set_invoice_number et al
-- after 0051 made the triggers tenant-aware via render_tenant_code).

CREATE SEQUENCE purchase_order_seq START 1;

CREATE OR REPLACE FUNCTION set_purchase_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq  BIGINT;
  v_code TEXT;
BEGIN
  IF NEW.po_number IS NOT NULL AND NEW.po_number <> '' THEN
    RETURN NEW;
  END IF;
  v_seq := nextval('purchase_order_seq');
  v_code := render_tenant_code(NEW.tenant_id, 'purchase_order', v_seq);
  IF v_code IS NULL THEN
    v_code := 'VT-PO-' || EXTRACT(YEAR FROM NEW.po_date)::TEXT || '-' || LPAD(v_seq::TEXT, 4, '0');
  END IF;
  NEW.po_number := v_code;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_purchase_order_number_t
  BEFORE INSERT ON purchase_order
  FOR EACH ROW EXECUTE FUNCTION set_purchase_order_number();


-- ─── 3. PURCHASE_ORDER_LINE ───────────────────────────────────

CREATE TABLE purchase_order_line (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenant(id),
  po_id           UUID NOT NULL REFERENCES purchase_order(id) ON DELETE CASCADE,
  line_no         INTEGER NOT NULL,
  -- Nullable: PO lines can be ad-hoc (capital goods, services, freight)
  -- without a matching product master row. description is the source
  -- of truth.
  product_id      UUID REFERENCES product(id),
  description     TEXT NOT NULL,
  hsn_code        TEXT,                                -- HSN for goods, SAC for services
  unit            TEXT NOT NULL DEFAULT 'nos',
  quantity        NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  rate            NUMERIC(14,2) NOT NULL CHECK (rate >= 0),
  discount_pct    NUMERIC(5,2) NOT NULL DEFAULT 0
                    CHECK (discount_pct >= 0 AND discount_pct <= 100),
  taxable_value   NUMERIC(14,2) NOT NULL,
  -- Tax: server action determines is_interstate from vendor.gst_state_code
  -- vs warehouse.state, then splits gst_rate_pct into either igst or
  -- (cgst + sgst). Storing all three keeps the line self-describing
  -- for PDF + 3-way match in Phase 2.
  is_interstate   BOOLEAN NOT NULL DEFAULT false,
  gst_rate_pct    NUMERIC(5,2) NOT NULL DEFAULT 0
                    CHECK (gst_rate_pct IN (0, 0.1, 0.25, 1, 3, 5, 6, 12, 18, 28)),
  igst_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  cgst_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  sgst_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_total    NUMERIC(14,2) NOT NULL,
  -- GRN running totals (updated by Phase 1β GRN action; default 0 means
  -- "nothing received yet" — the PO list view shows progress chips
  -- driven by these).
  qty_received    NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  qty_rejected    NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qty_rejected >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (po_id, line_no)
);

ALTER TABLE purchase_order_line ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON purchase_order_line
  FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX po_line_po_idx ON purchase_order_line (po_id);
CREATE INDEX po_line_product_idx
  ON purchase_order_line (product_id)
  WHERE product_id IS NOT NULL;


-- ─── 4. GOODS_RECEIPT_NOTE ────────────────────────────────────

CREATE TABLE goods_receipt_note (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenant(id),
  grn_number           TEXT NOT NULL,
  po_id                UUID NOT NULL REFERENCES purchase_order(id),
  vendor_id            UUID NOT NULL REFERENCES vendor(id),   -- denormalised for query speed
  warehouse_id         UUID NOT NULL REFERENCES warehouse(id),
  grn_date             DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Inbound paperwork captured at the gate
  vendor_challan_no    TEXT,
  vendor_invoice_no    TEXT,
  vehicle_no           TEXT,
  transporter          TEXT,
  e_way_bill_no        TEXT,
  -- QC workflow (Phase 1β surfaces the UI; schema accepts the values now)
  qc_status            TEXT NOT NULL DEFAULT 'not_required'
                         CHECK (qc_status IN (
                           'not_required',
                           'pending',
                           'accepted',
                           'rejected',
                           'partial_accept'
                         )),
  qc_notes             TEXT,
  status               TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft', 'posted', 'cancelled')),
  notes                TEXT,
  posted_at            TIMESTAMPTZ,
  posted_by            UUID REFERENCES user_profile(id),
  cancelled_at         TIMESTAMPTZ,
  cancelled_by         UUID REFERENCES user_profile(id),
  cancellation_reason  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           UUID REFERENCES user_profile(id),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by           UUID REFERENCES user_profile(id),
  deleted_at           TIMESTAMPTZ,

  UNIQUE (tenant_id, grn_number)
);

ALTER TABLE goods_receipt_note ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON goods_receipt_note
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX grn_po_idx ON goods_receipt_note (po_id);
CREATE INDEX grn_vendor_idx ON goods_receipt_note (vendor_id);
CREATE INDEX grn_tenant_date_idx
  ON goods_receipt_note (tenant_id, grn_date DESC)
  WHERE deleted_at IS NULL;

CREATE SEQUENCE goods_receipt_note_seq START 1;

CREATE OR REPLACE FUNCTION set_goods_receipt_note_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq  BIGINT;
  v_code TEXT;
BEGIN
  IF NEW.grn_number IS NOT NULL AND NEW.grn_number <> '' THEN
    RETURN NEW;
  END IF;
  v_seq := nextval('goods_receipt_note_seq');
  v_code := render_tenant_code(NEW.tenant_id, 'goods_receipt_note', v_seq);
  IF v_code IS NULL THEN
    v_code := 'VT-GRN-' || EXTRACT(YEAR FROM NEW.grn_date)::TEXT || '-' || LPAD(v_seq::TEXT, 4, '0');
  END IF;
  NEW.grn_number := v_code;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_goods_receipt_note_number_t
  BEFORE INSERT ON goods_receipt_note
  FOR EACH ROW EXECUTE FUNCTION set_goods_receipt_note_number();


-- ─── 5. GOODS_RECEIPT_NOTE_LINE ───────────────────────────────

CREATE TABLE goods_receipt_note_line (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenant(id),
  grn_id              UUID NOT NULL REFERENCES goods_receipt_note(id) ON DELETE CASCADE,
  po_line_id          UUID NOT NULL REFERENCES purchase_order_line(id),
  product_id          UUID REFERENCES product(id),
  description         TEXT NOT NULL,
  unit                TEXT NOT NULL,
  qty_received        NUMERIC(14,3) NOT NULL CHECK (qty_received >= 0),
  qty_accepted        NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qty_accepted >= 0),
  qty_rejected        NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qty_rejected >= 0),
  rejection_reason    TEXT,
  batch_no            TEXT,
  expiry_date         DATE,
  remarks             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (qty_accepted + qty_rejected <= qty_received)
);

ALTER TABLE goods_receipt_note_line ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON goods_receipt_note_line
  FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX grn_line_grn_idx ON goods_receipt_note_line (grn_id);
CREATE INDEX grn_line_po_line_idx ON goods_receipt_note_line (po_line_id);


-- ─── 6. EXTEND next_code_sequence RPC ─────────────────────────

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
    ELSE NULL
  END;

  IF v_seq_name IS NULL THEN
    RAISE EXCEPTION 'next_code_sequence: unknown kind %', p_kind;
  END IF;

  RETURN nextval(v_seq_name::regclass);
END;
$$;

COMMENT ON FUNCTION next_code_sequence(TEXT) IS
  'Allocates the next sequence value for a known entity kind. '
  'Whitelisted kinds: quotation, sales_order, invoice, dispatch, '
  'dealer, lead, stock_transfer, purchase_order, goods_receipt_note. '
  'Used by lib/codes/next-code.ts in tandem with tenant.settings.codes.';
