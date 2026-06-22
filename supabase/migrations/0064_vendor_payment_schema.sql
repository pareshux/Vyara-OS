-- ============================================================
-- 0064_vendor_payment_schema.sql — Vendor Payments + TDS (P3α)
--
-- Blueprint: FIN-021 (TDS) + FIN-022 (Payment scheduling).
--
-- Closes the procurement chain: PO → GRN → Vendor Bill → Payment.
-- A payment voucher can settle one or many bills (single-vendor); TDS
-- is computed at payment level (uniform section across all
-- allocations in v1 — per-allocation TDS in v2 if a customer asks).
--
-- Schema:
--   vendor_payment (header)
--     - payment_number auto VT-PAY-* / RA-PAY-*
--     - payment_mode enum (neft / rtgs / cheque / upi / cash /
--       bg_adjustment / on_account)
--     - gross_amount = sum(allocations.allocated_amount)
--     - tds_section enum (194Q / 194C / 194J / 194I / null)
--     - tds_pct + tds_amount
--     - net_amount = gross_amount − tds_amount (what actually
--       leaves the bank — vendor receives net; TDS deposited to govt)
--     - status: draft → posted → cancelled
--
--   vendor_payment_allocation (join)
--     - payment_id + bill_id + allocated_amount
--     - On payment post: bill.amount_paid += allocated_amount;
--       bill.amount_outstanding recomputed; bill.status flipped to
--       partly_paid or paid based on outstanding balance.
--
-- TDS sections (Indian Income Tax Act):
--   194Q — Goods purchase ≥ ₹50L cumulative from one vendor in FY.
--          0.1% (5% without PAN). Buyer's responsibility.
--   194C — Works contractor. 1% (individual) / 2% (firm).
--   194J — Professional / technical services. 10% (2% for certain
--          IT-enabled services).
--   194I — Rent on land/building (10%) / machinery (2%).
--
-- TDS engine in lib/actions/vendor-payments.ts auto-suggests:
--   vendor_type='supplier'   → 194Q @ 0.1%
--   vendor_type='contractor' → 194C @ 1%
--   vendor_type='service'    → 194J @ 10%
--   vendor_type='other'      → no auto-suggestion (user picks)
-- User can override per payment.
-- ============================================================

-- ─── 1. vendor_payment ────────────────────────────────────────

CREATE TABLE vendor_payment (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenant(id),
  payment_number           TEXT NOT NULL,
  vendor_id                UUID NOT NULL REFERENCES vendor(id),
  payment_date             DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_mode             TEXT NOT NULL
                             CHECK (payment_mode IN ('neft', 'rtgs', 'cheque', 'upi', 'cash', 'bg_adjustment', 'on_account')),
  bank_account_used        TEXT,                                            -- free text v1 (which of our banks paid); master in v2
  reference_no             TEXT,                                            -- NEFT UTR, cheque no, UPI ref
  -- Money
  gross_amount             NUMERIC(14,2) NOT NULL DEFAULT 0,                -- sum of allocations
  tds_section              TEXT CHECK (tds_section IS NULL OR tds_section IN ('194Q', '194C', '194J', '194I')),
  tds_pct                  NUMERIC(5,3) NOT NULL DEFAULT 0,                 -- e.g. 0.100 for 0.1%
  tds_amount               NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount               NUMERIC(14,2) NOT NULL DEFAULT 0,                -- gross − tds; what actually leaves the bank
  -- Status
  status                   TEXT NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'posted', 'cancelled')),
  posted_at                TIMESTAMPTZ,
  posted_by                UUID REFERENCES user_profile(id),
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

  UNIQUE (tenant_id, payment_number)
);

ALTER TABLE vendor_payment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON vendor_payment
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX vp_vendor_idx       ON vendor_payment (vendor_id) WHERE deleted_at IS NULL;
CREATE INDEX vp_status_idx       ON vendor_payment (tenant_id, status, payment_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX vp_tds_section_idx  ON vendor_payment (tenant_id, tds_section) WHERE tds_section IS NOT NULL AND deleted_at IS NULL;


-- Sequence + render_tenant_code-aware trigger
CREATE SEQUENCE vendor_payment_seq START 1;

CREATE OR REPLACE FUNCTION set_vendor_payment_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq  BIGINT;
  v_code TEXT;
BEGIN
  IF NEW.payment_number IS NOT NULL AND NEW.payment_number <> '' THEN
    RETURN NEW;
  END IF;
  v_seq := nextval('vendor_payment_seq');
  v_code := render_tenant_code(NEW.tenant_id, 'vendor_payment', v_seq);
  IF v_code IS NULL THEN
    v_code := 'VT-PAY-' || EXTRACT(YEAR FROM NEW.payment_date)::TEXT || '-' || LPAD(v_seq::TEXT, 4, '0');
  END IF;
  NEW.payment_number := v_code;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_vendor_payment_number_t
  BEFORE INSERT ON vendor_payment
  FOR EACH ROW EXECUTE FUNCTION set_vendor_payment_number();


-- ─── 2. vendor_payment_allocation ─────────────────────────────

CREATE TABLE vendor_payment_allocation (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenant(id),
  payment_id       UUID NOT NULL REFERENCES vendor_payment(id) ON DELETE CASCADE,
  bill_id          UUID NOT NULL REFERENCES vendor_bill(id),
  allocated_amount NUMERIC(14,2) NOT NULL CHECK (allocated_amount > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Same bill can't be allocated twice on the same payment
  UNIQUE (payment_id, bill_id)
);

ALTER TABLE vendor_payment_allocation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON vendor_payment_allocation
  FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX vpa_payment_idx ON vendor_payment_allocation (payment_id);
CREATE INDEX vpa_bill_idx    ON vendor_payment_allocation (bill_id);


-- ─── 3. EXTEND next_code_sequence RPC ─────────────────────────

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
    WHEN 'vendor_payment'     THEN 'vendor_payment_seq'
    ELSE NULL
  END;

  IF v_seq_name IS NULL THEN
    RAISE EXCEPTION 'next_code_sequence: unknown kind %', p_kind;
  END IF;

  RETURN nextval(v_seq_name::regclass);
END;
$$;


-- ─── 4. PER-TENANT CODE TEMPLATE SEED ─────────────────────────

UPDATE tenant
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{codes,vendor_payment}',
  '"VT-PAY-{yyyy}-{nnnn}"'::jsonb,
  true
)
WHERE slug = 'vyara-tiles';

UPDATE tenant
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{codes,vendor_payment}',
  '"RA-PAY-{yyyy}-{nnnn}"'::jsonb,
  true
)
WHERE slug = 'raj-avinsys';
