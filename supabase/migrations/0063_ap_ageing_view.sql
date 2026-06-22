-- ============================================================
-- 0063_ap_ageing_view.sql — AP ageing view + sample bills (P2β)
--
-- Blueprint: DEL-019 (AP ageing) + FIN-020 (MSME 45-day compliance).
--
-- Two parts:
--   1. vendor_bill_ageing_v — mirrors invoice_ageing_v (0006) with
--      security_invoker=true (per the 0047 cross-tenant fix).
--      Adds msme_flag derived from days_since_receipt vs 45-day rule.
--   2. Sample backdated bills to populate the buckets meaningfully.
--      Direct bills (po_id NULL) — linking to existing POs would
--      require also backdating receipts. Match status 'under_review'
--      (every line unlinked) is correct for direct billing.
--
-- MSME 45-day rule (MSMED Act 2006):
--   - Payment to MSME vendors must be made within 45 days of supply.
--   - 'breach'   = days_since_receipt > 45 (legally past due)
--   - 'warning'  = days_since_receipt >= 30 (approaching the line)
--   - 'ok'       = days_since_receipt < 30
--   - 'not_applicable' = vendor isn't MSME (or msme_status='not_msme')
-- ============================================================

CREATE OR REPLACE VIEW vendor_bill_ageing_v AS
SELECT
  vb.id,
  vb.tenant_id,
  vb.bill_number,
  vb.vendor_invoice_no,
  vb.vendor_invoice_date,
  vb.vendor_id,
  v.name                                                                AS vendor_name,
  v.gstin                                                               AS vendor_gstin,
  v.msme_status                                                         AS vendor_msme_status,
  v.payment_terms_days                                                  AS vendor_payment_terms_days,
  vb.po_id,
  vb.bill_date,
  vb.received_at,
  vb.due_date,
  vb.total,
  vb.amount_paid,
  vb.amount_outstanding,
  vb.status,
  vb.match_status,
  CASE
    WHEN vb.due_date IS NULL THEN 0
    ELSE GREATEST(0, CURRENT_DATE - vb.due_date)
  END::INTEGER                                                          AS days_overdue,
  CASE
    WHEN vb.received_at IS NULL THEN NULL
    ELSE (CURRENT_DATE - vb.received_at)::INTEGER
  END                                                                   AS days_since_receipt,
  -- MSME 45-day compliance flag
  CASE
    WHEN v.msme_status IS NULL OR v.msme_status = 'not_msme' THEN 'not_applicable'
    WHEN vb.received_at IS NULL                              THEN 'unknown'
    WHEN CURRENT_DATE - vb.received_at > 45                  THEN 'breach'
    WHEN CURRENT_DATE - vb.received_at >= 30                 THEN 'warning'
    ELSE 'ok'
  END                                                                   AS msme_flag,
  -- 5-bucket ageing (matches /collections + /owner Slice 2 buckets)
  CASE
    WHEN vb.due_date IS NULL OR CURRENT_DATE <= vb.due_date            THEN 'current'
    WHEN CURRENT_DATE - vb.due_date BETWEEN 1  AND 30                  THEN '1-30'
    WHEN CURRENT_DATE - vb.due_date BETWEEN 31 AND 60                  THEN '31-60'
    WHEN CURRENT_DATE - vb.due_date BETWEEN 61 AND 90                  THEN '61-90'
    ELSE                                                                    '90+'
  END                                                                   AS ageing_bucket
FROM vendor_bill vb
JOIN vendor v ON v.id = vb.vendor_id
WHERE vb.status IN ('approved', 'partly_paid')
  AND vb.amount_outstanding > 0
  AND vb.deleted_at IS NULL;

-- Critical: enforce RLS as the calling user, not as the view owner.
-- Same bug class as 0047 (invoice_ageing_v + dealer_ledger_v cross-
-- tenant leak). PG 15+ feature.
ALTER VIEW vendor_bill_ageing_v SET (security_invoker = true);

GRANT SELECT ON vendor_bill_ageing_v TO authenticated;


-- ─── Sample backdated bills ────────────────────────────────────
-- These exercise every ageing bucket + MSME compliance state. They
-- intentionally bypass the 3-way match (po_id NULL, match='under_review')
-- because backdating both the bill AND a corresponding GRN + PO line
-- would muddy the existing P1α/P1β/P1γ demo paths. AP ageing cares
-- about outstanding ₹ + days + MSME, not match status.
--
-- Vendor invoice numbers are unique per (tenant_id, vendor_id, vendor_invoice_no)
-- per the constraint in 0061. We use distinct fresh numbers.
-- ============================================================

DO $$
DECLARE
  v_vyara_tenant     UUID;
  v_raj_tenant       UUID;
  v_vyara_admin      UUID;
  v_raj_admin        UUID;
  v_vendor_id        UUID;
  -- Fixed bill UUIDs for idempotency
  v_vt_msme_breach   UUID := 'f1000000-0000-0000-0002-000000000001'::uuid;
  v_vt_overdue       UUID := 'f1000000-0000-0000-0002-000000000002'::uuid;
  v_ra_msme_warning  UUID := 'f1000000-0000-0000-0002-000000000101'::uuid;
  v_ra_overdue_60    UUID := 'f1000000-0000-0000-0002-000000000102'::uuid;
  v_ra_overdue_big   UUID := 'f1000000-0000-0000-0002-000000000103'::uuid;
BEGIN
  SELECT id INTO v_vyara_tenant FROM tenant WHERE slug = 'vyara-tiles';
  SELECT id INTO v_raj_tenant   FROM tenant WHERE slug = 'raj-avinsys';
  SELECT id INTO v_vyara_admin  FROM user_profile WHERE tenant_id = v_vyara_tenant AND role = 'admin' AND is_active = true ORDER BY created_at LIMIT 1;
  SELECT id INTO v_raj_admin    FROM user_profile WHERE tenant_id = v_raj_tenant   AND role = 'admin' AND is_active = true ORDER BY created_at LIMIT 1;

  -- ─── Vyara · MSME BREACH (Surat Pigments — MSME small, 30d) ──
  -- Received 50d ago, due 20d ago → 20d overdue, MSME breach (>45d)
  IF NOT EXISTS (SELECT 1 FROM vendor_bill WHERE id = v_vt_msme_breach) THEN
    SELECT id INTO v_vendor_id FROM vendor WHERE tenant_id = v_vyara_tenant AND code = 'V-PGM-01';
    INSERT INTO vendor_bill (
      id, tenant_id, vendor_id, vendor_invoice_no, vendor_invoice_date,
      bill_date, received_at, due_date, currency,
      status, match_status, match_run_at, match_notes,
      subtotal, discount_amount, tax_amount, total,
      amount_paid, amount_outstanding,
      vendor_address_snapshot, bill_to_snapshot,
      submitted_at, approved_at, approved_by, notes,
      created_by, updated_by
    ) VALUES (
      v_vt_msme_breach, v_vyara_tenant, v_vendor_id,
      'SP/26-27/M-118', CURRENT_DATE - 50,
      CURRENT_DATE - 49, CURRENT_DATE - 50, CURRENT_DATE - 20,
      'INR',
      'approved', 'under_review', NOW() - INTERVAL '49 days',
      'Direct bill — no PO linkage (legacy procurement). 3-way match lines unlinked.',
      85000, 0, 15300, 100300,
      0, 100300,
      'Surat Pigments Pvt Ltd · Sachin GIDC Phase II, Surat · GSTIN 24AABCS5678D1Z9',
      'Vyara Tiles Limited · Vyara, Gujarat · GSTIN 24AABCV1234F1Z5',
      NOW() - INTERVAL '49 days', NOW() - INTERVAL '49 days', v_vyara_admin,
      'Legacy pigment top-up booked direct (pre-PO-workflow era). MSMED 45-day window already breached — pay immediately.',
      v_vyara_admin, v_vyara_admin
    );
    INSERT INTO vendor_bill_line (
      tenant_id, bill_id, line_no, description, hsn_code, unit, quantity, rate,
      discount_pct, taxable_value, is_interstate, gst_rate_pct,
      igst_amount, cgst_amount, sgst_amount, amount_total,
      match_status, match_notes
    ) VALUES (
      v_vyara_tenant, v_vt_msme_breach, 1,
      'Iron Oxide Red — Q2 top-up (legacy)', '3204', 'kgs', 100, 850,
      0, 85000, false, 18, 0, 7650, 7650, 100300,
      'unlinked', 'Direct bill — no PO line.'
    );
  END IF;

  -- ─── Vyara · 1-30 overdue, non-MSME (Ambuja Cement — 45d) ────
  -- Received 70d ago, due 25d ago → 25d overdue. Not MSME.
  IF NOT EXISTS (SELECT 1 FROM vendor_bill WHERE id = v_vt_overdue) THEN
    SELECT id INTO v_vendor_id FROM vendor WHERE tenant_id = v_vyara_tenant AND code = 'V-CEM-01';
    INSERT INTO vendor_bill (
      id, tenant_id, vendor_id, vendor_invoice_no, vendor_invoice_date,
      bill_date, received_at, due_date, currency,
      status, match_status, match_run_at,
      subtotal, discount_amount, tax_amount, total,
      amount_paid, amount_outstanding,
      vendor_address_snapshot, bill_to_snapshot,
      submitted_at, approved_at, approved_by,
      created_by, updated_by
    ) VALUES (
      v_vt_overdue, v_vyara_tenant, v_vendor_id,
      'AC/26-27/04/3389', CURRENT_DATE - 70,
      CURRENT_DATE - 69, CURRENT_DATE - 70, CURRENT_DATE - 25,
      'INR',
      'approved', 'under_review', NOW() - INTERVAL '69 days',
      210000, 0, 37800, 247800,
      0, 247800,
      'Ambuja Cement (Surat depot) · Hazira Road, Surat · GSTIN 24AAACA1234B1Z5',
      'Vyara Tiles Limited · Vyara, Gujarat · GSTIN 24AABCV1234F1Z5',
      NOW() - INTERVAL '69 days', NOW() - INTERVAL '69 days', v_vyara_admin,
      v_vyara_admin, v_vyara_admin
    );
    INSERT INTO vendor_bill_line (
      tenant_id, bill_id, line_no, description, hsn_code, unit, quantity, rate,
      discount_pct, taxable_value, is_interstate, gst_rate_pct,
      igst_amount, cgst_amount, sgst_amount, amount_total,
      match_status, match_notes
    ) VALUES (
      v_vyara_tenant, v_vt_overdue, 1,
      'OPC 53 cement — April bulk order (legacy)', '2523', 'bags', 600, 350,
      0, 210000, false, 18, 0, 18900, 18900, 247800,
      'unlinked', 'Direct bill — no PO line.'
    );
  END IF;

  -- ─── Raj · MSME WARNING (Surya Copper — MSME small, 30d) ─────
  -- Received 35d ago, due 5d ago → 5d overdue, MSME warning (≥30d, <45d)
  IF NOT EXISTS (SELECT 1 FROM vendor_bill WHERE id = v_ra_msme_warning) THEN
    SELECT id INTO v_vendor_id FROM vendor WHERE tenant_id = v_raj_tenant AND code = 'V-COP-01';
    INSERT INTO vendor_bill (
      id, tenant_id, vendor_id, vendor_invoice_no, vendor_invoice_date,
      bill_date, received_at, due_date, currency,
      status, match_status, match_run_at,
      subtotal, discount_amount, tax_amount, total,
      amount_paid, amount_outstanding,
      vendor_address_snapshot, bill_to_snapshot,
      submitted_at, approved_at, approved_by, notes,
      created_by, updated_by
    ) VALUES (
      v_ra_msme_warning, v_raj_tenant, v_vendor_id,
      'SCI/2026/0233', CURRENT_DATE - 35,
      CURRENT_DATE - 34, CURRENT_DATE - 35, CURRENT_DATE - 5,
      'INR',
      'approved', 'under_review', NOW() - INTERVAL '34 days',
      55000, 0, 9900, 64900,
      0, 64900,
      'Surya Copper Industries · GIDC Vapi · GSTIN 24AAACK9876H1Z3',
      'Raj Avinsys Pvt Ltd · Vapi, Gujarat · GSTIN 24AABCR9999X1Z8',
      NOW() - INTERVAL '34 days', NOW() - INTERVAL '34 days', v_raj_admin,
      'Bus bars for early Adani panel order. MSME vendor — 10 days to 45-day breach.',
      v_raj_admin, v_raj_admin
    );
    INSERT INTO vendor_bill_line (
      tenant_id, bill_id, line_no, description, hsn_code, unit, quantity, rate,
      discount_pct, taxable_value, is_interstate, gst_rate_pct,
      igst_amount, cgst_amount, sgst_amount, amount_total,
      match_status, match_notes
    ) VALUES (
      v_raj_tenant, v_ra_msme_warning, 1,
      'Copper bus bar 20 × 5 mm tinned', '7407', 'mtr', 50, 1100,
      0, 55000, false, 18, 0, 4950, 4950, 64900,
      'unlinked', 'Direct bill — no PO line.'
    );
  END IF;

  -- ─── Raj · 31-60 overdue (Schneider Electric — non-MSME, 45d) ─
  -- Received 100d ago, due 55d ago → 55d overdue (31-60 bucket).
  IF NOT EXISTS (SELECT 1 FROM vendor_bill WHERE id = v_ra_overdue_60) THEN
    SELECT id INTO v_vendor_id FROM vendor WHERE tenant_id = v_raj_tenant AND code = 'V-SCH-01';
    INSERT INTO vendor_bill (
      id, tenant_id, vendor_id, vendor_invoice_no, vendor_invoice_date,
      bill_date, received_at, due_date, currency,
      status, match_status, match_run_at,
      subtotal, discount_amount, tax_amount, total,
      amount_paid, amount_outstanding,
      vendor_address_snapshot, bill_to_snapshot,
      submitted_at, approved_at, approved_by, notes,
      created_by, updated_by
    ) VALUES (
      v_ra_overdue_60, v_raj_tenant, v_vendor_id,
      'SEIPL/26/Q1/4477', CURRENT_DATE - 100,
      CURRENT_DATE - 99, CURRENT_DATE - 100, CURRENT_DATE - 55,
      'INR',
      'approved', 'under_review', NOW() - INTERVAL '99 days',
      355000, 0, 63900, 418900,
      0, 418900,
      'Schneider Electric India Pvt Ltd · Bengaluru · GSTIN 29AAACS1111E1Z7',
      'Raj Avinsys Pvt Ltd · Vapi, Gujarat · GSTIN 24AABCR9999X1Z8',
      NOW() - INTERVAL '99 days', NOW() - INTERVAL '99 days', v_raj_admin,
      'Q1 MCCB + contactor batch for L&T panel work. Vendor following up.',
      v_raj_admin, v_raj_admin
    );
    INSERT INTO vendor_bill_line (
      tenant_id, bill_id, line_no, description, hsn_code, unit, quantity, rate,
      discount_pct, taxable_value, is_interstate, gst_rate_pct,
      igst_amount, cgst_amount, sgst_amount, amount_total,
      match_status, match_notes
    ) VALUES (
      v_raj_tenant, v_ra_overdue_60, 1,
      'Schneider MCCB + Contactor batch (Q1 legacy)', '8536', 'lot', 1, 355000,
      0, 355000, true, 18, 63900, 0, 0, 418900,
      'unlinked', 'Direct bill — no PO line.'
    );
  END IF;

  -- ─── Raj · 60+ overdue, large (Crompton Greaves — non-MSME, 90d) ──
  -- Received 150d ago, due 60d ago → 60d overdue (just at the 60-90
  -- boundary; CURRENT_DATE - 60 = exactly 60d, falls in 31-60 bucket
  -- per BETWEEN logic, so use 65d earlier for 60+ guarantee).
  -- Big amount (~₹15L) — drives the top-vendor demo.
  IF NOT EXISTS (SELECT 1 FROM vendor_bill WHERE id = v_ra_overdue_big) THEN
    SELECT id INTO v_vendor_id FROM vendor WHERE tenant_id = v_raj_tenant AND code = 'V-XFM-01';
    INSERT INTO vendor_bill (
      id, tenant_id, vendor_id, vendor_invoice_no, vendor_invoice_date,
      bill_date, received_at, due_date, currency,
      status, match_status, match_run_at,
      subtotal, discount_amount, tax_amount, total,
      amount_paid, amount_outstanding,
      vendor_address_snapshot, bill_to_snapshot,
      submitted_at, approved_at, approved_by, notes,
      created_by, updated_by
    ) VALUES (
      v_ra_overdue_big, v_raj_tenant, v_vendor_id,
      'CG/PWR/26/Q1/8821', CURRENT_DATE - 160,
      CURRENT_DATE - 159, CURRENT_DATE - 160, CURRENT_DATE - 70,
      'INR',
      'approved', 'under_review', NOW() - INTERVAL '159 days',
      1280000, 0, 230400, 1510400,
      300000, 1210400,                                  -- partial payment shown
      'Crompton Greaves Power · Kanjurmarg, Mumbai · GSTIN 27AAACC4444E1Z3',
      'Raj Avinsys Pvt Ltd · Vapi, Gujarat · GSTIN 24AABCR9999X1Z8',
      NOW() - INTERVAL '159 days', NOW() - INTERVAL '159 days', v_raj_admin,
      'Q1 transformer pre-Adani-Mundra. ₹3L on-account paid; ₹12.1L still outstanding.',
      v_raj_admin, v_raj_admin
    );
    -- Switch status to partly_paid since amount_paid > 0
    UPDATE vendor_bill SET status = 'partly_paid' WHERE id = v_ra_overdue_big;

    INSERT INTO vendor_bill_line (
      tenant_id, bill_id, line_no, description, hsn_code, unit, quantity, rate,
      discount_pct, taxable_value, is_interstate, gst_rate_pct,
      igst_amount, cgst_amount, sgst_amount, amount_total,
      match_status, match_notes
    ) VALUES (
      v_raj_tenant, v_ra_overdue_big, 1,
      '500 kVA distribution transformer (Q1 legacy)', '8504', 'nos', 1, 1280000,
      0, 1280000, true, 18, 230400, 0, 0, 1510400,
      'unlinked', 'Direct bill — no PO line.'
    );
  END IF;

  RAISE NOTICE '[ap-ageing-seed] Done. Vyara: 2 backdated bills. Raj: 3 backdated bills (1 partly_paid). Buckets spread across 1-30 / 31-60 / 61-90 / 90+. MSME breach + warning demoable.';
END $$;
