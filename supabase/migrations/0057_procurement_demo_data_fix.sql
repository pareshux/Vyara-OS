-- ============================================================
-- 0057_procurement_demo_data_fix.sql — Procurement P1α sample data
--
-- Replaces 0056 (which short-circuited because V-CEM-01 already
-- existed from earlier demo data; the sentinel-based idempotency
-- check returned 'skip' before any new rows could be inserted).
--
-- This version uses per-row idempotency:
--   - vendor inserts: ON CONFLICT (tenant_id, code) WHERE deleted_at IS NULL DO NOTHING
--     (matches the partial unique index `vendor_code_uniq`).
--   - purchase_order + purchase_order_line + approval_request:
--     gated per PO with `IF NOT EXISTS (... id = …)` so re-runs are no-ops.
--
-- Safe to re-run; existing rows are left untouched.
-- ============================================================

DO $$
DECLARE
  v_vyara_tenant    UUID;
  v_raj_tenant      UUID;
  v_vyara_admin     UUID;
  v_raj_admin       UUID;
  v_vyara_warehouse UUID := 'e0000000-0000-0000-0000-000000000001';
  v_raj_warehouse   UUID;
  v_vyara_p_mid     UUID;
  v_vyara_p_high    UUID;
  v_vyara_p_top     UUID;
  v_raj_p_mid       UUID;
  v_raj_p_high      UUID;
  v_raj_p_top       UUID;
  v_ar_id           UUID;
BEGIN
  -- ─── Tenants + admins ─────────────────────────────────────────
  SELECT id INTO v_vyara_tenant FROM tenant WHERE slug = 'vyara-tiles';
  SELECT id INTO v_raj_tenant   FROM tenant WHERE slug = 'raj-avinsys';
  IF v_vyara_tenant IS NULL OR v_raj_tenant IS NULL THEN
    RAISE EXCEPTION 'Both vyara-tiles and raj-avinsys tenants must exist';
  END IF;

  SELECT id INTO v_vyara_admin FROM user_profile WHERE tenant_id = v_vyara_tenant AND role = 'admin' AND is_active = true ORDER BY created_at LIMIT 1;
  SELECT id INTO v_raj_admin   FROM user_profile WHERE tenant_id = v_raj_tenant   AND role = 'admin' AND is_active = true ORDER BY created_at LIMIT 1;
  IF v_vyara_admin IS NULL OR v_raj_admin IS NULL THEN
    RAISE EXCEPTION 'Both tenants must have an active admin user_profile';
  END IF;

  -- ─── Raj warehouse (none exists yet) ──────────────────────────
  IF NOT EXISTS (SELECT 1 FROM warehouse WHERE tenant_id = v_raj_tenant AND code = 'RAJ-MAIN') THEN
    INSERT INTO warehouse (id, tenant_id, code, name, type, city, state, notes, is_active)
    VALUES (
      'f0000000-0000-0000-0000-0000000aaa01'::uuid,
      v_raj_tenant,
      'RAJ-MAIN', 'Vapi GIDC Main Warehouse', 'own_plant', 'Vapi', 'Gujarat',
      'Primary warehouse for panel components + EPC project materials.',
      true
    );
  END IF;
  SELECT id INTO v_raj_warehouse FROM warehouse WHERE tenant_id = v_raj_tenant AND code = 'RAJ-MAIN' LIMIT 1;

  -- ─── Vyara vendors ────────────────────────────────────────────
  -- ON CONFLICT matches the partial unique index vendor_code_uniq.
  INSERT INTO vendor (
    tenant_id, code, name, vendor_type, gstin, gst_state_code, pan,
    msme_status, msme_udyam_no,
    bank_account_no, bank_ifsc, bank_name,
    payment_terms_days, contact_name, phone, email, address, notes
  ) VALUES
    (v_vyara_tenant, 'V-PGM-01', 'Surat Pigments Pvt Ltd', 'supplier',
     '24AABCS5678D1Z9', '24', 'AABCS5678D', 'small', 'UDYAM-GJ-22-0123456',
     '50100012345678', 'ICIC0005012', 'ICICI Bank — Sachin',
     30, 'Hetal Shah', '+919812345002', 'sales@suratpigments.example', 'Sachin GIDC, Phase II, Surat, Gujarat',
     'Long-time supplier; prefers ₹ in advance for new colour ranges.'),

    (v_vyara_tenant, 'V-PKG-01', 'Pack Industries Ltd', 'supplier',
     '27AAACP1234E1Z2', '27', 'AAACP1234E', 'not_msme', NULL,
     '00080012345001', 'KKBK0001234', 'Kotak Mahindra — Pune',
     60, 'Suresh Kulkarni', '+919812345003', 'orders@packindustries.example', 'MIDC, Pune, Maharashtra', NULL),

    (v_vyara_tenant, 'V-MAC-01', 'Hi-Tech Machinery Pvt Ltd', 'supplier',
     '29AAFCH7654F1Z8', '29', 'AAFCH7654F', 'not_msme', NULL,
     '00210067890012', 'SBIN0001234', 'State Bank of India — Bengaluru',
     30, 'Anand Rao', '+919812345004', 'projects@hitechmach.example', 'Peenya Industrial Area, Bengaluru',
     'Capital equipment — long lead times. Negotiate advance %.'),

    (v_vyara_tenant, 'V-TR-01', 'Surya Transport Services', 'service',
     '24AABFS3456G1Z4', '24', 'AABFS3456G', 'micro', 'UDYAM-GJ-22-0234567',
     NULL, NULL, NULL,
     15, 'Mahesh Surya', '+919812345005', NULL, 'Ring Road, Surat, Gujarat',
     'Local transporter; pay weekly.')
  ON CONFLICT (tenant_id, code) WHERE deleted_at IS NULL DO NOTHING;

  -- Also patch V-CEM-01 if it already existed but lacks new KYC fields
  -- (the previous Vyara seed pre-dated REL-016).
  UPDATE vendor
  SET
    gstin           = COALESCE(NULLIF(gstin,''),           '24AAACA1234B1Z5'),
    gst_state_code  = COALESCE(gst_state_code,             '24'),
    pan             = COALESCE(NULLIF(pan,''),             'AAACA1234B'),
    msme_status     = COALESCE(msme_status,                'not_msme'),
    bank_account_no = COALESCE(NULLIF(bank_account_no,''), '00021100123456'),
    bank_ifsc       = COALESCE(NULLIF(bank_ifsc,''),       'HDFC0000123'),
    bank_name       = COALESCE(NULLIF(bank_name,''),       'HDFC Bank — Surat'),
    payment_terms_days = COALESCE(payment_terms_days,      45),
    contact_name    = COALESCE(NULLIF(contact_name,''),    'Ramesh Patel'),
    phone           = COALESCE(NULLIF(phone,''),           '+919812345001'),
    email           = COALESCE(NULLIF(email,''),           'sales.surat@ambujacement.example'),
    address         = COALESCE(NULLIF(address,''),         'Ambuja Depot, Hazira Road, Surat, Gujarat')
  WHERE tenant_id = v_vyara_tenant AND code = 'V-CEM-01';

  -- ─── Raj vendors ──────────────────────────────────────────────
  INSERT INTO vendor (
    tenant_id, code, name, vendor_type, gstin, gst_state_code, pan,
    msme_status, msme_udyam_no,
    bank_account_no, bank_ifsc, bank_name,
    payment_terms_days, contact_name, phone, email, address, notes
  ) VALUES
    (v_raj_tenant, 'V-COP-01', 'Surya Copper Industries', 'supplier',
     '24AAACK9876H1Z3', '24', 'AAACK9876H', 'small', 'UDYAM-GJ-24-0345678',
     '00091200987654', 'AXIS0000456', 'Axis Bank — Vapi',
     30, 'Kishore Kumar', '+919812345101', 'sales@suryacopper.example', 'GIDC Vapi, Gujarat', NULL),

    (v_raj_tenant, 'V-SCH-01', 'Schneider Electric India Pvt Ltd', 'supplier',
     '29AAACS1111E1Z7', '29', 'AAACS1111E', 'not_msme', NULL,
     '00210012340000', 'HDFC0001100', 'HDFC Bank — Bengaluru',
     45, 'Priya Menon', '+919812345102', 'channel.gujarat@se.example', 'Industrial Area, Bengaluru, Karnataka',
     'L&T-approved; original supplier for MCCB/contactors.'),

    (v_raj_tenant, 'V-LT-01', 'L&T Electrical & Automation', 'supplier',
     '27AAACL5555F1Z6', '27', 'AAACL5555F', 'not_msme', NULL,
     '00150045671234', 'ICIC0001550', 'ICICI Bank — Powai',
     60, 'Vikram Joshi', '+919812345103', 'projects.west@lnt.example', 'Powai, Mumbai, Maharashtra', NULL),

    (v_raj_tenant, 'V-CBL-01', 'Polycab Wires (Daman)', 'supplier',
     '24AAACP3333G1Z5', '24', 'AAACP3333G', 'not_msme', NULL,
     '00060078901234', 'YESB0000678', 'YES Bank — Daman',
     30, 'Sanjay Mehta', '+919812345104', 'gujarat@polycab.example', 'Halol GIDC, Gujarat', NULL),

    (v_raj_tenant, 'V-PNL-01', 'Avi Enclosures', 'contractor',
     '24AAGFA2222D1Z0', '24', 'AAGFA2222D', 'small', 'UDYAM-GJ-24-0456789',
     '00030022345678', 'HDFC0000789', 'HDFC Bank — Vapi',
     30, 'Avinash Desai', '+919812345105', 'sales@avienclosures.example', 'GIDC Vapi, Gujarat',
     'Custom panel enclosures; 3-week typical lead.'),

    (v_raj_tenant, 'V-XFM-01', 'Crompton Greaves Power', 'supplier',
     '27AAACC4444E1Z3', '27', 'AAACC4444E', 'not_msme', NULL,
     '00450078901234', 'HDFC0001999', 'HDFC Bank — Mumbai',
     90, 'Rohan Apte', '+919812345106', 'channel.gujarat@cg.example', 'Kanjurmarg, Mumbai, Maharashtra', NULL),

    (v_raj_tenant, 'V-CAL-01', 'Precision Calibration Services', 'service',
     '24AAGFP1234B1Z7', '24', 'AAGFP1234B', 'micro', 'UDYAM-GJ-24-0567890',
     '00021100001234', 'ICIC0001100', 'ICICI Bank — Vapi',
     15, 'Nilesh Joshi', '+919812345107', NULL, 'GIDC Vapi, Gujarat', 'NABL-accredited test certs.')
  ON CONFLICT (tenant_id, code) WHERE deleted_at IS NULL DO NOTHING;

  -- ─── Approval policy lookups ──────────────────────────────────
  SELECT id INTO v_vyara_p_mid  FROM approval_policy WHERE tenant_id = v_vyara_tenant AND entity_type = 'purchase_order' AND min_amount = 50000.01;
  SELECT id INTO v_vyara_p_high FROM approval_policy WHERE tenant_id = v_vyara_tenant AND entity_type = 'purchase_order' AND min_amount = 500000.01;
  SELECT id INTO v_vyara_p_top  FROM approval_policy WHERE tenant_id = v_vyara_tenant AND entity_type = 'purchase_order' AND min_amount = 2500000.01;
  SELECT id INTO v_raj_p_mid    FROM approval_policy WHERE tenant_id = v_raj_tenant   AND entity_type = 'purchase_order' AND min_amount = 50000.01;
  SELECT id INTO v_raj_p_high   FROM approval_policy WHERE tenant_id = v_raj_tenant   AND entity_type = 'purchase_order' AND min_amount = 500000.01;
  SELECT id INTO v_raj_p_top    FROM approval_policy WHERE tenant_id = v_raj_tenant   AND entity_type = 'purchase_order' AND min_amount = 2500000.01;

  -- ═══════════════════════════════════════════════════════════════
  -- VYARA — Purchase Orders
  -- ═══════════════════════════════════════════════════════════════

  -- PO V1 — DRAFT, sub-₹50k intra-state (CGST+SGST)
  IF NOT EXISTS (SELECT 1 FROM purchase_order WHERE id = 'c0000000-0000-0000-0001-000000000001'::uuid) THEN
    INSERT INTO purchase_order (
      id, tenant_id, po_number, vendor_id, ship_to_warehouse_id,
      po_date, expected_delivery_at, status,
      vendor_address_snapshot, bill_to_snapshot, ship_to_snapshot,
      subtotal, discount_amount, tax_amount, total,
      payment_terms_days, delivery_terms, notes, created_by, updated_by
    ) VALUES (
      'c0000000-0000-0000-0001-000000000001'::uuid,
      v_vyara_tenant, 'VT-PO-2026-0001',
      (SELECT id FROM vendor WHERE tenant_id = v_vyara_tenant AND code = 'V-CEM-01'),
      v_vyara_warehouse,
      CURRENT_DATE - 1, CURRENT_DATE + 4, 'draft',
      'Ambuja Cement (Surat depot) · Hazira Road, Surat · GSTIN 24AAACA1234B1Z5',
      'Vyara Tiles Limited · Vyara, Gujarat · GSTIN 24AABCV1234F1Z5',
      'Surat Plant 1 · Surat, Gujarat',
      17500, 0, 3150, 20650,
      45, 'FOR site',
      'Top-up for next-week paving batch.', v_vyara_admin, v_vyara_admin
    );
    INSERT INTO purchase_order_line (
      tenant_id, po_id, line_no, description, hsn_code, unit, quantity, rate,
      discount_pct, taxable_value, is_interstate, gst_rate_pct,
      igst_amount, cgst_amount, sgst_amount, amount_total
    ) VALUES (
      v_vyara_tenant, 'c0000000-0000-0000-0001-000000000001'::uuid, 1,
      'Ambuja OPC 53 grade — 50 kg bag', '2523', 'bags', 50, 350,
      0, 17500, false, 18, 0, 1575, 1575, 20650
    );
  END IF;

  -- PO V2 — PENDING_APPROVAL ₹3.68L intra-state (MSME vendor → 45-day ribbon)
  IF NOT EXISTS (SELECT 1 FROM purchase_order WHERE id = 'c0000000-0000-0000-0001-000000000002'::uuid) THEN
    INSERT INTO purchase_order (
      id, tenant_id, po_number, vendor_id, ship_to_warehouse_id,
      po_date, expected_delivery_at, status,
      vendor_address_snapshot, bill_to_snapshot, ship_to_snapshot,
      subtotal, discount_amount, tax_amount, total,
      payment_terms_days, delivery_terms, notes,
      submitted_at, created_by, updated_by
    ) VALUES (
      'c0000000-0000-0000-0001-000000000002'::uuid,
      v_vyara_tenant, 'VT-PO-2026-0002',
      (SELECT id FROM vendor WHERE tenant_id = v_vyara_tenant AND code = 'V-PGM-01'),
      v_vyara_warehouse,
      CURRENT_DATE - 2, CURRENT_DATE + 10, 'pending_approval',
      'Surat Pigments Pvt Ltd · Sachin GIDC Phase II, Surat · GSTIN 24AABCS5678D1Z9',
      'Vyara Tiles Limited · Vyara, Gujarat · GSTIN 24AABCV1234F1Z5',
      'Surat Plant 1 · Surat, Gujarat',
      312500, 0, 56250, 368750,
      30, 'FOR site',
      'Q3 colour-range top-up. MSME vendor — clear within 45 days.',
      NOW() - INTERVAL '4 hours', v_vyara_admin, v_vyara_admin
    );
    INSERT INTO purchase_order_line (
      tenant_id, po_id, line_no, description, hsn_code, unit, quantity, rate,
      discount_pct, taxable_value, is_interstate, gst_rate_pct,
      igst_amount, cgst_amount, sgst_amount, amount_total
    ) VALUES
      (v_vyara_tenant, 'c0000000-0000-0000-0001-000000000002'::uuid, 1,
       'Iron Oxide Red (Bayferrox 130M equivalent)', '3204', 'kgs', 200, 850,
       0, 170000, false, 18, 0, 15300, 15300, 200600),
      (v_vyara_tenant, 'c0000000-0000-0000-0001-000000000002'::uuid, 2,
       'Carbon Black (Printex Alpha equivalent)', '3204', 'kgs', 150, 950,
       0, 142500, false, 18, 0, 12825, 12825, 168150);
    -- Approval request (mid band → 1-step manager)
    INSERT INTO approval_request (
      tenant_id, policy_id, entity_type, entity_id, amount,
      subject_user_id, status, current_step_order, notes
    ) VALUES (
      v_vyara_tenant, v_vyara_p_mid, 'purchase_order',
      'c0000000-0000-0000-0001-000000000002'::uuid, 368750,
      v_vyara_admin, 'pending', 1, 'Pigment Q3 top-up.'
    ) RETURNING id INTO v_ar_id;
    UPDATE purchase_order SET approval_request_id = v_ar_id
    WHERE id = 'c0000000-0000-0000-0001-000000000002'::uuid;
  END IF;

  -- PO V3 — APPROVED ₹2.12L intra-state (ready to send)
  IF NOT EXISTS (SELECT 1 FROM purchase_order WHERE id = 'c0000000-0000-0000-0001-000000000003'::uuid) THEN
    INSERT INTO purchase_order (
      id, tenant_id, po_number, vendor_id, ship_to_warehouse_id,
      po_date, expected_delivery_at, status,
      vendor_address_snapshot, bill_to_snapshot, ship_to_snapshot,
      subtotal, discount_amount, tax_amount, total,
      payment_terms_days, delivery_terms,
      submitted_at, approved_at, approved_by, created_by, updated_by
    ) VALUES (
      'c0000000-0000-0000-0001-000000000003'::uuid,
      v_vyara_tenant, 'VT-PO-2026-0003',
      (SELECT id FROM vendor WHERE tenant_id = v_vyara_tenant AND code = 'V-CEM-01'),
      v_vyara_warehouse,
      CURRENT_DATE - 3, CURRENT_DATE + 5, 'approved',
      'Ambuja Cement (Surat depot) · Hazira Road, Surat · GSTIN 24AAACA1234B1Z5',
      'Vyara Tiles Limited · Vyara, Gujarat · GSTIN 24AABCV1234F1Z5',
      'Surat Plant 1 · Surat, Gujarat',
      180000, 0, 32400, 212400,
      45, 'FOR site',
      NOW() - INTERVAL '1 day', NOW() - INTERVAL '20 hours', v_vyara_admin, v_vyara_admin, v_vyara_admin
    );
    INSERT INTO purchase_order_line (
      tenant_id, po_id, line_no, description, hsn_code, unit, quantity, rate,
      discount_pct, taxable_value, is_interstate, gst_rate_pct,
      igst_amount, cgst_amount, sgst_amount, amount_total
    ) VALUES (
      v_vyara_tenant, 'c0000000-0000-0000-0001-000000000003'::uuid, 1,
      'Ambuja OPC 53 grade — 50 kg bag', '2523', 'bags', 500, 360,
      0, 180000, false, 18, 0, 16200, 16200, 212400
    );
  END IF;

  -- PO V4 — SENT ₹1.30L INTER-state (IGST)
  IF NOT EXISTS (SELECT 1 FROM purchase_order WHERE id = 'c0000000-0000-0000-0001-000000000004'::uuid) THEN
    INSERT INTO purchase_order (
      id, tenant_id, po_number, vendor_id, ship_to_warehouse_id,
      po_date, expected_delivery_at, status,
      vendor_address_snapshot, bill_to_snapshot, ship_to_snapshot,
      subtotal, discount_amount, tax_amount, total,
      payment_terms_days, delivery_terms,
      submitted_at, approved_at, approved_by, sent_at, sent_by, created_by, updated_by
    ) VALUES (
      'c0000000-0000-0000-0001-000000000004'::uuid,
      v_vyara_tenant, 'VT-PO-2026-0004',
      (SELECT id FROM vendor WHERE tenant_id = v_vyara_tenant AND code = 'V-PKG-01'),
      v_vyara_warehouse,
      CURRENT_DATE - 4, CURRENT_DATE + 8, 'sent',
      'Pack Industries Ltd · MIDC, Pune, Maharashtra · GSTIN 27AAACP1234E1Z2',
      'Vyara Tiles Limited · Vyara, Gujarat · GSTIN 24AABCV1234F1Z5',
      'Surat Plant 1 · Surat, Gujarat',
      110000, 0, 19800, 129800,
      60, 'Ex-works (Pune)',
      NOW() - INTERVAL '4 days', NOW() - INTERVAL '3 days', v_vyara_admin, NOW() - INTERVAL '2 days', v_vyara_admin, v_vyara_admin, v_vyara_admin
    );
    INSERT INTO purchase_order_line (
      tenant_id, po_id, line_no, description, hsn_code, unit, quantity, rate,
      discount_pct, taxable_value, is_interstate, gst_rate_pct,
      igst_amount, cgst_amount, sgst_amount, amount_total
    ) VALUES (
      v_vyara_tenant, 'c0000000-0000-0000-0001-000000000004'::uuid, 1,
      'Corrugated cartons 30 × 30 × 30 cm (5-ply)', '4819', 'nos', 5000, 22,
      0, 110000, true, 18, 19800, 0, 0, 129800
    );
  END IF;

  -- PO V5 — CANCELLED ₹10L INTER-state (with reason)
  IF NOT EXISTS (SELECT 1 FROM purchase_order WHERE id = 'c0000000-0000-0000-0001-000000000005'::uuid) THEN
    INSERT INTO purchase_order (
      id, tenant_id, po_number, vendor_id, ship_to_warehouse_id,
      po_date, expected_delivery_at, status,
      vendor_address_snapshot, bill_to_snapshot, ship_to_snapshot,
      subtotal, discount_amount, tax_amount, total,
      payment_terms_days, delivery_terms,
      submitted_at, approved_at, approved_by,
      cancelled_at, cancelled_by, cancellation_reason,
      created_by, updated_by
    ) VALUES (
      'c0000000-0000-0000-0001-000000000005'::uuid,
      v_vyara_tenant, 'VT-PO-2026-0005',
      (SELECT id FROM vendor WHERE tenant_id = v_vyara_tenant AND code = 'V-MAC-01'),
      v_vyara_warehouse,
      CURRENT_DATE - 10, CURRENT_DATE + 60, 'cancelled',
      'Hi-Tech Machinery Pvt Ltd · Peenya, Bengaluru · GSTIN 29AAFCH7654F1Z8',
      'Vyara Tiles Limited · Vyara, Gujarat · GSTIN 24AABCV1234F1Z5',
      'Surat Plant 1 · Surat, Gujarat',
      850000, 0, 153000, 1003000,
      30, 'Ex-works (Bengaluru)',
      NOW() - INTERVAL '9 days', NOW() - INTERVAL '8 days', v_vyara_admin,
      NOW() - INTERVAL '2 days', v_vyara_admin,
      'Vendor delivery timeline pushed past project deadline. Reissuing to a local supplier.',
      v_vyara_admin, v_vyara_admin
    );
    INSERT INTO purchase_order_line (
      tenant_id, po_id, line_no, description, hsn_code, unit, quantity, rate,
      discount_pct, taxable_value, is_interstate, gst_rate_pct,
      igst_amount, cgst_amount, sgst_amount, amount_total
    ) VALUES (
      v_vyara_tenant, 'c0000000-0000-0000-0001-000000000005'::uuid, 1,
      'Vibratory paver press machine (300 × 600 mm bed)', '8474', 'nos', 1, 850000,
      0, 850000, true, 18, 153000, 0, 0, 1003000
    );
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- RAJ — Purchase Orders
  -- ═══════════════════════════════════════════════════════════════

  -- PO R1 — DRAFT, sub-₹50k intra-state (MSME small)
  IF NOT EXISTS (SELECT 1 FROM purchase_order WHERE id = 'c0000000-0000-0000-0001-000000000101'::uuid) THEN
    INSERT INTO purchase_order (
      id, tenant_id, po_number, vendor_id, ship_to_warehouse_id,
      po_date, expected_delivery_at, status,
      vendor_address_snapshot, bill_to_snapshot, ship_to_snapshot,
      subtotal, discount_amount, tax_amount, total,
      payment_terms_days, delivery_terms, notes, created_by, updated_by
    ) VALUES (
      'c0000000-0000-0000-0001-000000000101'::uuid,
      v_raj_tenant, 'RA-PO-2026-0001',
      (SELECT id FROM vendor WHERE tenant_id = v_raj_tenant AND code = 'V-COP-01'),
      v_raj_warehouse,
      CURRENT_DATE - 1, CURRENT_DATE + 5, 'draft',
      'Surya Copper Industries · GIDC Vapi · GSTIN 24AAACK9876H1Z3',
      'Raj Avinsys Pvt Ltd · Vapi, Gujarat · GSTIN 24AABCR9999X1Z8',
      'Vapi GIDC Main Warehouse · Vapi, Gujarat',
      36000, 0, 6480, 42480,
      30, 'FOR site', 'Bus bars for the upcoming Adani panel order.',
      v_raj_admin, v_raj_admin
    );
    INSERT INTO purchase_order_line (
      tenant_id, po_id, line_no, description, hsn_code, unit, quantity, rate,
      discount_pct, taxable_value, is_interstate, gst_rate_pct,
      igst_amount, cgst_amount, sgst_amount, amount_total
    ) VALUES (
      v_raj_tenant, 'c0000000-0000-0000-0001-000000000101'::uuid, 1,
      'Copper bus bar 25 × 10 mm tinned', '7407', 'mtr', 30, 1200,
      0, 36000, false, 18, 0, 3240, 3240, 42480
    );
  END IF;

  -- PO R2 — PENDING_APPROVAL ₹3.32L INTER-state Schneider (IGST)
  IF NOT EXISTS (SELECT 1 FROM purchase_order WHERE id = 'c0000000-0000-0000-0001-000000000102'::uuid) THEN
    INSERT INTO purchase_order (
      id, tenant_id, po_number, vendor_id, ship_to_warehouse_id,
      po_date, expected_delivery_at, status,
      vendor_address_snapshot, bill_to_snapshot, ship_to_snapshot,
      subtotal, discount_amount, tax_amount, total,
      payment_terms_days, delivery_terms,
      submitted_at, created_by, updated_by
    ) VALUES (
      'c0000000-0000-0000-0001-000000000102'::uuid,
      v_raj_tenant, 'RA-PO-2026-0002',
      (SELECT id FROM vendor WHERE tenant_id = v_raj_tenant AND code = 'V-SCH-01'),
      v_raj_warehouse,
      CURRENT_DATE - 2, CURRENT_DATE + 14, 'pending_approval',
      'Schneider Electric India · Bengaluru, Karnataka · GSTIN 29AAACS1111E1Z7',
      'Raj Avinsys Pvt Ltd · Vapi, Gujarat · GSTIN 24AABCR9999X1Z8',
      'Vapi GIDC Main Warehouse · Vapi, Gujarat',
      282000, 0, 50760, 332760,
      45, 'Ex-works',
      NOW() - INTERVAL '6 hours', v_raj_admin, v_raj_admin
    );
    INSERT INTO purchase_order_line (
      tenant_id, po_id, line_no, description, hsn_code, unit, quantity, rate,
      discount_pct, taxable_value, is_interstate, gst_rate_pct,
      igst_amount, cgst_amount, sgst_amount, amount_total
    ) VALUES
      (v_raj_tenant, 'c0000000-0000-0000-0001-000000000102'::uuid, 1,
       'MCCB 400A 4P TM (NSX 400)', '8536', 'nos', 6, 28000,
       0, 168000, true, 18, 30240, 0, 0, 198240),
      (v_raj_tenant, 'c0000000-0000-0000-0001-000000000102'::uuid, 2,
       'Contactor 100A AC3 (LC1D series)', '8536', 'nos', 12, 9500,
       0, 114000, true, 18, 20520, 0, 0, 134520);
    INSERT INTO approval_request (
      tenant_id, policy_id, entity_type, entity_id, amount,
      subject_user_id, status, current_step_order, notes
    ) VALUES (
      v_raj_tenant, v_raj_p_mid, 'purchase_order',
      'c0000000-0000-0000-0001-000000000102'::uuid, 332760,
      v_raj_admin, 'pending', 1, 'Schneider components for Adani panel.'
    ) RETURNING id INTO v_ar_id;
    UPDATE purchase_order SET approval_request_id = v_ar_id
    WHERE id = 'c0000000-0000-0000-0001-000000000102'::uuid;
  END IF;

  -- PO R3 — PENDING_APPROVAL ₹27.73L INTER-state Crompton (TOP BAND)
  IF NOT EXISTS (SELECT 1 FROM purchase_order WHERE id = 'c0000000-0000-0000-0001-000000000103'::uuid) THEN
    INSERT INTO purchase_order (
      id, tenant_id, po_number, vendor_id, ship_to_warehouse_id,
      po_date, expected_delivery_at, status,
      vendor_address_snapshot, bill_to_snapshot, ship_to_snapshot,
      subtotal, discount_amount, tax_amount, total,
      payment_terms_days, delivery_terms, warranty_terms, retention_pct, notes,
      submitted_at, created_by, updated_by
    ) VALUES (
      'c0000000-0000-0000-0001-000000000103'::uuid,
      v_raj_tenant, 'RA-PO-2026-0003',
      (SELECT id FROM vendor WHERE tenant_id = v_raj_tenant AND code = 'V-XFM-01'),
      v_raj_warehouse,
      CURRENT_DATE - 1, CURRENT_DATE + 60, 'pending_approval',
      'Crompton Greaves Power · Kanjurmarg, Mumbai · GSTIN 27AAACC4444E1Z3',
      'Raj Avinsys Pvt Ltd · Vapi, Gujarat · GSTIN 24AABCR9999X1Z8',
      'Vapi GIDC Main Warehouse · Vapi, Gujarat',
      2350000, 0, 423000, 2773000,
      90, 'DDP site (Vapi)', '24 months from commissioning', 5,
      'Capital — Adani Mundra substation extension. Top-band approval (>₹25L).',
      NOW() - INTERVAL '1 day', v_raj_admin, v_raj_admin
    );
    INSERT INTO purchase_order_line (
      tenant_id, po_id, line_no, description, hsn_code, unit, quantity, rate,
      discount_pct, taxable_value, is_interstate, gst_rate_pct,
      igst_amount, cgst_amount, sgst_amount, amount_total
    ) VALUES (
      v_raj_tenant, 'c0000000-0000-0000-0001-000000000103'::uuid, 1,
      '1000 kVA dry-type cast-resin transformer (11 kV / 433 V)', '8504', 'nos', 1, 2350000,
      0, 2350000, true, 18, 423000, 0, 0, 2773000
    );
    INSERT INTO approval_request (
      tenant_id, policy_id, entity_type, entity_id, amount,
      subject_user_id, status, current_step_order, notes
    ) VALUES (
      v_raj_tenant, v_raj_p_top, 'purchase_order',
      'c0000000-0000-0000-0001-000000000103'::uuid, 2773000,
      v_raj_admin, 'pending', 1, '1000 kVA transformer — Adani Mundra. Admin sign-off only.'
    ) RETURNING id INTO v_ar_id;
    UPDATE purchase_order SET approval_request_id = v_ar_id
    WHERE id = 'c0000000-0000-0000-0001-000000000103'::uuid;
  END IF;

  -- PO R4 — APPROVED ₹2.83L intra-state Polycab
  IF NOT EXISTS (SELECT 1 FROM purchase_order WHERE id = 'c0000000-0000-0000-0001-000000000104'::uuid) THEN
    INSERT INTO purchase_order (
      id, tenant_id, po_number, vendor_id, ship_to_warehouse_id,
      po_date, expected_delivery_at, status,
      vendor_address_snapshot, bill_to_snapshot, ship_to_snapshot,
      subtotal, discount_amount, tax_amount, total,
      payment_terms_days, delivery_terms, notes,
      submitted_at, approved_at, approved_by, created_by, updated_by
    ) VALUES (
      'c0000000-0000-0000-0001-000000000104'::uuid,
      v_raj_tenant, 'RA-PO-2026-0004',
      (SELECT id FROM vendor WHERE tenant_id = v_raj_tenant AND code = 'V-CBL-01'),
      v_raj_warehouse,
      CURRENT_DATE - 2, CURRENT_DATE + 7, 'approved',
      'Polycab Wires (Daman) · Halol GIDC · GSTIN 24AAACP3333G1Z5',
      'Raj Avinsys Pvt Ltd · Vapi, Gujarat · GSTIN 24AABCR9999X1Z8',
      'Vapi GIDC Main Warehouse · Vapi, Gujarat',
      240000, 0, 43200, 283200,
      30, 'FOR site', 'XLPE armoured cable for the L&T Vadinar package.',
      NOW() - INTERVAL '1 day', NOW() - INTERVAL '20 hours', v_raj_admin, v_raj_admin, v_raj_admin
    );
    INSERT INTO purchase_order_line (
      tenant_id, po_id, line_no, description, hsn_code, unit, quantity, rate,
      discount_pct, taxable_value, is_interstate, gst_rate_pct,
      igst_amount, cgst_amount, sgst_amount, amount_total
    ) VALUES (
      v_raj_tenant, 'c0000000-0000-0000-0001-000000000104'::uuid, 1,
      '4-core 25 sqmm XLPE armoured cable (1.1 kV)', '8544', 'mtr', 500, 480,
      0, 240000, false, 18, 0, 21600, 21600, 283200
    );
  END IF;

  -- PO R5 — SENT ₹12.30L INTER-state L&T (multi-line)
  IF NOT EXISTS (SELECT 1 FROM purchase_order WHERE id = 'c0000000-0000-0000-0001-000000000105'::uuid) THEN
    INSERT INTO purchase_order (
      id, tenant_id, po_number, vendor_id, ship_to_warehouse_id,
      po_date, expected_delivery_at, status,
      vendor_address_snapshot, bill_to_snapshot, ship_to_snapshot,
      subtotal, discount_amount, tax_amount, total,
      payment_terms_days, delivery_terms, warranty_terms, notes,
      submitted_at, approved_at, approved_by, sent_at, sent_by, created_by, updated_by
    ) VALUES (
      'c0000000-0000-0000-0001-000000000105'::uuid,
      v_raj_tenant, 'RA-PO-2026-0005',
      (SELECT id FROM vendor WHERE tenant_id = v_raj_tenant AND code = 'V-LT-01'),
      v_raj_warehouse,
      CURRENT_DATE - 5, CURRENT_DATE + 25, 'sent',
      'L&T Electrical & Automation · Powai, Mumbai · GSTIN 27AAACL5555F1Z6',
      'Raj Avinsys Pvt Ltd · Vapi, Gujarat · GSTIN 24AABCR9999X1Z8',
      'Vapi GIDC Main Warehouse · Vapi, Gujarat',
      1042000, 0, 187560, 1229560,
      60, 'DDP site', '12 months from supply',
      'Adani Mundra subcomponent package.',
      NOW() - INTERVAL '5 days', NOW() - INTERVAL '3 days', v_raj_admin, NOW() - INTERVAL '2 days', v_raj_admin, v_raj_admin, v_raj_admin
    );
    INSERT INTO purchase_order_line (
      tenant_id, po_id, line_no, description, hsn_code, unit, quantity, rate,
      discount_pct, taxable_value, is_interstate, gst_rate_pct,
      igst_amount, cgst_amount, sgst_amount, amount_total
    ) VALUES
      (v_raj_tenant, 'c0000000-0000-0000-0001-000000000105'::uuid, 1,
       'VFD 30 HP 415V (SL1S series)', '8504', 'nos', 2, 175000,
       0, 350000, true, 18, 63000, 0, 0, 413000),
      (v_raj_tenant, 'c0000000-0000-0000-0001-000000000105'::uuid, 2,
       'SFU 400A 4P (Switch-Fuse Unit)', '8536', 'nos', 4, 38000,
       0, 152000, true, 18, 27360, 0, 0, 179360),
      (v_raj_tenant, 'c0000000-0000-0000-0001-000000000105'::uuid, 3,
       'Bus duct 800A sandwich type', '8538', 'mtr', 12, 45000,
       0, 540000, true, 18, 97200, 0, 0, 637200);
  END IF;

  -- PO R6 — CANCELLED ₹1.32L intra-state Avi (MSME, with reason)
  IF NOT EXISTS (SELECT 1 FROM purchase_order WHERE id = 'c0000000-0000-0000-0001-000000000106'::uuid) THEN
    INSERT INTO purchase_order (
      id, tenant_id, po_number, vendor_id, ship_to_warehouse_id,
      po_date, expected_delivery_at, status,
      vendor_address_snapshot, bill_to_snapshot, ship_to_snapshot,
      subtotal, discount_amount, tax_amount, total,
      payment_terms_days, delivery_terms,
      submitted_at, approved_at, approved_by,
      cancelled_at, cancelled_by, cancellation_reason,
      created_by, updated_by
    ) VALUES (
      'c0000000-0000-0000-0001-000000000106'::uuid,
      v_raj_tenant, 'RA-PO-2026-0006',
      (SELECT id FROM vendor WHERE tenant_id = v_raj_tenant AND code = 'V-PNL-01'),
      v_raj_warehouse,
      CURRENT_DATE - 7, CURRENT_DATE + 21, 'cancelled',
      'Avi Enclosures · GIDC Vapi · GSTIN 24AAGFA2222D1Z0',
      'Raj Avinsys Pvt Ltd · Vapi, Gujarat · GSTIN 24AABCR9999X1Z8',
      'Vapi GIDC Main Warehouse · Vapi, Gujarat',
      112000, 0, 20160, 132160,
      30, 'FOR site',
      NOW() - INTERVAL '6 days', NOW() - INTERVAL '5 days', v_raj_admin,
      NOW() - INTERVAL '1 day', v_raj_admin,
      'Spec changed from IP54 to IP65 (consultant note). Reissued as new PO.',
      v_raj_admin, v_raj_admin
    );
    INSERT INTO purchase_order_line (
      tenant_id, po_id, line_no, description, hsn_code, unit, quantity, rate,
      discount_pct, taxable_value, is_interstate, gst_rate_pct,
      igst_amount, cgst_amount, sgst_amount, amount_total
    ) VALUES (
      v_raj_tenant, 'c0000000-0000-0000-0001-000000000106'::uuid, 1,
      'Floor-mount panel enclosure IP54 (1600 × 800 × 600 mm)', '7308', 'nos', 4, 28000,
      0, 112000, false, 18, 0, 10080, 10080, 132160
    );
  END IF;

  RAISE NOTICE '[procurement-seed] Done. Vyara: 5 POs (V-CEM-01 + 4 new vendors). Raj: 6 POs across 7 vendors. Approval requests for 3 pending POs.';
END $$;
