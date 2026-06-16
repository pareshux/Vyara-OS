-- ============================================================
-- 0019_demo_progress_data.sql
--
-- Demo data so the projects list + project headers look alive:
--   - Greenvista Township (Paving) — order ₹35L, 5 tranches with 3 delivered,
--     ~60% billed via 2 RA-bills. Dispatch + billing mini-bars are populated.
--   - Surat Smart City (Closeout) — order ₹82L, all dispatches delivered + POD,
--     3 RA + 1 final bill, retention 5% held. Header shows the closeout gates;
--     retention_released gate is unsatisfied → header is BLOCKED at the dot.
--   - Rajhans Mall (Tracking) — no orders yet; on-track green.
--
-- All UUIDs are deterministic so re-running is idempotent.
-- ============================================================

-- Reference: project IDs from 02_reseed_with_real_uids.sql
-- Greenvista: abcdef00-0000-0000-0000-000000000001 (Paving)
-- Surat SC:   abcdef00-0000-0000-0000-000000000002 (was Quoting → now Closeout via 0018)
-- Rajhans:    abcdef00-0000-0000-0000-000000000003 (Tracking)


-- ─── 1. Sales orders ────────────────────────────────────────────────────────
-- Greenvista order
INSERT INTO sales_order (id, tenant_id, project_id, quote_id, buyer_firm_id,
                         current_stage_id, expected_delivery_at, value, notes,
                         owner_id, order_date, created_by, updated_by, created_at)
VALUES
  ('d1000000-0000-0000-0000-000000000001'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'abcdef00-0000-0000-0000-000000000001'::uuid,
   NULL,
   'd0000000-0000-0000-0000-000000000002'::uuid,
   'a0000000-0000-0000-0000-000000000004'::uuid,  -- Dispatched
   (CURRENT_DATE + interval '20 days')::date,
   3500000.00,
   'Greenvista township paving — phased delivery across 5 sections.',
   'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
   (CURRENT_DATE - interval '30 days')::date,
   'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
   'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
   now() - interval '30 days')
ON CONFLICT (id) DO NOTHING;

-- Surat Smart City order (Closeout)
INSERT INTO sales_order (id, tenant_id, project_id, quote_id, buyer_firm_id,
                         current_stage_id, expected_delivery_at, value, notes,
                         owner_id, order_date, created_by, updated_by, created_at)
VALUES
  ('d1000000-0000-0000-0000-000000000002'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'abcdef00-0000-0000-0000-000000000002'::uuid,
   NULL,
   'd0000000-0000-0000-0000-000000000003'::uuid,
   'a0000000-0000-0000-0000-000000000005'::uuid,  -- Delivered
   (CURRENT_DATE - interval '14 days')::date,
   8200000.00,
   'Smart City Sector 5 footpath project. Final retention pending.',
   '01b929ba-73e6-458e-bb7b-ab3319376d06'::uuid,
   (CURRENT_DATE - interval '120 days')::date,
   '98bcb345-ff63-4bc0-9587-e53bad54f367'::uuid,
   '98bcb345-ff63-4bc0-9587-e53bad54f367'::uuid,
   now() - interval '120 days')
ON CONFLICT (id) DO NOTHING;


-- ─── 2. Sales order lines (kept thin — header doesn't show line detail) ─────
-- Greenvista: 5 lines @ ₹700K each = ₹3.5M total. Aligns with 5 dispatch tranches.
INSERT INTO sales_order_line (id, tenant_id, sales_order_id, product_id,
                              product_name, sku_code, unit, quantity, unit_price,
                              line_total, sort_order)
SELECT
  uuid_in(md5('greenvista_line_' || g.section)::cstring),
  'a1111111-1111-1111-1111-111111111111'::uuid,
  'd1000000-0000-0000-0000-000000000001'::uuid,
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'Cosmic Pavers — Section ' || g.section,
  'COSMIC-P-80',
  'sqft',
  2400,
  291.67,
  700000.00,
  g.section
FROM (VALUES (1), (2), (3), (4), (5)) AS g(section)
ON CONFLICT (id) DO NOTHING;

-- Surat Smart City: 4 lines @ ₹2050K each = ₹8.2M total.
INSERT INTO sales_order_line (id, tenant_id, sales_order_id, product_id,
                              product_name, sku_code, unit, quantity, unit_price,
                              line_total, sort_order)
SELECT
  uuid_in(md5('suratsc_line_' || g.section)::cstring),
  'a1111111-1111-1111-1111-111111111111'::uuid,
  'd1000000-0000-0000-0000-000000000002'::uuid,
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'Cosmic Pavers — Phase ' || g.section,
  'COSMIC-P-80',
  'sqft',
  7000,
  292.86,
  2050000.00,
  g.section
FROM (VALUES (1), (2), (3), (4)) AS g(section)
ON CONFLICT (id) DO NOTHING;


-- ─── 3. Dispatches — 5 tranches for Greenvista (3 delivered, 2 scheduled) ───
-- Tranche 1: delivered 18d ago with POD
INSERT INTO dispatch (id, tenant_id, dispatch_number, sales_order_id, project_id,
                      current_stage_id, scheduled_at, dispatched_at, delivered_at,
                      pod_url, pod_signature_name, pod_uploaded_at,
                      owner_id, created_by, updated_by, created_at)
VALUES
  ('d2000000-0000-0000-0000-000000000011'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'VT-DC-2026-9001',
   'd1000000-0000-0000-0000-000000000001'::uuid,
   'abcdef00-0000-0000-0000-000000000001'::uuid,
   'b0000000-0000-0000-0000-000000000004'::uuid,  -- POD Uploaded
   now() - interval '20 days', now() - interval '19 days', now() - interval '18 days',
   'demo/pods/greenvista-tranche-1.jpg', 'Site Engineer — Section 1', now() - interval '18 days',
   'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
   'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
   'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
   now() - interval '20 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO dispatch (id, tenant_id, dispatch_number, sales_order_id, project_id,
                      current_stage_id, scheduled_at, dispatched_at, delivered_at,
                      pod_url, pod_signature_name, pod_uploaded_at,
                      owner_id, created_by, updated_by, created_at)
VALUES
  ('d2000000-0000-0000-0000-000000000012'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'VT-DC-2026-9002',
   'd1000000-0000-0000-0000-000000000001'::uuid,
   'abcdef00-0000-0000-0000-000000000001'::uuid,
   'b0000000-0000-0000-0000-000000000004'::uuid,
   now() - interval '14 days', now() - interval '13 days', now() - interval '12 days',
   'demo/pods/greenvista-tranche-2.jpg', 'Site Engineer — Section 2', now() - interval '12 days',
   'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
   'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
   'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
   now() - interval '14 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO dispatch (id, tenant_id, dispatch_number, sales_order_id, project_id,
                      current_stage_id, scheduled_at, dispatched_at, delivered_at,
                      pod_url, pod_signature_name, pod_uploaded_at,
                      owner_id, created_by, updated_by, created_at)
VALUES
  ('d2000000-0000-0000-0000-000000000013'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'VT-DC-2026-9003',
   'd1000000-0000-0000-0000-000000000001'::uuid,
   'abcdef00-0000-0000-0000-000000000001'::uuid,
   'b0000000-0000-0000-0000-000000000004'::uuid,
   now() - interval '8 days', now() - interval '7 days', now() - interval '6 days',
   'demo/pods/greenvista-tranche-3.jpg', 'Site Engineer — Section 3', now() - interval '6 days',
   'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
   'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
   'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
   now() - interval '8 days')
ON CONFLICT (id) DO NOTHING;

-- Tranches 4 + 5: scheduled, not yet delivered (no delivered_at, no POD)
INSERT INTO dispatch (id, tenant_id, dispatch_number, sales_order_id, project_id,
                      current_stage_id, scheduled_at,
                      owner_id, created_by, updated_by, created_at)
VALUES
  ('d2000000-0000-0000-0000-000000000014'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'VT-DC-2026-9004',
   'd1000000-0000-0000-0000-000000000001'::uuid,
   'abcdef00-0000-0000-0000-000000000001'::uuid,
   'b0000000-0000-0000-0000-000000000001'::uuid,  -- Scheduled
   now() + interval '3 days',
   'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
   'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
   'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
   now() - interval '2 days'),
  ('d2000000-0000-0000-0000-000000000015'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'VT-DC-2026-9005',
   'd1000000-0000-0000-0000-000000000001'::uuid,
   'abcdef00-0000-0000-0000-000000000001'::uuid,
   'b0000000-0000-0000-0000-000000000001'::uuid,
   now() + interval '10 days',
   'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
   'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
   'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
   now() - interval '2 days')
ON CONFLICT (id) DO NOTHING;


-- ─── 4. Dispatches for Surat SC — 4 tranches all delivered with POD ─────────
INSERT INTO dispatch (id, tenant_id, dispatch_number, sales_order_id, project_id,
                      current_stage_id, scheduled_at, dispatched_at, delivered_at,
                      pod_url, pod_signature_name, pod_uploaded_at,
                      owner_id, created_by, updated_by, created_at)
SELECT
  uuid_in(md5('suratsc_dispatch_' || g.tranche)::cstring),
  'a1111111-1111-1111-1111-111111111111'::uuid,
  'VT-DC-2026-91' || lpad(g.tranche::text, 2, '0'),
  'd1000000-0000-0000-0000-000000000002'::uuid,
  'abcdef00-0000-0000-0000-000000000002'::uuid,
  'b0000000-0000-0000-0000-000000000004'::uuid,
  now() - (interval '1 day' * (90 - g.tranche * 15)),
  now() - (interval '1 day' * (89 - g.tranche * 15)),
  now() - (interval '1 day' * (88 - g.tranche * 15)),
  'demo/pods/suratsc-tranche-' || g.tranche || '.jpg',
  'SMC Site Inspector',
  now() - (interval '1 day' * (88 - g.tranche * 15)),
  '01b929ba-73e6-458e-bb7b-ab3319376d06'::uuid,
  '98bcb345-ff63-4bc0-9587-e53bad54f367'::uuid,
  '98bcb345-ff63-4bc0-9587-e53bad54f367'::uuid,
  now() - (interval '1 day' * (90 - g.tranche * 15))
FROM (VALUES (1), (2), (3), (4)) AS g(tranche)
ON CONFLICT (id) DO NOTHING;


-- ─── 5. Invoices — partial running bills ────────────────────────────────────
-- Greenvista: 2 RA-bills issued so far (₹14L + ₹7L = ₹21L ≈ 60% of ₹35L)
-- Neither is the final bill (project still mid-paving).
INSERT INTO invoice (id, tenant_id, invoice_number, project_id, sales_order_id, buyer_firm_id,
                     invoice_date, due_date, payment_terms_days,
                     subtotal, gst_pct, gst_amount, total,
                     retention_pct, retention_amount, billed_amount, paid_amount,
                     is_running_bill, running_bill_seq, is_final_bill,
                     status, source, notes, created_by, updated_by, created_at)
VALUES
  ('d3000000-0000-0000-0000-000000000011'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'VT-INV-2026-9001',
   'abcdef00-0000-0000-0000-000000000001'::uuid,
   'd1000000-0000-0000-0000-000000000001'::uuid,
   'd0000000-0000-0000-0000-000000000002'::uuid,
   (CURRENT_DATE - interval '17 days')::date,
   (CURRENT_DATE + interval '13 days')::date,
   30,
   1186440.68, 18, 213559.32, 1400000.00,
   5, 70000.00, 1330000.00, 1330000.00,
   true, 1, false,
   'paid', 'manual', 'RA-Bill #1 — Sections 1+2',
   'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
   'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
   now() - interval '17 days'),
  ('d3000000-0000-0000-0000-000000000012'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'VT-INV-2026-9002',
   'abcdef00-0000-0000-0000-000000000001'::uuid,
   'd1000000-0000-0000-0000-000000000001'::uuid,
   'd0000000-0000-0000-0000-000000000002'::uuid,
   (CURRENT_DATE - interval '5 days')::date,
   (CURRENT_DATE + interval '25 days')::date,
   30,
   593220.34, 18, 106779.66, 700000.00,
   5, 35000.00, 665000.00, 0.00,
   true, 2, false,
   'sent', 'manual', 'RA-Bill #2 — Section 3',
   'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
   'd44a8213-2227-4c12-8f9b-2f376ef34db0'::uuid,
   now() - interval '5 days')
ON CONFLICT (id) DO NOTHING;

-- Surat SC: 3 RA-bills + 1 final bill totaling full ₹8.2M. Final bill IS marked.
-- All paid. Retention 5% held back per the Closeout gate.
INSERT INTO invoice (id, tenant_id, invoice_number, project_id, sales_order_id, buyer_firm_id,
                     invoice_date, due_date, payment_terms_days,
                     subtotal, gst_pct, gst_amount, total,
                     retention_pct, retention_amount, billed_amount, paid_amount,
                     is_running_bill, running_bill_seq, is_final_bill,
                     status, source, notes, created_by, updated_by, created_at)
VALUES
  ('d3000000-0000-0000-0000-000000000021'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'VT-INV-2026-9011',
   'abcdef00-0000-0000-0000-000000000002'::uuid,
   'd1000000-0000-0000-0000-000000000002'::uuid,
   'd0000000-0000-0000-0000-000000000003'::uuid,
   (CURRENT_DATE - interval '90 days')::date,
   (CURRENT_DATE - interval '60 days')::date, 30,
   1737288.14, 18, 312711.86, 2050000.00,
   5, 102500.00, 1947500.00, 1947500.00,
   true, 1, false,
   'paid', 'manual', 'RA-Bill #1 — Phase 1',
   '98bcb345-ff63-4bc0-9587-e53bad54f367'::uuid,
   '98bcb345-ff63-4bc0-9587-e53bad54f367'::uuid,
   now() - interval '90 days'),
  ('d3000000-0000-0000-0000-000000000022'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'VT-INV-2026-9012',
   'abcdef00-0000-0000-0000-000000000002'::uuid,
   'd1000000-0000-0000-0000-000000000002'::uuid,
   'd0000000-0000-0000-0000-000000000003'::uuid,
   (CURRENT_DATE - interval '65 days')::date,
   (CURRENT_DATE - interval '35 days')::date, 30,
   1737288.14, 18, 312711.86, 2050000.00,
   5, 102500.00, 1947500.00, 1947500.00,
   true, 2, false,
   'paid', 'manual', 'RA-Bill #2 — Phase 2',
   '98bcb345-ff63-4bc0-9587-e53bad54f367'::uuid,
   '98bcb345-ff63-4bc0-9587-e53bad54f367'::uuid,
   now() - interval '65 days'),
  ('d3000000-0000-0000-0000-000000000023'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'VT-INV-2026-9013',
   'abcdef00-0000-0000-0000-000000000002'::uuid,
   'd1000000-0000-0000-0000-000000000002'::uuid,
   'd0000000-0000-0000-0000-000000000003'::uuid,
   (CURRENT_DATE - interval '40 days')::date,
   (CURRENT_DATE - interval '10 days')::date, 30,
   1737288.14, 18, 312711.86, 2050000.00,
   5, 102500.00, 1947500.00, 1947500.00,
   true, 3, false,
   'paid', 'manual', 'RA-Bill #3 — Phase 3',
   '98bcb345-ff63-4bc0-9587-e53bad54f367'::uuid,
   '98bcb345-ff63-4bc0-9587-e53bad54f367'::uuid,
   now() - interval '40 days'),
  ('d3000000-0000-0000-0000-000000000024'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'VT-INV-2026-9014',
   'abcdef00-0000-0000-0000-000000000002'::uuid,
   'd1000000-0000-0000-0000-000000000002'::uuid,
   'd0000000-0000-0000-0000-000000000003'::uuid,
   (CURRENT_DATE - interval '12 days')::date,
   (CURRENT_DATE + interval '18 days')::date, 30,
   1737288.14, 18, 312711.86, 2050000.00,
   5, 102500.00, 1947500.00, 1947500.00,
   true, 4, true,  -- final bill
   'paid', 'manual', 'Final Bill — Phase 4 (retention held pending acceptance)',
   '98bcb345-ff63-4bc0-9587-e53bad54f367'::uuid,
   '98bcb345-ff63-4bc0-9587-e53bad54f367'::uuid,
   now() - interval '12 days')
ON CONFLICT (id) DO NOTHING;


-- ─── 6. A next-action task on Greenvista (drives the header banner) ─────────
INSERT INTO task (id, tenant_id, project_id, type, title, priority, is_done,
                  due_at, source_entity_type, source_entity_id, created_at)
VALUES
  ('d4000000-0000-0000-0000-000000000001'::uuid,
   'a1111111-1111-1111-1111-111111111111'::uuid,
   'abcdef00-0000-0000-0000-000000000001'::uuid,
   'dispatch_schedule',
   'Confirm vehicle for Tranche 4 (VT-DC-2026-9004)',
   'high', false,
   now() + interval '2 days',
   'dispatch', 'd2000000-0000-0000-0000-000000000014'::uuid,
   now() - interval '1 day')
ON CONFLICT (id) DO NOTHING;
