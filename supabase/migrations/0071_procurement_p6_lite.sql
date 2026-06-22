-- Procurement P6 lite — vendor scorecard view + blanket PO + imports + job work
-- Capability: Delivery (procurement) + Relationship (vendor performance)
-- Tracks: DEL-021 (job work + ITC-04), DEL-022 (blanket PO), DEL-023 (imports)
--
-- This migration ships the final phase of the procurement module:
--   1. Vendor scorecard view (read-model, no new data — pure aggregate over
--      existing PO + GRN + vendor_bill + vendor_payment rows)
--   2. Blanket PO + release order tables (annual rate-contracts common in
--      EPC + manufacturing for high-velocity items like steel/cement/cables)
--   3. Imports-lite columns on purchase_order (capture BoE + customs duty
--      + CIF FX rate; full LC/SBLC integration deferred)
--   4. Job work challan + ITC-04 quarterly return support
--
-- Per Constitution Principle #5: own the operational layer; integrate the rest.
-- Job-work ITC-04 export deliberately ships as CSV rather than direct GSTN
-- portal integration — same posture as MSME-1 + 26Q + GSTR-2B (manual upload).

-- ─── 1. VENDOR SCORECARD VIEW ─────────────────────────────────
-- One row per vendor + FY combination. Pure aggregate; no writes.
-- security_invoker=true per the 0047 cross-tenant fix.

CREATE OR REPLACE VIEW vendor_scorecard_v WITH (security_invoker = true) AS
WITH po_stats AS (
  SELECT
    po.tenant_id,
    po.vendor_id,
    -- Indian FY: Apr-Mar. po_date < Apr 1 belongs to prior FY.
    CASE
      WHEN EXTRACT(MONTH FROM po.po_date) >= 4
        THEN EXTRACT(YEAR FROM po.po_date)::INTEGER
      ELSE (EXTRACT(YEAR FROM po.po_date) - 1)::INTEGER
    END AS fy_start_year,
    COUNT(*) AS po_count,
    SUM(po.total) AS po_value,
    COUNT(*) FILTER (WHERE po.status IN ('received', 'closed')) AS po_fulfilled,
    COUNT(*) FILTER (WHERE po.status = 'cancelled') AS po_cancelled
  FROM purchase_order po
  WHERE po.deleted_at IS NULL
    AND po.status NOT IN ('draft', 'pending_approval')
  GROUP BY po.tenant_id, po.vendor_id, fy_start_year
),
grn_stats AS (
  -- On-time + qty acceptance derived from GRN against PO expected_delivery_at
  SELECT
    grn.tenant_id,
    grn.vendor_id,
    CASE
      WHEN EXTRACT(MONTH FROM grn.grn_date) >= 4
        THEN EXTRACT(YEAR FROM grn.grn_date)::INTEGER
      ELSE (EXTRACT(YEAR FROM grn.grn_date) - 1)::INTEGER
    END AS fy_start_year,
    COUNT(DISTINCT grn.id) AS grn_count,
    COUNT(DISTINCT grn.id) FILTER (
      WHERE po.expected_delivery_at IS NOT NULL
        AND grn.grn_date <= po.expected_delivery_at
    ) AS grn_on_time,
    COUNT(DISTINCT grn.id) FILTER (
      WHERE po.expected_delivery_at IS NOT NULL
    ) AS grn_with_eta,
    SUM(grnl.qty_received) AS qty_received_total,
    SUM(grnl.qty_accepted) AS qty_accepted_total,
    SUM(grnl.qty_rejected) AS qty_rejected_total
  FROM goods_receipt_note grn
  JOIN goods_receipt_note_line grnl ON grnl.grn_id = grn.id
  LEFT JOIN purchase_order po ON po.id = grn.po_id
  WHERE grn.deleted_at IS NULL
    AND grn.status = 'posted'
  GROUP BY grn.tenant_id, grn.vendor_id, fy_start_year
),
bill_stats AS (
  SELECT
    vb.tenant_id,
    vb.vendor_id,
    CASE
      WHEN EXTRACT(MONTH FROM vb.bill_date) >= 4
        THEN EXTRACT(YEAR FROM vb.bill_date)::INTEGER
      ELSE (EXTRACT(YEAR FROM vb.bill_date) - 1)::INTEGER
    END AS fy_start_year,
    COUNT(*) AS bill_count,
    SUM(vb.total) AS bill_value,
    COUNT(*) FILTER (WHERE vb.match_status = 'mismatched') AS mismatched_count,
    COUNT(*) FILTER (WHERE vb.status IN ('approved','partly_paid','paid')) AS approved_bill_count,
    SUM(vb.total) FILTER (WHERE vb.status IN ('approved','partly_paid','paid')) AS approved_bill_value,
    SUM(vb.amount_outstanding) AS outstanding_total
  FROM vendor_bill vb
  WHERE vb.deleted_at IS NULL
  GROUP BY vb.tenant_id, vb.vendor_id, fy_start_year
)
SELECT
  v.id AS vendor_id,
  v.tenant_id,
  v.name AS vendor_name,
  v.msme_status,
  v.gstin,
  v.payment_terms_days,
  COALESCE(ps.fy_start_year, gs.fy_start_year, bs.fy_start_year) AS fy_start_year,
  COALESCE(ps.po_count, 0) AS po_count,
  COALESCE(ps.po_value, 0) AS po_value,
  COALESCE(ps.po_fulfilled, 0) AS po_fulfilled,
  COALESCE(ps.po_cancelled, 0) AS po_cancelled,
  COALESCE(gs.grn_count, 0) AS grn_count,
  COALESCE(gs.grn_on_time, 0) AS grn_on_time,
  COALESCE(gs.grn_with_eta, 0) AS grn_with_eta,
  CASE
    WHEN COALESCE(gs.grn_with_eta, 0) = 0 THEN NULL
    ELSE ROUND((gs.grn_on_time::NUMERIC / gs.grn_with_eta::NUMERIC) * 100, 1)
  END AS on_time_pct,
  COALESCE(gs.qty_received_total, 0) AS qty_received_total,
  COALESCE(gs.qty_accepted_total, 0) AS qty_accepted_total,
  COALESCE(gs.qty_rejected_total, 0) AS qty_rejected_total,
  CASE
    WHEN COALESCE(gs.qty_received_total, 0) = 0 THEN NULL
    ELSE ROUND((gs.qty_accepted_total::NUMERIC / gs.qty_received_total::NUMERIC) * 100, 1)
  END AS acceptance_pct,
  COALESCE(bs.bill_count, 0) AS bill_count,
  COALESCE(bs.bill_value, 0) AS bill_value,
  COALESCE(bs.approved_bill_count, 0) AS approved_bill_count,
  COALESCE(bs.approved_bill_value, 0) AS approved_bill_value,
  COALESCE(bs.mismatched_count, 0) AS mismatched_count,
  COALESCE(bs.outstanding_total, 0) AS outstanding_total
FROM vendor v
LEFT JOIN po_stats ps ON ps.tenant_id = v.tenant_id AND ps.vendor_id = v.id
LEFT JOIN grn_stats gs ON gs.tenant_id = v.tenant_id AND gs.vendor_id = v.id
  AND (ps.fy_start_year IS NULL OR gs.fy_start_year = ps.fy_start_year)
LEFT JOIN bill_stats bs ON bs.tenant_id = v.tenant_id AND bs.vendor_id = v.id
  AND (ps.fy_start_year IS NULL OR bs.fy_start_year = ps.fy_start_year)
WHERE v.deleted_at IS NULL
  AND (ps.po_count > 0 OR gs.grn_count > 0 OR bs.bill_count > 0);

COMMENT ON VIEW vendor_scorecard_v IS
  'P6 lite vendor performance read-model. One row per vendor per FY where any activity exists. on_time_pct + acceptance_pct null when denominator zero (visual signal that the metric is not yet measurable rather than misleading 100%).';

-- ─── 2. BLANKET PURCHASE ORDER ────────────────────────────────
-- Annual rate-contract: "buy N tons of cement at ₹X per ton through 2026-27,
-- draw down as needed via release orders." Common in EPC for cement/steel/
-- cables. Each release becomes a regular PO that references the blanket;
-- the blanket tracks cumulative drawdown vs the cap.

CREATE TABLE blanket_po (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenant(id),
  bpo_number                  TEXT NOT NULL,
  vendor_id                   UUID NOT NULL REFERENCES vendor(id),
  product_id                  UUID REFERENCES product(id),    -- optional; description fallback
  description                 TEXT NOT NULL,
  hsn_code                    TEXT,
  unit                        TEXT NOT NULL DEFAULT 'nos',
  -- Capacity + rate (annual cap or quantity cap)
  qty_cap                     NUMERIC(14,3) NOT NULL CHECK (qty_cap > 0),
  rate                        NUMERIC(14,2) NOT NULL CHECK (rate >= 0),
  value_cap                   NUMERIC(14,2) GENERATED ALWAYS AS (qty_cap * rate) STORED,
  -- Period
  valid_from                  DATE NOT NULL,
  valid_to                    DATE NOT NULL CHECK (valid_to >= valid_from),
  status                      TEXT NOT NULL DEFAULT 'active'
                                CHECK (status IN ('draft', 'active', 'exhausted', 'expired', 'cancelled')),
  -- Drawdown tracker (updated by release-order creation)
  qty_released                NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qty_released >= 0),
  -- Terms
  payment_terms_days          INTEGER,
  delivery_terms              TEXT,
  notes                       TEXT,
  -- Audit
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  UUID REFERENCES user_profile(id),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at                TIMESTAMPTZ,
  cancellation_reason         TEXT,
  deleted_at                  TIMESTAMPTZ,

  UNIQUE (tenant_id, bpo_number)
);

ALTER TABLE blanket_po ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON blanket_po
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX bpo_tenant_status_idx ON blanket_po (tenant_id, status, valid_to);
CREATE INDEX bpo_vendor_idx ON blanket_po (vendor_id);

CREATE SEQUENCE blanket_po_seq START 1;

CREATE OR REPLACE FUNCTION set_blanket_po_number()
RETURNS TRIGGER AS $$
DECLARE
  v_seq BIGINT;
  v_code TEXT;
BEGIN
  IF NEW.bpo_number IS NOT NULL AND NEW.bpo_number <> '' THEN
    RETURN NEW;
  END IF;
  v_seq := nextval('blanket_po_seq');
  v_code := render_tenant_code(NEW.tenant_id, 'blanket_po', v_seq);
  IF v_code IS NULL OR v_code = '' THEN
    v_code := 'VT-BPO-' || EXTRACT(YEAR FROM now()) || '-' || LPAD(v_seq::TEXT, 4, '0');
  END IF;
  NEW.bpo_number := v_code;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_blanket_po_number_t
  BEFORE INSERT ON blanket_po
  FOR EACH ROW EXECUTE FUNCTION set_blanket_po_number();

-- ─── 3. PURCHASE_ORDER · LINK TO BLANKET + IMPORTS COLUMNS ────

ALTER TABLE purchase_order
  ADD COLUMN IF NOT EXISTS blanket_po_id   UUID REFERENCES blanket_po(id),
  -- Imports
  ADD COLUMN IF NOT EXISTS bill_of_entry_no   TEXT,
  ADD COLUMN IF NOT EXISTS bill_of_entry_date DATE,
  ADD COLUMN IF NOT EXISTS customs_duty       NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS cif_inr_rate       NUMERIC(14,4),  -- INR per unit foreign currency
  ADD COLUMN IF NOT EXISTS port_of_loading    TEXT,
  ADD COLUMN IF NOT EXISTS port_of_discharge  TEXT;

CREATE INDEX IF NOT EXISTS po_blanket_idx
  ON purchase_order (blanket_po_id)
  WHERE blanket_po_id IS NOT NULL;

-- ─── 4. JOB WORK CHALLAN ──────────────────────────────────────
-- Send materials to a job worker for processing (cutting/coating/assembly);
-- materials remain on our books. Quarterly ITC-04 return reports all job-work
-- challans + receipts to GSTN.

CREATE TABLE job_work_challan (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID NOT NULL REFERENCES tenant(id),
  challan_number            TEXT NOT NULL,
  challan_date              DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Job worker (vendor with relationship_type='vendor' usually, but kept open)
  job_worker_id             UUID NOT NULL REFERENCES vendor(id),
  job_worker_gstin          TEXT,        -- snapshot at challan time
  -- What was sent
  description               TEXT NOT NULL,
  hsn_code                  TEXT,
  unit                      TEXT NOT NULL DEFAULT 'nos',
  qty_sent                  NUMERIC(14,3) NOT NULL CHECK (qty_sent > 0),
  rate                      NUMERIC(14,2),       -- nominal rate for ITC-04 valuation
  -- Process nature: 'machining', 'coating', 'cutting', 'assembly', etc.
  process_nature            TEXT NOT NULL,
  expected_return_date      DATE,
  -- Receipt tracker
  qty_received_back         NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qty_received_back >= 0),
  qty_scrap                 NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qty_scrap >= 0),
  received_back_at          DATE,
  -- Status
  status                    TEXT NOT NULL DEFAULT 'sent'
                              CHECK (status IN ('sent', 'partly_received', 'fully_received', 'cancelled')),
  notes                     TEXT,
  -- Audit
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                UUID REFERENCES user_profile(id),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at                TIMESTAMPTZ,

  UNIQUE (tenant_id, challan_number)
);

ALTER TABLE job_work_challan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON job_work_challan
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX jwc_tenant_status_idx
  ON job_work_challan (tenant_id, status, challan_date DESC);
CREATE INDEX jwc_jobworker_idx ON job_work_challan (job_worker_id);

CREATE SEQUENCE job_work_challan_seq START 1;

CREATE OR REPLACE FUNCTION set_job_work_challan_number()
RETURNS TRIGGER AS $$
DECLARE
  v_seq BIGINT;
  v_code TEXT;
BEGIN
  IF NEW.challan_number IS NOT NULL AND NEW.challan_number <> '' THEN
    RETURN NEW;
  END IF;
  v_seq := nextval('job_work_challan_seq');
  v_code := render_tenant_code(NEW.tenant_id, 'job_work_challan', v_seq);
  IF v_code IS NULL OR v_code = '' THEN
    v_code := 'VT-JWC-' || EXTRACT(YEAR FROM now()) || '-' || LPAD(v_seq::TEXT, 4, '0');
  END IF;
  NEW.challan_number := v_code;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_job_work_challan_number_t
  BEFORE INSERT ON job_work_challan
  FOR EACH ROW EXECUTE FUNCTION set_job_work_challan_number();

-- ─── 5. NEXT_CODE_SEQUENCE EXTENSION ──────────────────────────
-- Whitelist the two new code kinds for the helper RPC (PLAT-010).

CREATE OR REPLACE FUNCTION next_code_sequence(p_kind TEXT)
RETURNS BIGINT AS $$
DECLARE
  v_seq_name TEXT;
BEGIN
  v_seq_name := CASE p_kind
    WHEN 'quotation'           THEN 'quotation_seq'
    WHEN 'sales_order'         THEN 'sales_order_seq'
    WHEN 'invoice'             THEN 'invoice_seq'
    WHEN 'dispatch'            THEN 'dispatch_seq'
    WHEN 'dealer'              THEN 'dealer_seq'
    WHEN 'lead'                THEN 'lead_seq'
    WHEN 'stock_transfer'      THEN 'stock_transfer_seq'
    WHEN 'purchase_order'      THEN 'purchase_order_seq'
    WHEN 'goods_receipt_note'  THEN 'goods_receipt_note_seq'
    WHEN 'return_to_vendor'    THEN 'return_to_vendor_seq'
    WHEN 'vendor_bill'         THEN 'vendor_bill_seq'
    WHEN 'vendor_payment'      THEN 'vendor_payment_seq'
    WHEN 'purchase_requisition' THEN 'purchase_requisition_seq'
    WHEN 'rfq'                 THEN 'rfq_seq'
    WHEN 'blanket_po'          THEN 'blanket_po_seq'
    WHEN 'job_work_challan'    THEN 'job_work_challan_seq'
    ELSE NULL
  END;

  IF v_seq_name IS NULL THEN
    RAISE EXCEPTION 'Unknown code kind: %. Known kinds: quotation, sales_order, invoice, dispatch, dealer, lead, stock_transfer, purchase_order, goods_receipt_note, return_to_vendor, vendor_bill, vendor_payment, purchase_requisition, rfq, blanket_po, job_work_challan.', p_kind;
  END IF;

  RETURN nextval(v_seq_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION next_code_sequence(TEXT) TO authenticated;

-- ─── 6. PER-TENANT CODE TEMPLATES ─────────────────────────────
-- Add blanket_po + job_work_challan templates to both tenants' settings.

UPDATE tenant
SET settings = jsonb_set(
  jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{codes,blanket_po}',
    '"VT-BPO-{yyyy}-{nnnn}"'::jsonb
  ),
  '{codes,job_work_challan}',
  '"VT-JWC-{yyyy}-{nnnn}"'::jsonb
)
WHERE slug = 'vyara-tiles';

UPDATE tenant
SET settings = jsonb_set(
  jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{codes,blanket_po}',
    '"RA-BPO-{yyyy}-{nnnn}"'::jsonb
  ),
  '{codes,job_work_challan}',
  '"RA-JWC-{yyyy}-{nnnn}"'::jsonb
)
WHERE slug = 'raj-avinsys';
