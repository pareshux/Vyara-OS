-- ── Raj Group Demo Seed ────────────────────────────────────────────────────────
-- Electrical contracting + switchyard projects demo data.
-- Tenant: Vyara Tiles (a1111111-1111-1111-1111-111111111111) — same instance,
--         new segment. In a real onboarding this would be a dedicated tenant.
-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING throughout).
-- Requires: migration 0039_electrical_demo_schema.sql applied first.

-- ── 1. Electrical pipeline stages ─────────────────────────────────────────────
-- 9 stages for the 'electrical' segment.
-- 'order_awarded' carries is_paving_stage=true → triggers the follow-up task
-- automation, the same way 'paving_stage' does for building materials.

INSERT INTO pipeline_stage
  (id, tenant_id, segment, stage_key, label, order_index, color, is_paving_stage, is_terminal)
VALUES
  ('b1000000-0000-0000-0001-000000000001', 'a1111111-1111-1111-1111-111111111111',
   'electrical', 'enquiry',               'Enquiry',                1, '#60a5fa', false, false),
  ('b1000000-0000-0000-0001-000000000002', 'a1111111-1111-1111-1111-111111111111',
   'electrical', 'site_survey',           'Site Survey',            2, '#a78bfa', false, false),
  ('b1000000-0000-0000-0001-000000000003', 'a1111111-1111-1111-1111-111111111111',
   'electrical', 'boq_submission',        'BOQ Submission',         3, '#fbbf24', false, false),
  ('b1000000-0000-0000-0001-000000000004', 'a1111111-1111-1111-1111-111111111111',
   'electrical', 'order_awarded',         'Order Awarded',          4, '#22c55e', true,  false),
  ('b1000000-0000-0000-0001-000000000005', 'a1111111-1111-1111-1111-111111111111',
   'electrical', 'mobilisation',          'Mobilisation',           5, '#f97316', false, false),
  ('b1000000-0000-0000-0001-000000000006', 'a1111111-1111-1111-1111-111111111111',
   'electrical', 'execution',             'Execution',              6, '#8b5cf6', false, false),
  ('b1000000-0000-0000-0001-000000000007', 'a1111111-1111-1111-1111-111111111111',
   'electrical', 'testing_commissioning', 'Testing & Commissioning',7, '#06b6d4', false, false),
  ('b1000000-0000-0000-0001-000000000008', 'a1111111-1111-1111-1111-111111111111',
   'electrical', 'handover',              'Handover',               8, '#10b981', false, true),
  ('b1000000-0000-0000-0001-000000000009', 'a1111111-1111-1111-1111-111111111111',
   'electrical', 'lost',                  'Lost',                   9, '#ef4444', false, true)
ON CONFLICT (id) DO NOTHING;


-- ── 2. Electrical order stages (tenant-specific) ───────────────────────────────
-- Replaces the generic "In Production / Ready / Dispatched" language with
-- terminology electrical contractors actually use.

INSERT INTO order_stage
  (id, tenant_id, stage_key, label, order_index, color, is_terminal)
VALUES
  ('b2000000-0000-0000-0001-000000000001', 'a1111111-1111-1111-1111-111111111111',
   'po_received',           'PO Received',             1, '#60a5fa', false),
  ('b2000000-0000-0000-0001-000000000002', 'a1111111-1111-1111-1111-111111111111',
   'procurement',           'Procurement',             2, '#a78bfa', false),
  ('b2000000-0000-0000-0001-000000000003', 'a1111111-1111-1111-1111-111111111111',
   'material_at_site',      'Material at Site',        3, '#fbbf24', false),
  ('b2000000-0000-0000-0001-000000000004', 'a1111111-1111-1111-1111-111111111111',
   'under_erection',        'Under Erection',          4, '#f97316', false),
  ('b2000000-0000-0000-0001-000000000005', 'a1111111-1111-1111-1111-111111111111',
   'testing_commissioning', 'Testing & Commissioning', 5, '#06b6d4', false),
  ('b2000000-0000-0000-0001-000000000006', 'a1111111-1111-1111-1111-111111111111',
   'handed_over',           'Handed Over',             6, '#10b981', true),
  ('b2000000-0000-0000-0001-000000000007', 'a1111111-1111-1111-1111-111111111111',
   'wc_cancelled',          'Cancelled',               7, '#ef4444', true)
ON CONFLICT (id) DO NOTHING;


-- ── 3. Electrical products (10 SKUs) ──────────────────────────────────────────
-- Representative switchyard / substation material list.

INSERT INTO product
  (id, tenant_id, sku_code, name, category, unit, base_price, description, is_active)
VALUES
  ('c1000000-0000-0000-0001-000000000001', 'a1111111-1111-1111-1111-111111111111',
   'EL-CABLE-11KV-95',
   'HT Cable 11kV XLPE 3Cx95 sqmm Armoured',
   'Cable', 'rmt', 850.00,
   '11kV grade, XLPE insulated, 3 core 95sqmm, armoured, as per IS 7098 Pt-2', true),

  ('c1000000-0000-0000-0001-000000000002', 'a1111111-1111-1111-1111-111111111111',
   'EL-CABLE-LT-95',
   'LT Cable 1.1kV XLPE 3.5Cx95 sqmm',
   'Cable', 'rmt', 280.00,
   '1.1kV grade, XLPE insulated, 3.5 core 95sqmm, as per IS 7098 Pt-1', true),

  ('c1000000-0000-0000-0001-000000000003', 'a1111111-1111-1111-1111-111111111111',
   'EL-TRANS-250KVA',
   'Distribution Transformer 250kVA 11/0.433kV',
   'Transformer', 'nos', 320000.00,
   'ONAN cooled, 11kV/433V, CRGO core, BIS certified, as per IS 1180', true),

  ('c1000000-0000-0000-0001-000000000004', 'a1111111-1111-1111-1111-111111111111',
   'EL-TRANS-100KVA',
   'Distribution Transformer 100kVA 11/0.433kV',
   'Transformer', 'nos', 185000.00,
   'ONAN cooled, 11kV/433V, CRGO core, as per IS 1180', true),

  ('c1000000-0000-0000-0001-000000000005', 'a1111111-1111-1111-1111-111111111111',
   'EL-VCB-11KV-630A',
   'Vacuum Circuit Breaker 11kV 630A',
   'Switchgear', 'nos', 210000.00,
   'VCB, 11kV, 630A, motorised, with numerical protection relay, as per IS 13118', true),

  ('c1000000-0000-0000-0001-000000000006', 'a1111111-1111-1111-1111-111111111111',
   'EL-GOS-11KV',
   'Gang Operated Switch 11kV',
   'Switchgear', 'nos', 45000.00,
   '11kV, double break, gang operated isolator, as per IS 9921', true),

  ('c1000000-0000-0000-0001-000000000007', 'a1111111-1111-1111-1111-111111111111',
   'EL-PANEL-CRP',
   'Control & Relay Panel (CRP)',
   'Panel', 'nos', 145000.00,
   'Steel enclosure IP42, with numerical protection relays, CT/PT wiring, mimic', true),

  ('c1000000-0000-0000-0001-000000000008', 'a1111111-1111-1111-1111-111111111111',
   'EL-PANEL-LT-630A',
   'LT Panel Board 415V 630A',
   'Panel', 'nos', 95000.00,
   'MCCB incomer 630A, 6 way outgoing MCB, IP54 powder-coated enclosure', true),

  ('c1000000-0000-0000-0001-000000000009', 'a1111111-1111-1111-1111-111111111111',
   'EL-LA-11KV',
   'Lightning Arrestor 11kV',
   'Hardware', 'nos', 8500.00,
   'Metal oxide, gapless, 10kA discharge class, as per IEC 60099-4', true),

  ('c1000000-0000-0000-0001-000000000010', 'a1111111-1111-1111-1111-111111111111',
   'EL-EARTH-GI-40X6',
   'Earth Mat GI Flat 40x6mm',
   'Civil', 'rmt', 95.00,
   'Galvanised iron flat for substation earth mat, as per IS 3043', true)

ON CONFLICT (tenant_id, sku_code) DO NOTHING;


-- ── 4. Demo firms ──────────────────────────────────────────────────────────────

INSERT INTO firm
  (id, tenant_id, name, type, city, state, phone, email, website, notes,
   created_by, updated_by)
VALUES
  ('d1000000-0000-0000-0001-000000000001', 'a1111111-1111-1111-1111-111111111111',
   'Gujarat Energy Transmission Corp (GETCO)',
   'government', 'Vadodara', 'Gujarat',
   '0265-2350000', 'procurement@getco.energy', 'https://www.getco.energy',
   'State HV transmission utility. Key client for 33/11kV and 66/11kV switchyard projects across Gujarat. Payments processed by circle office. RA Bills certified by PMC before submission.',
   'e453edcc-3841-43ae-8ea4-3f9be141ceca',
   'e453edcc-3841-43ae-8ea4-3f9be141ceca'),

  ('d1000000-0000-0000-0001-000000000002', 'a1111111-1111-1111-1111-111111111111',
   'Torrent Power Ltd',
   'other', 'Ahmedabad', 'Gujarat',
   '079-40507000', 'projects@torrentpower.com', 'https://www.torrentpower.com',
   'Private distribution licensee for Ahmedabad and Surat circles. Distribution network upgrades and new substation projects.',
   'e453edcc-3841-43ae-8ea4-3f9be141ceca',
   'e453edcc-3841-43ae-8ea4-3f9be141ceca'),

  ('d1000000-0000-0000-0001-000000000003', 'a1111111-1111-1111-1111-111111111111',
   'PMC Techno Consultants Pvt Ltd',
   'architect', 'Ahmedabad', 'Gujarat',
   '079-26580345', 'info@pmctechno.in', NULL,
   'PMC engaged by GETCO for switchyard projects. Approves BOQs, certifies RA Bills, and issues completion certificates.',
   'e453edcc-3841-43ae-8ea4-3f9be141ceca',
   'e453edcc-3841-43ae-8ea4-3f9be141ceca')

ON CONFLICT (id) DO NOTHING;


-- ── 5. Demo contacts ───────────────────────────────────────────────────────────

INSERT INTO contact
  (id, tenant_id, firm_id, full_name, role_title, phone, email,
   created_by, updated_by)
VALUES
  ('e1000000-0000-0000-0001-000000000001', 'a1111111-1111-1111-1111-111111111111',
   'd1000000-0000-0000-0001-000000000001',
   'Dinesh Patel', 'Project Manager — HT Projects',
   '9824012345', 'dinesh.patel@getco.energy',
   'e453edcc-3841-43ae-8ea4-3f9be141ceca',
   'e453edcc-3841-43ae-8ea4-3f9be141ceca'),

  ('e1000000-0000-0000-0001-000000000002', 'a1111111-1111-1111-1111-111111111111',
   'd1000000-0000-0000-0001-000000000002',
   'Amit Shah', 'Senior Purchase Manager',
   '9825067890', 'amit.shah@torrentpower.com',
   'e453edcc-3841-43ae-8ea4-3f9be141ceca',
   'e453edcc-3841-43ae-8ea4-3f9be141ceca'),

  ('e1000000-0000-0000-0001-000000000003', 'a1111111-1111-1111-1111-111111111111',
   'd1000000-0000-0000-0001-000000000003',
   'Kiran Mehta', 'Senior Consultant',
   '9898123456', 'kiran.mehta@pmctechno.in',
   'e453edcc-3841-43ae-8ea4-3f9be141ceca',
   'e453edcc-3841-43ae-8ea4-3f9be141ceca')

ON CONFLICT (id) DO NOTHING;


-- ── 6. Demo project ────────────────────────────────────────────────────────────
-- Mid-project state: currently at Execution stage.
-- GETCO is the buyer (client). PMC Techno is the specifier/consultant.

INSERT INTO project
  (id, tenant_id, name, segment, current_stage_id,
   buyer_firm_id, architect_firm_id,
   city, state, estimated_value,
   owner_id, created_by, updated_by)
VALUES (
  'f1000000-0000-0000-0001-000000000001',
  'a1111111-1111-1111-1111-111111111111',
  '33/11 kV Switchyard — Rajkot (GETCO)',
  'electrical',
  'b1000000-0000-0000-0001-000000000006',   -- Execution stage
  'd1000000-0000-0000-0001-000000000001',   -- GETCO as client
  'd1000000-0000-0000-0001-000000000003',   -- PMC Techno as consultant
  'Rajkot', 'Gujarat',
  12500000.00,                              -- ₹1.25 Cr estimated
  'e453edcc-3841-43ae-8ea4-3f9be141ceca',
  'e453edcc-3841-43ae-8ea4-3f9be141ceca',
  'e453edcc-3841-43ae-8ea4-3f9be141ceca'
) ON CONFLICT (id) DO NOTHING;


-- ── 7. Project stakeholders ────────────────────────────────────────────────────

INSERT INTO project_stakeholder
  (id, tenant_id, project_id, contact_id, role)
VALUES
  ('e2000000-0000-0000-0001-000000000001', 'a1111111-1111-1111-1111-111111111111',
   'f1000000-0000-0000-0001-000000000001',
   'e1000000-0000-0000-0001-000000000001',   -- Dinesh Patel (GETCO)
   'buyer'),

  ('e2000000-0000-0000-0001-000000000002', 'a1111111-1111-1111-1111-111111111111',
   'f1000000-0000-0000-0001-000000000001',
   'e1000000-0000-0000-0001-000000000003',   -- Kiran Mehta (PMC)
   'specifier')

ON CONFLICT (id) DO NOTHING;


-- ── 8. Quotation (BOQ — accepted) ─────────────────────────────────────────────
-- 6-line BOQ covering main switchyard materials.
-- Totals: subtotal ₹21,73,500 · no discount · total = subtotal.
-- GST is applied at the invoice stage, not here.

INSERT INTO quotation
  (id, tenant_id, project_id, quotation_number, status,
   valid_until, subtotal, discount_pct, total,
   sent_at, accepted_at,
   created_by, updated_by)
VALUES (
  'f2000000-0000-0000-0001-000000000001',
  'a1111111-1111-1111-1111-111111111111',
  'f1000000-0000-0000-0001-000000000001',
  'RAJ-Q-2026-0001',
  'accepted',
  '2026-03-31',
  2173500.00,   -- sum of line_totals below
  0.00,
  2173500.00,
  '2026-03-05 10:00:00+05:30',
  '2026-03-15 14:30:00+05:30',
  'e453edcc-3841-43ae-8ea4-3f9be141ceca',
  'e453edcc-3841-43ae-8ea4-3f9be141ceca'
) ON CONFLICT (tenant_id, quotation_number) DO NOTHING;

INSERT INTO quotation_line
  (id, tenant_id, quotation_id,
   product_id, product_name, sku_code, unit,
   quantity, unit_price, discount_pct, line_total, sort_order)
VALUES
  ('f3000000-0000-0000-0001-000000000001', 'a1111111-1111-1111-1111-111111111111',
   'f2000000-0000-0000-0001-000000000001',
   'c1000000-0000-0000-0001-000000000001',
   'HT Cable 11kV XLPE 3Cx95 sqmm Armoured', 'EL-CABLE-11KV-95', 'rmt',
   500, 850.00, 0, 425000.00, 1),

  ('f3000000-0000-0000-0001-000000000002', 'a1111111-1111-1111-1111-111111111111',
   'f2000000-0000-0000-0001-000000000001',
   'c1000000-0000-0000-0001-000000000003',
   'Distribution Transformer 250kVA 11/0.433kV', 'EL-TRANS-250KVA', 'nos',
   2, 320000.00, 0, 640000.00, 2),

  ('f3000000-0000-0000-0001-000000000003', 'a1111111-1111-1111-1111-111111111111',
   'f2000000-0000-0000-0001-000000000001',
   'c1000000-0000-0000-0001-000000000005',
   'Vacuum Circuit Breaker 11kV 630A', 'EL-VCB-11KV-630A', 'nos',
   4, 210000.00, 0, 840000.00, 3),

  ('f3000000-0000-0000-0001-000000000004', 'a1111111-1111-1111-1111-111111111111',
   'f2000000-0000-0000-0001-000000000001',
   'c1000000-0000-0000-0001-000000000007',
   'Control & Relay Panel (CRP)', 'EL-PANEL-CRP', 'nos',
   1, 145000.00, 0, 145000.00, 4),

  ('f3000000-0000-0000-0001-000000000005', 'a1111111-1111-1111-1111-111111111111',
   'f2000000-0000-0000-0001-000000000001',
   'c1000000-0000-0000-0001-000000000008',
   'LT Panel Board 415V 630A', 'EL-PANEL-LT-630A', 'nos',
   1, 95000.00, 0, 95000.00, 5),

  ('f3000000-0000-0000-0001-000000000006', 'a1111111-1111-1111-1111-111111111111',
   'f2000000-0000-0000-0001-000000000001',
   'c1000000-0000-0000-0001-000000000010',
   'Earth Mat GI Flat 40x6mm', 'EL-EARTH-GI-40X6', 'rmt',
   300, 95.00, 0, 28500.00, 6)

ON CONFLICT (id) DO NOTHING;


-- ── 9. Sales order (Under Erection) ───────────────────────────────────────────

INSERT INTO sales_order
  (id, tenant_id, order_number, project_id, quote_id,
   buyer_firm_id, current_stage_id,
   order_date, expected_delivery_at, value,
   owner_id, created_by, updated_by)
VALUES (
  'f4000000-0000-0000-0001-000000000001',
  'a1111111-1111-1111-1111-111111111111',
  'RAJ-WO-2026-0001',
  'f1000000-0000-0000-0001-000000000001',
  'f2000000-0000-0000-0001-000000000001',
  'd1000000-0000-0000-0001-000000000001',   -- GETCO
  'b2000000-0000-0000-0001-000000000004',   -- Under Erection stage
  '2026-03-20',
  '2026-08-31',
  2173500.00,
  'e453edcc-3841-43ae-8ea4-3f9be141ceca',
  'e453edcc-3841-43ae-8ea4-3f9be141ceca',
  'e453edcc-3841-43ae-8ea4-3f9be141ceca'
) ON CONFLICT (tenant_id, order_number) DO NOTHING;

INSERT INTO sales_order_line
  (id, tenant_id, sales_order_id,
   product_id, product_name, sku_code, unit,
   quantity, unit_price, line_total, sort_order)
VALUES
  ('f4000000-0000-0000-0001-000000000011', 'a1111111-1111-1111-1111-111111111111',
   'f4000000-0000-0000-0001-000000000001',
   'c1000000-0000-0000-0001-000000000001',
   'HT Cable 11kV XLPE 3Cx95 sqmm Armoured', 'EL-CABLE-11KV-95', 'rmt',
   500, 850.00, 425000.00, 1),

  ('f4000000-0000-0000-0001-000000000012', 'a1111111-1111-1111-1111-111111111111',
   'f4000000-0000-0000-0001-000000000001',
   'c1000000-0000-0000-0001-000000000003',
   'Distribution Transformer 250kVA 11/0.433kV', 'EL-TRANS-250KVA', 'nos',
   2, 320000.00, 640000.00, 2),

  ('f4000000-0000-0000-0001-000000000013', 'a1111111-1111-1111-1111-111111111111',
   'f4000000-0000-0000-0001-000000000001',
   'c1000000-0000-0000-0001-000000000005',
   'Vacuum Circuit Breaker 11kV 630A', 'EL-VCB-11KV-630A', 'nos',
   4, 210000.00, 840000.00, 3),

  ('f4000000-0000-0000-0001-000000000014', 'a1111111-1111-1111-1111-111111111111',
   'f4000000-0000-0000-0001-000000000001',
   'c1000000-0000-0000-0001-000000000007',
   'Control & Relay Panel (CRP)', 'EL-PANEL-CRP', 'nos',
   1, 145000.00, 145000.00, 4),

  ('f4000000-0000-0000-0001-000000000015', 'a1111111-1111-1111-1111-111111111111',
   'f4000000-0000-0000-0001-000000000001',
   'c1000000-0000-0000-0001-000000000008',
   'LT Panel Board 415V 630A', 'EL-PANEL-LT-630A', 'nos',
   1, 95000.00, 95000.00, 5),

  ('f4000000-0000-0000-0001-000000000016', 'a1111111-1111-1111-1111-111111111111',
   'f4000000-0000-0000-0001-000000000001',
   'c1000000-0000-0000-0001-000000000010',
   'Earth Mat GI Flat 40x6mm', 'EL-EARTH-GI-40X6', 'rmt',
   300, 95.00, 28500.00, 6)

ON CONFLICT (id) DO NOTHING;


-- ── 10. Invoice — RA Bill #1 (overdue, ready for collections demo) ─────────────
-- Mobilisation claim: ₹2,50,000 + 18% GST − 5% retention.
-- invoice_date: 2026-04-30 · due_date: 2026-05-30 → ~21 days overdue today.
-- Money:
--   subtotal       ₹2,50,000
--   gst (18%)      ₹  45,000
--   total          ₹2,95,000
--   retention (5%) ₹  14,750
--   billed_amount  ₹2,80,250   ← what GETCO actually owes now
--   paid_amount    ₹       0   ← nothing received yet

INSERT INTO invoice
  (id, tenant_id, invoice_number, external_invoice_number, source,
   project_id, sales_order_id, buyer_firm_id,
   invoice_date, due_date, payment_terms_days,
   subtotal, gst_pct, gst_amount, total,
   retention_pct, retention_amount, billed_amount, paid_amount,
   is_running_bill, running_bill_seq, is_final_bill,
   status, notes,
   created_by, updated_by)
VALUES (
  'f5000000-0000-0000-0001-000000000001',
  'a1111111-1111-1111-1111-111111111111',
  'EL-INV-2026-0001',
  'RAJ/GETCO/RKT/RA-1/2026',
  'manual',
  'f1000000-0000-0000-0001-000000000001',
  'f4000000-0000-0000-0001-000000000001',
  'd1000000-0000-0000-0001-000000000001',   -- GETCO
  '2026-04-30',
  '2026-05-30',
  30,
  250000.00,
  18,
  45000.00,
  295000.00,
  5,
  14750.00,
  280250.00,
  0.00,
  true,
  1,
  false,
  'sent',
  'Mobilisation advance claim — 10% of contract value. PMC certified on 2026-04-28.',
  'e453edcc-3841-43ae-8ea4-3f9be141ceca',
  'e453edcc-3841-43ae-8ea4-3f9be141ceca'
) ON CONFLICT (tenant_id, invoice_number) DO NOTHING;


-- ── 11. Collection — overdue, first dunning not yet sent ──────────────────────
-- The demo starts here: RA Bill #1 is in 'overdue' stage with no dunning sent.
-- Walk-through: open Collections → see it flagged → send WhatsApp → log PTP.

INSERT INTO collection
  (tenant_id, invoice_id, current_stage_id,
   escalation_level, last_dunning_at, next_action_at,
   created_by)
SELECT
  'a1111111-1111-1111-1111-111111111111',
  'f5000000-0000-0000-0001-000000000001',
  'd0000000-0000-0000-0000-000000000003',   -- overdue stage
  0,
  NULL,                                      -- not yet dunned — demo triggers first WA live
  NOW(),                                     -- action due now
  'e453edcc-3841-43ae-8ea4-3f9be141ceca'
WHERE NOT EXISTS (
  SELECT 1 FROM collection
  WHERE invoice_id = 'f5000000-0000-0000-0001-000000000001'
);
