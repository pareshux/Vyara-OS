-- ============================================================
-- 0065_vendor_payment_demo_data.sql — sample vendor payments (P3α)
--
-- Two payments to give the /procurement/payments page content:
--
--   1. RA-PAY-2026-0001 (Raj · Crompton ₹3,00,000 NEFT)
--      Backfill for the existing amount_paid=300000 on RA-VB-2026-0007
--      (the partly-paid Crompton transformer bill seeded in 0063).
--      Records the historical NEFT against the bill so the audit trail
--      isn't a magic "amount_paid jumped without a payment record".
--      No TDS in v1 backfill (legacy payment booked pre-TDS-flow).
--
--   2. VT-PAY-2026-0001 (Vyara · Pack Industries ₹1,29,800 NEFT)
--      Full payment of VT-VB-2026-0001 (the clean-match 5000 cartons bill).
--      TDS @ §194Q × 0.1% = ₹129.80 (PAN on file). Net ₹1,29,670.20.
--      Status: posted. After posting:
--        VT-VB-2026-0001.amount_paid = 129800 (full)
--        VT-VB-2026-0001.amount_outstanding = 0
--        VT-VB-2026-0001.status = 'paid'
--
-- Idempotent via fixed UUIDs.
-- ============================================================

DO $$
DECLARE
  v_vyara_tenant     UUID;
  v_raj_tenant       UUID;
  v_vyara_admin      UUID;
  v_raj_admin        UUID;
  v_vt_pack_vendor   UUID;
  v_ra_xfm_vendor    UUID;
  v_vt_pack_bill     UUID := 'e0000000-0000-0000-0002-000000000001'::uuid;  -- VT-VB-2026-0001 from 0062
  v_ra_xfm_bill      UUID := 'f1000000-0000-0000-0002-000000000103'::uuid;  -- RA-VB-2026-0007 from 0063
  v_vt_pay           UUID := 'a0000000-0000-0000-0003-000000000001'::uuid;
  v_ra_pay           UUID := 'a0000000-0000-0000-0003-000000000101'::uuid;
BEGIN
  SELECT id INTO v_vyara_tenant FROM tenant WHERE slug = 'vyara-tiles';
  SELECT id INTO v_raj_tenant   FROM tenant WHERE slug = 'raj-avinsys';
  SELECT id INTO v_vyara_admin FROM user_profile WHERE tenant_id = v_vyara_tenant AND role = 'admin' AND is_active = true ORDER BY created_at LIMIT 1;
  SELECT id INTO v_raj_admin   FROM user_profile WHERE tenant_id = v_raj_tenant   AND role = 'admin' AND is_active = true ORDER BY created_at LIMIT 1;

  -- ─── Vyara: VT-PAY-2026-0001 — full payment of VT-VB-2026-0001 ──
  IF NOT EXISTS (SELECT 1 FROM vendor_payment WHERE id = v_vt_pay) THEN
    -- Gross 1,29,800; TDS §194Q 0.1% = 129.80; Net 1,29,670.20
    SELECT vendor_id INTO v_vt_pack_vendor FROM vendor_bill WHERE id = v_vt_pack_bill;

    INSERT INTO vendor_payment (
      id, tenant_id, vendor_id, payment_date, payment_mode,
      bank_account_used, reference_no,
      gross_amount, tds_section, tds_pct, tds_amount, net_amount,
      status, posted_at, posted_by, notes,
      created_by, updated_by
    ) VALUES (
      v_vt_pay, v_vyara_tenant, v_vt_pack_vendor,
      CURRENT_DATE, 'neft',
      'HDFC Bank · Curr A/c 50100012345678 (Vyara)',
      'N026INF9988',
      129800, '194Q', 0.100, 129.80, 129670.20,
      'posted', NOW() - INTERVAL '2 hours', v_vyara_admin,
      'Full payment against PI/2026/INV/4471 (5000 cartons). TDS §194Q @ 0.1% — supplier with PAN on file.',
      v_vyara_admin, v_vyara_admin
    );

    INSERT INTO vendor_payment_allocation (
      tenant_id, payment_id, bill_id, allocated_amount
    ) VALUES (
      v_vyara_tenant, v_vt_pay, v_vt_pack_bill, 129800
    );

    -- Apply post-effects manually (mirrors action logic)
    UPDATE vendor_bill
    SET amount_paid = 129800,
        amount_outstanding = 0,
        status = 'paid',
        updated_at = NOW()
    WHERE id = v_vt_pack_bill;

    RAISE NOTICE '[payment-seed] VT-PAY-2026-0001 posted · VT-VB-2026-0001 → paid';
  END IF;

  -- ─── Raj: RA-PAY-2026-0001 — backfill ₹3,00,000 against Crompton ──
  IF NOT EXISTS (SELECT 1 FROM vendor_payment WHERE id = v_ra_pay) THEN
    SELECT vendor_id INTO v_ra_xfm_vendor FROM vendor_bill WHERE id = v_ra_xfm_bill;

    INSERT INTO vendor_payment (
      id, tenant_id, vendor_id, payment_date, payment_mode,
      bank_account_used, reference_no,
      gross_amount, tds_section, tds_pct, tds_amount, net_amount,
      status, posted_at, posted_by, notes,
      created_by, updated_by
    ) VALUES (
      v_ra_pay, v_raj_tenant, v_ra_xfm_vendor,
      CURRENT_DATE - 45, 'neft',
      'ICICI Bank · Curr A/c 00150045678901 (Raj)',
      'N025XYZ8821',
      300000, NULL, 0, 0, 300000,
      'posted', (CURRENT_DATE - 45 + INTERVAL '0')::TIMESTAMPTZ, v_raj_admin,
      'On-account payment against Crompton transformer bill (CG/PWR/26/Q1/8821). Legacy payment — pre-TDS-flow, no TDS deducted; would be 0.1% under §194Q if booked today (PAN on file).',
      v_raj_admin, v_raj_admin
    );

    INSERT INTO vendor_payment_allocation (
      tenant_id, payment_id, bill_id, allocated_amount
    ) VALUES (
      v_raj_tenant, v_ra_pay, v_ra_xfm_bill, 300000
    );

    -- Bill amount_paid was already 300000 + status='partly_paid' from 0063.
    -- No further bill update needed; payment just makes the audit trail complete.

    RAISE NOTICE '[payment-seed] RA-PAY-2026-0001 backfilled · RA-VB-2026-0007 audit trail closed';
  END IF;
END $$;
