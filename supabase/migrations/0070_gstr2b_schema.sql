-- ============================================================
-- 0070_gstr2b_schema.sql — GSTR-2B reconciliation + IRN (P5)
--
-- Blueprint: FIN-023.
--
-- GSTR-2B is the auto-drafted ITC statement from GSTN, available
-- on the 14th of each month for the prior month. Buyers must
-- reconcile their purchase register against 2B to determine ITC
-- eligibility — any vendor bill NOT in 2B can't be claimed as ITC.
--
-- Manual-upload path v1: accountant uploads a CSV/JSON file
-- (downloaded from gst.gov.in or via an integrator) → we parse
-- rows into gstr_2b_entry → reconciliation read-model matches
-- against vendor_bill by (vendor_gstin + vendor_invoice_no +
-- invoice_date + total).
--
-- Portal-sync (P5γ) would auto-pull via the GSTN API; schema is
-- ready for that wire.
-- ============================================================

CREATE TABLE gstr_2b_entry (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenant(id),
  -- The period this entry belongs to (2B month)
  period                   TEXT NOT NULL,                                  -- 'YYYY-MM' format (e.g. '2026-04')
  -- Vendor identity (we match on these fields against vendor_bill)
  vendor_gstin             TEXT NOT NULL,
  vendor_name              TEXT,                                            -- from 2B (informational; we match on GSTIN)
  -- Invoice details (the legal source)
  vendor_invoice_no        TEXT NOT NULL,
  vendor_invoice_date      DATE NOT NULL,
  invoice_type             TEXT,                                            -- 'B2B' / 'CDNR' / 'CDNUR' etc.
  -- Tax breakdown per 2B
  taxable_value            NUMERIC(14,2) NOT NULL DEFAULT 0,
  igst_amount              NUMERIC(14,2) NOT NULL DEFAULT 0,
  cgst_amount              NUMERIC(14,2) NOT NULL DEFAULT 0,
  sgst_amount              NUMERIC(14,2) NOT NULL DEFAULT 0,
  cess_amount              NUMERIC(14,2) NOT NULL DEFAULT 0,
  total                    NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- ITC eligibility per 2B (the portal already flags this)
  itc_available            BOOLEAN NOT NULL DEFAULT true,
  itc_reversal_reason      TEXT,                                            -- when itc_available=false, why
  -- Reconciliation outcome — set by the matcher
  matched_bill_id          UUID REFERENCES vendor_bill(id),
  match_status             TEXT NOT NULL DEFAULT 'unmatched'
                             CHECK (match_status IN ('unmatched', 'matched', 'in_books_not_in_2b', 'in_2b_not_in_books', 'amount_mismatch')),
  match_notes              TEXT,
  -- Upload audit
  uploaded_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by              UUID REFERENCES user_profile(id),
  upload_batch_id          UUID,                                            -- groups entries from one CSV upload
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at               TIMESTAMPTZ,

  -- Uniqueness: one 2B entry per (period + vendor_gstin + vendor_invoice_no)
  UNIQUE (tenant_id, period, vendor_gstin, vendor_invoice_no)
);

ALTER TABLE gstr_2b_entry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON gstr_2b_entry
  FOR ALL
  USING (tenant_id = current_tenant_id() AND deleted_at IS NULL)
  WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX gstr_period_idx          ON gstr_2b_entry (tenant_id, period DESC) WHERE deleted_at IS NULL;
CREATE INDEX gstr_match_idx           ON gstr_2b_entry (tenant_id, match_status) WHERE deleted_at IS NULL;
CREATE INDEX gstr_vendor_gstin_idx    ON gstr_2b_entry (vendor_gstin);
CREATE INDEX gstr_matched_bill_idx    ON gstr_2b_entry (matched_bill_id) WHERE matched_bill_id IS NOT NULL;


-- ─── Extend vendor_bill with IRN + ITC capture ─────────────────

ALTER TABLE vendor_bill
  ADD COLUMN IF NOT EXISTS irn_no              TEXT,                        -- the e-invoice IRN
  ADD COLUMN IF NOT EXISTS irn_validated_at    TIMESTAMPTZ,                 -- manual flag v1; auto via NIC API in P5γ
  ADD COLUMN IF NOT EXISTS gstr_2b_status      TEXT DEFAULT 'pending'
    CHECK (gstr_2b_status IN ('pending', 'matched', 'mismatched', 'not_in_2b', 'reversed')),
  ADD COLUMN IF NOT EXISTS gstr_2b_period      TEXT,                        -- which 2B period this bill was matched in
  ADD COLUMN IF NOT EXISTS itc_eligible        BOOLEAN;                     -- derived: matched AND 2B itc_available

COMMENT ON COLUMN vendor_bill.irn_no IS
  'E-invoice IRN from the vendor''s invoice. v1 = manual entry; P5γ adds NIC API validation.';
COMMENT ON COLUMN vendor_bill.gstr_2b_status IS
  'GSTR-2B reconciliation outcome. Set by uploadGstr2bBatch action. ITC blocked when not matched.';
