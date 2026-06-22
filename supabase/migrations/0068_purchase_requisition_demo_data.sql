-- ============================================================
-- 0068_purchase_requisition_demo_data.sql — Sample PRs (P4α)
--
-- 3 PRs across statuses for both tenants:
--
--   1. VT-PR-2026-0001 (Vyara · draft · ₹1.80L)
--      Q3 pigment top-up for production. Sits in draft so the user
--      can walk submit → manager approval flow.
--
--   2. RA-PR-2026-0001 (Raj · submitted/pending · ₹4.20L)
--      Cable supplies for Adani EPC project. Already submitted with
--      an approval_request pending manager (mid-band 50k-5L).
--      User can hit /approvals → approve to flip it to 'approved'.
--
--   3. RA-PR-2026-0002 (Raj · approved · ₹2.80L)
--      Panel components for L&T Vadinar. Already approved end-to-end
--      so the user sees the "Ready to raise PO" hint card + Approved
--      tile reflects.
--
-- Idempotent via fixed UUIDs + IF NOT EXISTS.
-- ============================================================

DO $$
DECLARE
  v_vyara_tenant     UUID;
  v_raj_tenant       UUID;
  v_vyara_admin      UUID;
  v_raj_admin        UUID;
  v_vyara_project    UUID;
  v_raj_project      UUID;
  v_raj_p_mid        UUID;
  v_vt_pgm_vendor    UUID;
  v_ra_cbl_vendor    UUID;
  v_ra_sch_vendor    UUID;

  v_vt_pr1           UUID := 'b1000000-0000-0000-0004-000000000001'::uuid;
  v_ra_pr1           UUID := 'b1000000-0000-0000-0004-000000000101'::uuid;
  v_ra_pr2           UUID := 'b1000000-0000-0000-0004-000000000102'::uuid;
  v_ar_id            UUID;
BEGIN
  SELECT id INTO v_vyara_tenant FROM tenant WHERE slug = 'vyara-tiles';
  SELECT id INTO v_raj_tenant   FROM tenant WHERE slug = 'raj-avinsys';
  SELECT id INTO v_vyara_admin  FROM user_profile WHERE tenant_id = v_vyara_tenant AND role = 'admin' AND is_active = true ORDER BY created_at LIMIT 1;
  SELECT id INTO v_raj_admin    FROM user_profile WHERE tenant_id = v_raj_tenant   AND role = 'admin' AND is_active = true ORDER BY created_at LIMIT 1;

  -- Pick first project per tenant (any project works for the demo)
  SELECT id INTO v_vyara_project FROM project WHERE tenant_id = v_vyara_tenant AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1;
  SELECT id INTO v_raj_project   FROM project WHERE tenant_id = v_raj_tenant   AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1;

  SELECT id INTO v_vt_pgm_vendor FROM vendor WHERE tenant_id = v_vyara_tenant AND code = 'V-PGM-01';
  SELECT id INTO v_ra_cbl_vendor FROM vendor WHERE tenant_id = v_raj_tenant   AND code = 'V-CBL-01';
  SELECT id INTO v_ra_sch_vendor FROM vendor WHERE tenant_id = v_raj_tenant   AND code = 'V-SCH-01';

  -- ─── Vyara · VT-PR-2026-0001 · draft · ₹1.80L ─────────────────
  IF NOT EXISTS (SELECT 1 FROM purchase_requisition WHERE id = v_vt_pr1) THEN
    INSERT INTO purchase_requisition (
      id, tenant_id, project_id, cost_center,
      requested_by, required_by_date, justification,
      estimated_value, status, notes,
      created_by, updated_by
    ) VALUES (
      v_vt_pr1, v_vyara_tenant, v_vyara_project,
      'Plant-1 / Production', v_vyara_admin,
      CURRENT_DATE + 21,
      'Q3 production schedule — Red and Yellow ranges running low. Need ~3 weeks before plant 1 runs out of inventory.',
      180000, 'draft',
      'Awaiting confirm of exact mix from Hetal at Surat Pigments before submit.',
      v_vyara_admin, v_vyara_admin
    );

    INSERT INTO purchase_requisition_line (
      tenant_id, pr_id, line_no, description, hsn_code, unit,
      quantity, estimated_rate, estimated_value,
      preferred_vendor_id, specifications
    ) VALUES
      (v_vyara_tenant, v_vt_pr1, 1,
       'Iron Oxide Red (Bayferrox 130M equivalent)', '3204', 'kgs',
       120, 850, 102000, v_vt_pgm_vendor,
       'Bayferrox 130M grade or equivalent. Tinting strength ≥ 95%.'),
      (v_vyara_tenant, v_vt_pr1, 2,
       'Iron Oxide Yellow (Bayferrox 920 equivalent)', '3204', 'kgs',
       80, 975, 78000, v_vt_pgm_vendor,
       'Bayferrox 920 grade or equivalent. Hue check vs Q1 sample.');
  END IF;

  -- ─── Raj · RA-PR-2026-0001 · submitted · ₹4.20L · mid-band ────
  IF NOT EXISTS (SELECT 1 FROM purchase_requisition WHERE id = v_ra_pr1) THEN
    INSERT INTO purchase_requisition (
      id, tenant_id, project_id, cost_center,
      requested_by, required_by_date, justification,
      estimated_value, status, submitted_at, notes,
      created_by, updated_by
    ) VALUES (
      v_ra_pr1, v_raj_tenant, v_raj_project,
      'EPC-Adani', v_raj_admin,
      CURRENT_DATE + 14,
      'Cable schedule for Adani Mundra Phase 2. Existing inventory cleared after Vadinar dispatch — site team needs 1.5 km LT XLPE for the upcoming pull.',
      420000, 'submitted',
      NOW() - INTERVAL '8 hours',
      'Site marked critical — delay impacts paving slab pour scheduled in 3 weeks.',
      v_raj_admin, v_raj_admin
    );

    INSERT INTO purchase_requisition_line (
      tenant_id, pr_id, line_no, description, hsn_code, unit,
      quantity, estimated_rate, estimated_value,
      preferred_vendor_id, specifications
    ) VALUES
      (v_raj_tenant, v_ra_pr1, 1,
       'LT XLPE armoured cable 3.5C × 150 sq.mm', '8544', 'mtr',
       1500, 220, 330000, v_ra_cbl_vendor,
       '1.1 kV grade. Polycab / Havells / Finolex. ISI mark required.'),
      (v_raj_tenant, v_ra_pr1, 2,
       'LT XLPE armoured cable 3.5C × 70 sq.mm', '8544', 'mtr',
       500, 180, 90000, v_ra_cbl_vendor,
       '1.1 kV grade. Same vendor as above for batch consistency.');

    -- Look up mid-band policy + create approval_request
    SELECT id INTO v_raj_p_mid
    FROM approval_policy
    WHERE tenant_id = v_raj_tenant
      AND entity_type = 'purchase_requisition'
      AND min_amount = 50000.01;

    INSERT INTO approval_request (
      tenant_id, policy_id, entity_type, entity_id, amount,
      subject_user_id, status, current_step_order, notes
    ) VALUES (
      v_raj_tenant, v_raj_p_mid, 'purchase_requisition', v_ra_pr1, 420000,
      v_raj_admin, 'pending', 1,
      'Adani EPC cable schedule — site team marked critical.'
    ) RETURNING id INTO v_ar_id;

    UPDATE purchase_requisition SET approval_request_id = v_ar_id WHERE id = v_ra_pr1;
  END IF;

  -- ─── Raj · RA-PR-2026-0002 · approved · ₹2.80L ────────────────
  IF NOT EXISTS (SELECT 1 FROM purchase_requisition WHERE id = v_ra_pr2) THEN
    INSERT INTO purchase_requisition (
      id, tenant_id, project_id, cost_center,
      requested_by, required_by_date, justification,
      estimated_value, status, submitted_at, approved_at, approved_by,
      notes, created_by, updated_by
    ) VALUES (
      v_ra_pr2, v_raj_tenant, v_raj_project,
      'EPC-L&T-Vadinar', v_raj_admin,
      CURRENT_DATE + 28,
      'Panel components for L&T Vadinar phase-2 MCC. Standardised on Schneider — quoted earlier vs vendor list at ₹2.8L.',
      280000, 'approved',
      NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days', v_raj_admin,
      'Already discussed with Vikram (L&T). Specs locked.',
      v_raj_admin, v_raj_admin
    );

    INSERT INTO purchase_requisition_line (
      tenant_id, pr_id, line_no, description, hsn_code, unit,
      quantity, estimated_rate, estimated_value,
      preferred_vendor_id, specifications
    ) VALUES
      (v_raj_tenant, v_ra_pr2, 1,
       'MCCB 250A 4P TM (NSX 250)', '8536', 'nos',
       8, 22000, 176000, v_ra_sch_vendor,
       'NSX 250 series. Thermal-magnetic trip unit. Schneider.'),
      (v_raj_tenant, v_ra_pr2, 2,
       'Contactor 65A AC3 (LC1D series)', '8536', 'nos',
       12, 8000, 96000, v_ra_sch_vendor,
       'LC1D 4-pole. 230V AC coil. Schneider.'),
      (v_raj_tenant, v_ra_pr2, 3,
       'Auxiliary contact block (LAD-N22)', '8536', 'nos',
       12, 667, 8000, v_ra_sch_vendor,
       'Two NO + two NC. For LC1D contactors above.');
  END IF;

  RAISE NOTICE '[pr-seed] Done. Vyara: 1 draft. Raj: 1 submitted (pending mid-band approval), 1 approved.';
END $$;
