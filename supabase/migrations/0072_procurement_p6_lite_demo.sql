-- Procurement P6 lite — sample data for blanket POs + job-work challans.
-- Builds on the vendors seeded by 0057.

DO $$
DECLARE
  v_vyara_tenant  UUID;
  v_raj_tenant    UUID;
  v_ambuja_id     UUID;
  v_pigments_id   UUID;
  v_polycab_id    UUID;
  v_schneider_id  UUID;
  v_admin_vyara   UUID;
  v_admin_raj     UUID;
BEGIN
  SELECT id INTO v_vyara_tenant FROM tenant WHERE slug = 'vyara-tiles';
  SELECT id INTO v_raj_tenant   FROM tenant WHERE slug = 'raj-avinsys';
  IF v_vyara_tenant IS NULL OR v_raj_tenant IS NULL THEN
    RAISE NOTICE '[0072] tenants not yet seeded — skipping demo data';
    RETURN;
  END IF;

  -- Look up vendors by code (created in 0057). If any are missing, skip gracefully.
  SELECT id INTO v_ambuja_id    FROM vendor WHERE tenant_id = v_vyara_tenant AND code = 'V-CEM-01';
  SELECT id INTO v_pigments_id  FROM vendor WHERE tenant_id = v_vyara_tenant AND code = 'V-PGM-01';
  SELECT id INTO v_polycab_id   FROM vendor WHERE tenant_id = v_raj_tenant   AND code = 'V-CBL-01';
  SELECT id INTO v_schneider_id FROM vendor WHERE tenant_id = v_raj_tenant   AND code = 'V-SCH-01';

  IF v_ambuja_id IS NULL OR v_polycab_id IS NULL THEN
    RAISE NOTICE '[0072] expected vendors not found — skipping demo data';
    RETURN;
  END IF;

  -- Admins (for created_by)
  SELECT id INTO v_admin_vyara FROM user_profile WHERE tenant_id = v_vyara_tenant AND role = 'admin' LIMIT 1;
  SELECT id INTO v_admin_raj   FROM user_profile WHERE tenant_id = v_raj_tenant   AND role = 'admin' LIMIT 1;

  -- ─── Blanket POs ──────────────────────────────────────────
  -- Vyara: annual cement rate-contract with Ambuja
  IF NOT EXISTS (SELECT 1 FROM blanket_po WHERE tenant_id = v_vyara_tenant AND bpo_number LIKE 'VT-BPO-2026-%') THEN
    INSERT INTO blanket_po (
      tenant_id, vendor_id, description, hsn_code, unit,
      qty_cap, rate, valid_from, valid_to, payment_terms_days,
      delivery_terms, notes, status, qty_released, created_by
    ) VALUES
    (
      v_vyara_tenant, v_ambuja_id,
      'Ambuja OPC 53 grade cement — 50kg bag', '2523', 'bags',
      10000, 360, '2026-04-01', '2027-03-31', 30,
      'Within 7 days of release order', 'Annual cement contract FY 2026-27.',
      'active', 0, v_admin_vyara
    );
    RAISE NOTICE '[0072] Vyara blanket PO seeded (cement)';
  END IF;

  -- Raj: annual LT cable rate-contract with Polycab
  IF NOT EXISTS (SELECT 1 FROM blanket_po WHERE tenant_id = v_raj_tenant AND bpo_number LIKE 'RA-BPO-2026-%') THEN
    INSERT INTO blanket_po (
      tenant_id, vendor_id, description, hsn_code, unit,
      qty_cap, rate, valid_from, valid_to, payment_terms_days,
      delivery_terms, notes, status, qty_released, created_by
    ) VALUES
    (
      v_raj_tenant, v_polycab_id,
      'Polycab LT XLPE Cu armoured 150 sq mm', '8544', 'mtr',
      15000, 825, '2026-04-01', '2027-03-31', 45,
      'Within 10 days of release; 50-100mtr per release', 'Annual cable contract FY 2026-27 for Adani + L&T sites.',
      'active', 0, v_admin_raj
    );
    -- Second Raj blanket — Schneider components, with one drawdown to show progress
    INSERT INTO blanket_po (
      tenant_id, vendor_id, description, hsn_code, unit,
      qty_cap, rate, valid_from, valid_to, payment_terms_days,
      delivery_terms, notes, status, qty_released, created_by
    ) VALUES
    (
      v_raj_tenant, v_schneider_id,
      'Schneider Electric MCCB 100A 4P', '8536', 'nos',
      500, 18500, '2026-04-01', '2027-03-31', 45,
      'Direct dispatch to project sites; 7-day lead time', 'Schneider panel components annual contract.',
      'active', 120, v_admin_raj   -- 120 of 500 already drawn for demo realism
    );
    RAISE NOTICE '[0072] Raj blanket POs seeded (Polycab cable + Schneider MCCB)';
  END IF;

  -- ─── Job-work challans ───────────────────────────────────
  -- Vyara: pigment sent to job-worker for fine grinding (industry-typical
  -- for the building-materials vertical — pigments often need recutting/
  -- grinding before going into the tile mix)
  IF NOT EXISTS (SELECT 1 FROM job_work_challan WHERE tenant_id = v_vyara_tenant AND challan_number LIKE 'VT-JWC-2026-%') THEN
    INSERT INTO job_work_challan (
      tenant_id, job_worker_id, job_worker_gstin, description, hsn_code,
      unit, qty_sent, rate, process_nature, expected_return_date,
      qty_received_back, qty_scrap, received_back_at, status, notes, created_by
    ) VALUES
    (
      v_vyara_tenant, v_pigments_id,
      (SELECT gstin FROM vendor WHERE id = v_pigments_id),
      'Iron Oxide pigment red — coarse', '3204',
      'kgs', 500, 240, 'machining', CURRENT_DATE - INTERVAL '5 days',
      400, 8, CURRENT_DATE - INTERVAL '3 days', 'partly_received',
      'Sent for fine grinding to powder coating spec. 8kg scrap due to moisture loss; balance 92kg expected by 5 Jul.',
      v_admin_vyara
    );
    RAISE NOTICE '[0072] Vyara job-work challan seeded (pigment grinding)';
  END IF;

  -- Raj: MS plate sent to job-worker for powder coating (EPC-typical — panel
  -- enclosures need PC finish; specialist coater does it, panel returns to
  -- Raj for assembly)
  IF NOT EXISTS (SELECT 1 FROM job_work_challan WHERE tenant_id = v_raj_tenant AND challan_number LIKE 'RA-JWC-2026-%') THEN
    INSERT INTO job_work_challan (
      tenant_id, job_worker_id, job_worker_gstin, description, hsn_code,
      unit, qty_sent, rate, process_nature, expected_return_date,
      qty_received_back, qty_scrap, received_back_at, status, notes, created_by
    ) VALUES
    (
      v_raj_tenant, v_schneider_id,
      (SELECT gstin FROM vendor WHERE id = v_schneider_id),
      'MS panel enclosures 800×600×300 mm', '7308',
      'nos', 12, 4200, 'powder_coating', CURRENT_DATE + INTERVAL '4 days',
      0, 0, NULL, 'sent',
      'Powder coating RAL 7035 grey for L&T Vadinar MCC panels. Per drawing DWG-2026-014.',
      v_admin_raj
    ),
    -- A fully-completed prior challan for the ITC-04 export demo
    (
      v_raj_tenant, v_schneider_id,
      (SELECT gstin FROM vendor WHERE id = v_schneider_id),
      'Copper busbar 200A 30×10mm', '7407',
      'mtr', 24, 1850, 'cutting', CURRENT_DATE - INTERVAL '15 days',
      24, 0, CURRENT_DATE - INTERVAL '12 days', 'fully_received',
      'Cut to size per drawing. Returned on time.',
      v_admin_raj
    );
    RAISE NOTICE '[0072] Raj job-work challans seeded (powder coating + busbar cutting)';
  END IF;
END $$;
