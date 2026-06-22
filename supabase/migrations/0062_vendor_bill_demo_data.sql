-- ============================================================
-- 0062_vendor_bill_demo_data.sql — sample vendor bills (P2α)
--
-- Two seed bills exercising both happy-path and exception-path of
-- the 3-way match engine:
--
--   1. VT-VB-2026-0001 (Vyara) — clean match against VT-PO-2026-0004
--      Full receipt (5000 cartons, ₹22/each, 18% GST). Status:
--      approved. qty_billed on PO line bumped to 5000 to reflect
--      the approved-effects logic.
--
--   2. RA-VB-2026-0001 (Raj) — RATE MISMATCH against RA-PO-2026-0005
--      VFD line only (line 1). PO rate ₹1,75,000/unit; vendor
--      invoiced at ₹1,85,000/unit (+₹10k/unit = 5.7% over).
--      Bill match_status='mismatched'; line match_status='rate_mismatch'
--      with diagnostic. Status: submitted (pending manager approval,
--      since ₹2,18,300 falls in the ₹50k-₹5L band). approval_request
--      seeded against the mid-band policy.
--
-- Idempotent via fixed UUIDs + IF NOT EXISTS.
-- ============================================================

DO $$
DECLARE
  v_vyara_tenant     UUID;
  v_raj_tenant       UUID;
  v_vyara_admin      UUID;
  v_raj_admin        UUID;
  v_vt_po4           UUID := 'c0000000-0000-0000-0001-000000000004'::uuid;
  v_ra_po5           UUID := 'c0000000-0000-0000-0001-000000000105'::uuid;
  v_vt_vb1           UUID := 'e0000000-0000-0000-0002-000000000001'::uuid;
  v_ra_vb1           UUID := 'e0000000-0000-0000-0002-000000000101'::uuid;
  -- PO lines we'll bill
  v_vt_po4_line1     UUID;
  v_ra_po5_line1     UUID;
  -- Pull PO snapshot for vendor + warehouse + payment_terms_days
  v_vt_vendor        UUID;
  v_ra_vendor        UUID;
  v_vt_received_at   DATE;
  v_ra_received_at   DATE;
  v_vt_payment_days  INTEGER;
  v_ra_payment_days  INTEGER;
  -- Approval policy lookup
  v_ra_p_mid         UUID;
  v_ar_id            UUID;
BEGIN
  SELECT id INTO v_vyara_tenant FROM tenant WHERE slug = 'vyara-tiles';
  SELECT id INTO v_raj_tenant   FROM tenant WHERE slug = 'raj-avinsys';
  SELECT id INTO v_vyara_admin  FROM user_profile WHERE tenant_id = v_vyara_tenant AND role = 'admin' AND is_active = true ORDER BY created_at LIMIT 1;
  SELECT id INTO v_raj_admin    FROM user_profile WHERE tenant_id = v_raj_tenant   AND role = 'admin' AND is_active = true ORDER BY created_at LIMIT 1;

  -- ─── Vyara: VT-VB-2026-0001 (clean match against VT-PO-2026-0004) ──
  IF NOT EXISTS (SELECT 1 FROM vendor_bill WHERE id = v_vt_vb1) THEN
    SELECT vendor_id, payment_terms_days INTO v_vt_vendor, v_vt_payment_days
    FROM purchase_order WHERE id = v_vt_po4;

    SELECT id INTO v_vt_po4_line1 FROM purchase_order_line
    WHERE po_id = v_vt_po4 AND line_no = 1;

    -- Received date from the GRN posted earlier
    SELECT grn_date INTO v_vt_received_at
    FROM goods_receipt_note WHERE po_id = v_vt_po4 AND status = 'posted'
    ORDER BY posted_at DESC LIMIT 1;

    INSERT INTO vendor_bill (
      id, tenant_id, vendor_id, po_id, grn_id,
      vendor_invoice_no, vendor_invoice_date,
      bill_date, received_at, due_date, currency,
      status, match_status, match_run_at, match_notes,
      subtotal, discount_amount, tax_amount, total,
      amount_paid, amount_outstanding,
      vendor_address_snapshot, bill_to_snapshot,
      submitted_at, approved_at, approved_by, notes,
      created_by, updated_by
    )
    SELECT
      v_vt_vb1, v_vyara_tenant, v_vt_vendor, v_vt_po4,
      (SELECT id FROM goods_receipt_note WHERE po_id = v_vt_po4 AND status='posted' ORDER BY posted_at DESC LIMIT 1),
      'PI/2026/INV/4471', CURRENT_DATE - 1,
      CURRENT_DATE, COALESCE(v_vt_received_at, CURRENT_DATE - 1),
      (COALESCE(v_vt_received_at, CURRENT_DATE - 1) + (v_vt_payment_days || ' days')::INTERVAL)::DATE,
      'INR',
      'approved', 'matched', NOW() - INTERVAL '2 hours', NULL,
      110000, 0, 19800, 129800,
      0, 129800,
      'Pack Industries Ltd · MIDC, Pune, Maharashtra · GSTIN 27AAACP1234E1Z2',
      'Vyara Tiles Limited · Vyara, Gujarat · GSTIN 24AABCV1234F1Z5',
      NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours', v_vyara_admin,
      'Vendor invoice matches PO + GRN exactly. Auto-approved seed for demo.',
      v_vyara_admin, v_vyara_admin;

    INSERT INTO vendor_bill_line (
      tenant_id, bill_id, line_no, po_line_id, product_id,
      description, hsn_code, unit, quantity, rate,
      discount_pct, taxable_value, is_interstate, gst_rate_pct,
      igst_amount, cgst_amount, sgst_amount, amount_total,
      match_status, match_notes
    ) VALUES (
      v_vyara_tenant, v_vt_vb1, 1, v_vt_po4_line1, NULL,
      'Corrugated cartons 30 × 30 × 30 cm (5-ply)', '4819', 'nos', 5000, 22,
      0, 110000, true, 18,
      19800, 0, 0, 129800,
      'matched', NULL
    );

    -- Reflect approve-effects: po_line.qty_billed += 5000
    UPDATE purchase_order_line
    SET qty_billed = 5000, updated_at = NOW()
    WHERE id = v_vt_po4_line1;

    RAISE NOTICE '[vendor-bill-seed] VT-VB-2026-0001 (clean match, approved)';
  END IF;

  -- ─── Raj: RA-VB-2026-0001 (RATE MISMATCH against RA-PO-2026-0005) ──
  IF NOT EXISTS (SELECT 1 FROM vendor_bill WHERE id = v_ra_vb1) THEN
    SELECT vendor_id, payment_terms_days INTO v_ra_vendor, v_ra_payment_days
    FROM purchase_order WHERE id = v_ra_po5;

    SELECT id INTO v_ra_po5_line1 FROM purchase_order_line
    WHERE po_id = v_ra_po5 AND line_no = 1;  -- VFD 30HP

    SELECT grn_date INTO v_ra_received_at
    FROM goods_receipt_note WHERE po_id = v_ra_po5 AND status = 'posted'
    ORDER BY posted_at DESC LIMIT 1;

    -- VFD: 1 unit × ₹1,85,000 (vendor invoice; PO was ₹1,75,000)
    -- Taxable 1,85,000 + 18% IGST 33,300 = 2,18,300
    INSERT INTO vendor_bill (
      id, tenant_id, vendor_id, po_id, grn_id,
      vendor_invoice_no, vendor_invoice_date,
      bill_date, received_at, due_date, currency,
      status, match_status, match_run_at, match_notes,
      subtotal, discount_amount, tax_amount, total,
      amount_paid, amount_outstanding,
      vendor_address_snapshot, bill_to_snapshot,
      submitted_at, notes,
      created_by, updated_by
    )
    SELECT
      v_ra_vb1, v_raj_tenant, v_ra_vendor, v_ra_po5,
      (SELECT id FROM goods_receipt_note WHERE po_id = v_ra_po5 AND status='posted' ORDER BY posted_at DESC LIMIT 1),
      'LT/PUR/26/9981', CURRENT_DATE - 1,
      CURRENT_DATE, COALESCE(v_ra_received_at, CURRENT_DATE - 1),
      (COALESCE(v_ra_received_at, CURRENT_DATE - 1) + (v_ra_payment_days || ' days')::INTERVAL)::DATE,
      'INR',
      'submitted', 'mismatched', NOW() - INTERVAL '1 hour',
      'Vendor invoiced at ₹1,85,000/unit vs PO rate ₹1,75,000/unit — ₹10,000/unit price drift flagged before submit.',
      185000, 0, 33300, 218300,
      0, 218300,
      'L&T Electrical & Automation · Powai, Mumbai, Maharashtra · GSTIN 27AAACL5555F1Z6',
      'Raj Avinsys Pvt Ltd · Vapi, Gujarat · GSTIN 24AABCR9999X1Z8',
      NOW() - INTERVAL '1 hour',
      'First VFD tranche. Rate variance vs PO is unexpected — vendor cited input-cost escalation. Manager review needed.',
      v_raj_admin, v_raj_admin;

    INSERT INTO vendor_bill_line (
      tenant_id, bill_id, line_no, po_line_id, product_id,
      description, hsn_code, unit, quantity, rate,
      discount_pct, taxable_value, is_interstate, gst_rate_pct,
      igst_amount, cgst_amount, sgst_amount, amount_total,
      match_status, match_notes
    ) VALUES (
      v_raj_tenant, v_ra_vb1, 1, v_ra_po5_line1, NULL,
      'VFD 30 HP 415V (SL1S series)', '8504', 'nos', 1, 185000,
      0, 185000, true, 18,
      33300, 0, 0, 218300,
      'rate_mismatch', 'Bill rate ₹185000.00 differs from PO rate ₹175000.00 (diff ₹10000.00/unit).'
    );

    -- Approval request (mid band 50k-5L → 1-step manager)
    SELECT id INTO v_ra_p_mid
    FROM approval_policy
    WHERE tenant_id = v_raj_tenant
      AND entity_type = 'vendor_bill'
      AND min_amount = 50000.01;

    INSERT INTO approval_request (
      tenant_id, policy_id, entity_type, entity_id, amount,
      subject_user_id, status, current_step_order, notes
    ) VALUES (
      v_raj_tenant, v_ra_p_mid, 'vendor_bill', v_ra_vb1, 218300,
      v_raj_admin, 'pending', 1,
      'Rate-mismatch vendor bill — see 3-way match diagnostics on detail page.'
    ) RETURNING id INTO v_ar_id;

    UPDATE vendor_bill
    SET approval_request_id = v_ar_id
    WHERE id = v_ra_vb1;

    RAISE NOTICE '[vendor-bill-seed] RA-VB-2026-0001 (rate_mismatch, submitted)';
  END IF;
END $$;
