-- Capability: Cross-cutting (demo data attribution)
-- Re-attributes existing Raj seed data to the 6 demo personas (created by
-- scripts/seed-raj-team.ts) + gap-fills the missing pieces (fresh lead,
-- today's visit, today's attendance, open complaints) so each persona's
-- sign-in lands on a workspace with realistic, demoable state.
--
-- Idempotent — re-running this on a fresh DB is fine; UPDATEs are safe
-- and INSERTs use ON CONFLICT or guard clauses.

DO $$
DECLARE
  v_tenant   UUID;
  v_sandeep  UUID;
  v_rakesh   UUID;
  v_anil     UUID;
  v_mehul    UUID;
  v_priya    UUID;
  v_vikas    UUID;
  v_lead_stage_new UUID;
  v_visit_purpose UUID;
  v_complaint_type UUID;
  v_complaint_severity UUID;
  v_complaint_stage UUID;
  v_firm_chemicals UUID;
  v_firm_pharma UUID;
  v_firm_adani UUID;
  v_firm_lt UUID;
BEGIN
  SELECT id INTO v_tenant FROM tenant WHERE slug = 'raj-avinsys';
  IF v_tenant IS NULL THEN
    RAISE NOTICE '[0074] Raj tenant not found — skipping';
    RETURN;
  END IF;

  -- Resolve persona user IDs by full_name + department
  SELECT id INTO v_sandeep FROM user_profile WHERE tenant_id = v_tenant AND department = 'management';
  SELECT id INTO v_rakesh  FROM user_profile WHERE tenant_id = v_tenant AND department = 'projects';
  SELECT id INTO v_anil    FROM user_profile WHERE tenant_id = v_tenant AND department = 'field_sales';
  SELECT id INTO v_mehul   FROM user_profile WHERE tenant_id = v_tenant AND department = 'procurement';
  SELECT id INTO v_priya   FROM user_profile WHERE tenant_id = v_tenant AND department = 'accounts';
  SELECT id INTO v_vikas   FROM user_profile WHERE tenant_id = v_tenant AND department = 'service';

  IF v_sandeep IS NULL OR v_rakesh IS NULL OR v_anil IS NULL OR v_mehul IS NULL OR v_priya IS NULL OR v_vikas IS NULL THEN
    RAISE NOTICE '[0074] not all 6 personas seeded — run scripts/seed-raj-team.ts first. Skipping.';
    RETURN;
  END IF;

  RAISE NOTICE '[0074] Resolved 6 personas. Re-attributing seed data...';

  -- ─── Re-attribute Quotes to Rakesh (PM owns the quote in EPC) ──
  UPDATE quotation
    SET created_by = v_rakesh,
        updated_by = v_rakesh
  WHERE tenant_id = v_tenant
    AND created_by IS NULL
    AND quotation_number LIKE 'RA-QT%';

  -- ─── Re-attribute Projects to Rakesh ──────────────────────────
  UPDATE project
    SET owner_id = v_rakesh,
        updated_at = now()
  WHERE tenant_id = v_tenant;

  -- ─── Re-attribute PRs (requested_by) to Rakesh ────────────────
  -- PRs are raised by project managers; in Raj's case, Rakesh.
  UPDATE purchase_requisition
    SET requested_by = v_rakesh,
        updated_at = now(),
        updated_by = v_rakesh
  WHERE tenant_id = v_tenant;

  -- ─── Re-attribute POs (created_by) to Mehul ───────────────────
  UPDATE purchase_order
    SET created_by = v_mehul,
        updated_by = v_mehul
  WHERE tenant_id = v_tenant
    AND deleted_at IS NULL;

  -- ─── Re-attribute Blanket POs to Mehul ────────────────────────
  UPDATE blanket_po
    SET created_by = v_mehul
  WHERE tenant_id = v_tenant
    AND deleted_at IS NULL;

  -- ─── Re-attribute Vendor Bills to Priya ───────────────────────
  UPDATE vendor_bill
    SET created_by = v_priya,
        updated_by = v_priya
  WHERE tenant_id = v_tenant
    AND deleted_at IS NULL;

  -- ─── Re-attribute Vendor Payments to Priya ────────────────────
  UPDATE vendor_payment
    SET created_by = v_priya
  WHERE tenant_id = v_tenant
    AND deleted_at IS NULL;

  -- ─── Re-attribute GRNs to Mehul (stores still reports up to him) ─
  UPDATE goods_receipt_note
    SET created_by = v_mehul,
        updated_by = v_mehul
  WHERE tenant_id = v_tenant
    AND deleted_at IS NULL;

  -- ─── Re-attribute Job-work challans to Mehul ─────────────────
  UPDATE job_work_challan
    SET created_by = v_mehul
  WHERE tenant_id = v_tenant
    AND deleted_at IS NULL;

  -- ─── Gap-fill: Anil's today attendance ────────────────────────
  -- Anil checks in this morning, on duty, ready for visits.
  INSERT INTO field_attendance (tenant_id, user_id, attendance_date, status_for_day, check_in_at, check_in_lat, check_in_lng, check_in_odometer_km)
  VALUES (
    v_tenant, v_anil, CURRENT_DATE, 'on_duty',
    NOW() - INTERVAL '3 hours',
    21.1702, 72.8311,  -- Surat office area
    42810
  )
  ON CONFLICT DO NOTHING;

  -- ─── Gap-fill: Fresh lead from yesterday, owned by Anil ───────
  -- Resolve "new" lead_stage — prefer tenant-scoped 'new' if present, fall back to system row
  SELECT id INTO v_lead_stage_new
  FROM lead_stage
  WHERE (tenant_id = v_tenant OR tenant_id IS NULL)
    AND stage_key = 'new'
  ORDER BY tenant_id NULLS LAST LIMIT 1;
  IF v_lead_stage_new IS NULL THEN
    SELECT id INTO v_lead_stage_new
    FROM lead_stage
    WHERE tenant_id = v_tenant OR tenant_id IS NULL
    ORDER BY order_index LIMIT 1;
  END IF;

  -- Resolve a target firm for the lead
  SELECT id INTO v_firm_chemicals FROM firm WHERE tenant_id = v_tenant AND name ILIKE '%chemicals%' LIMIT 1;

  IF v_lead_stage_new IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM lead WHERE tenant_id = v_tenant AND title LIKE '%Vapi Specialty Chemicals%'
  ) THEN
    INSERT INTO lead (
      tenant_id, lead_number, title, segment, current_stage_id,
      buyer_firm_id, contact_name_raw, contact_phone_raw,
      city, state, estimated_value, expected_close_at,
      owner_id, notes, created_at, updated_at
    ) VALUES (
      v_tenant, 'RA-LD-2026-0010', 'Vapi Specialty Chemicals — Panel + EPC enquiry', 'corporate', v_lead_stage_new,
      v_firm_chemicals, 'Mr Patel · Plant Head', '+91 98253 22118',
      'Vapi', 'Gujarat', 8500000, CURRENT_DATE + INTERVAL '45 days',
      v_anil, 'Met at GIDC industry meet yesterday. Plant expansion — needs 2× MCC panels + cabling. Said budget cleared, wants quote in 2 weeks.',
      NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'
    );
    RAISE NOTICE '[0074] Fresh lead seeded for Anil';
  END IF;

  -- ─── Gap-fill: Anil's planned visit today ─────────────────────
  -- A visit to the L&T project site (existing project context)
  SELECT id INTO v_firm_lt FROM firm WHERE tenant_id = v_tenant AND name ILIKE '%L&T%' LIMIT 1;
  SELECT id INTO v_visit_purpose FROM visit_purpose WHERE code = 'site_visit' LIMIT 1;
  IF v_visit_purpose IS NULL THEN
    SELECT id INTO v_visit_purpose FROM visit_purpose ORDER BY sort_order NULLS LAST LIMIT 1;
  END IF;

  IF v_firm_lt IS NOT NULL AND v_visit_purpose IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM field_visit WHERE tenant_id = v_tenant AND user_id = v_anil AND visited_at::date = CURRENT_DATE
  ) THEN
    INSERT INTO field_visit (
      tenant_id, user_id, visited_at, visit_purpose_id, firm_id,
      lat, lng, location_label, notes_text, state, created_at
    ) VALUES (
      v_tenant, v_anil, NOW() - INTERVAL '15 minutes', v_visit_purpose, v_firm_lt,
      21.7644, 72.1483, 'L&T Vadinar site · Jamnagar district',
      'Pre-commissioning site check. Customer asked for AMC quote.',
      'in_progress', NOW() - INTERVAL '15 minutes'
    );
    RAISE NOTICE '[0074] Today visit (in-progress) seeded for Anil';
  END IF;

  -- ─── Gap-fill: 2 open complaints assigned to Vikas ────────────
  SELECT id INTO v_complaint_type FROM complaint_type_master WHERE tenant_id = v_tenant OR tenant_id IS NULL ORDER BY tenant_id NULLS LAST LIMIT 1;
  SELECT id INTO v_complaint_severity FROM severity_master WHERE tenant_id = v_tenant OR tenant_id IS NULL ORDER BY tenant_id NULLS LAST LIMIT 1;
  SELECT id INTO v_complaint_stage FROM complaint_stage WHERE (tenant_id = v_tenant OR tenant_id IS NULL) AND stage_key IN ('assigned', 'in_progress') ORDER BY order_index LIMIT 1;

  SELECT id INTO v_firm_pharma FROM firm WHERE tenant_id = v_tenant AND name ILIKE '%pharma%' LIMIT 1;
  SELECT id INTO v_firm_adani  FROM firm WHERE tenant_id = v_tenant AND name ILIKE '%adani%' LIMIT 1;

  IF v_complaint_type IS NOT NULL AND v_complaint_severity IS NOT NULL AND v_complaint_stage IS NOT NULL THEN
    -- Open complaint 1
    IF v_firm_adani IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM complaint WHERE tenant_id = v_tenant AND title LIKE '%Adani Hazira%'
    ) THEN
      INSERT INTO complaint (
        tenant_id, complaint_number, title, description,
        type_id, severity_id, current_stage_id,
        firm_id, assignee_id, assigned_at, assigned_by,
        created_at
      ) VALUES (
        v_tenant, 'RA-CMP-2026-0008', 'Adani Hazira · MCC panel tripping intermittently',
        'Customer reports intermittent tripping on the main MCC panel during peak loads. Started 2 days ago. Needs urgent site visit.',
        v_complaint_type, v_complaint_severity, v_complaint_stage,
        v_firm_adani, v_vikas, NOW() - INTERVAL '4 hours', v_sandeep,
        NOW() - INTERVAL '5 hours'
      );
    END IF;

    -- Open complaint 2
    IF v_firm_pharma IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM complaint WHERE tenant_id = v_tenant AND title LIKE '%Anand Pharma%'
    ) THEN
      INSERT INTO complaint (
        tenant_id, complaint_number, title, description,
        type_id, severity_id, current_stage_id,
        firm_id, assignee_id, assigned_at, assigned_by,
        created_at
      ) VALUES (
        v_tenant, 'RA-CMP-2026-0009', 'Anand Pharma · APFC panel — capacitor bank failure',
        'Customer reports one capacitor bank in APFC panel showing zero output. Likely contactor failure. Scheduled visit needed.',
        v_complaint_type, v_complaint_severity, v_complaint_stage,
        v_firm_pharma, v_vikas, NOW() - INTERVAL '1 day', v_sandeep,
        NOW() - INTERVAL '1 day' - INTERVAL '2 hours'
      );
    END IF;
    RAISE NOTICE '[0074] Open complaints seeded for Vikas';
  END IF;

  RAISE NOTICE '[0074] Done — Raj demo data re-attributed and gap-filled.';
END $$;
