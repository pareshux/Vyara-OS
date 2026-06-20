-- ============================================================
-- 04_owner_demo_signals.sql — INT-014 Slice 1 demo data
--
-- Populates the four Attention Centre categories that were empty
-- on the live Vyara Tiles tenant, and adds 6 receipts so the
-- Cash Movement / Collections / DSO numbers tell a real story.
--
-- TOUCHES EXISTING ENTITIES ONLY (no fake firms, no fake projects).
-- IDEMPOTENT: re-running this script restores the same demo state.
--
-- Signals seeded:
--   1. Stalled high-value deals  (backdate 2 existing projects)
--   2. Stale sent quotes         (existing draft → sent 12d ago,
--                                 + 1 new quote on Punyabhoomi 22d)
--   3. Pending approvals         (2 expense_claim requests)
--   4. Receipts                  (6 receipts, ~₹16L spread across 28d,
--                                 with invoice.paid_amount updates)
-- ============================================================

-- ─── 1. Stalled high-value deals ────────────────────────────
-- 33kV Switchyard Rajkot is ₹1.25 cr — 19 days stale = critical.
-- Surat Smart City Sector 5 is ₹82 L  — 21 days stale = warning.

UPDATE project
SET updated_at = NOW() - INTERVAL '19 days'
WHERE id = 'f1000000-0000-0000-0001-000000000001';

UPDATE project
SET updated_at = NOW() - INTERVAL '21 days'
WHERE id = 'abcdef00-0000-0000-0000-000000000002';

-- ─── 2. Stale sent quotes ───────────────────────────────────
-- 2a. Existing draft quote VT-QT-2026-0005 (₹1.45cr) → flip to sent 12d ago
UPDATE quotation
SET status = 'sent',
    sent_at = NOW() - INTERVAL '12 days'
WHERE id = '8a0475ff-4fe0-4e9a-a57b-b239c83dedfc';

-- 2b. New quote on Punyabhoomi Society (existing project) ₹40L
--     Sent 22 days ago — older than 21d so it crosses the warning band.
INSERT INTO quotation (
  id, tenant_id, quotation_number, project_id,
  status, total, sent_at, valid_until,
  created_at, created_by
) VALUES (
  'aaaa0044-0000-0000-0000-000000001001',
  (SELECT id FROM tenant WHERE slug = 'vyara-tiles'),
  'VT-QT-2026-0044',
  'bae1d08d-ae98-45d5-a1bf-37f244d696fa',  -- Punyabhoomi Society
  'sent',
  4000000,
  NOW() - INTERVAL '22 days',
  CURRENT_DATE + INTERVAL '8 days',
  NOW() - INTERVAL '24 days',
  (SELECT id FROM user_profile
   WHERE role = 'admin'
     AND tenant_id = (SELECT id FROM tenant WHERE slug = 'vyara-tiles')
   LIMIT 1)
)
ON CONFLICT (id) DO UPDATE
  SET status = 'sent',
      sent_at = NOW() - INTERVAL '22 days',
      total = 4000000;

-- ─── 3. Pending approvals ───────────────────────────────────
-- Both expense_claim type so they bind to the existing expense policy
-- (5f7996f2-...). The second one is >24h old → warning severity in
-- the Attention Centre (per AttentionCentre logic in /owner).

INSERT INTO approval_request (
  id, tenant_id, policy_id, entity_type, entity_id, amount,
  subject_user_id, status, current_step_order, created_at, notes
) VALUES (
  'aaaa0044-0000-0000-0000-000000002001',
  (SELECT id FROM tenant WHERE slug = 'vyara-tiles'),
  '5f7996f2-5dc4-4299-9e2c-c7e3ed437fde',
  'expense',
  'aaaa0044-0000-0000-0000-000000099001',
  8500,
  'd44a8213-2227-4c12-8f9b-2f376ef34db0',  -- Mehul Vora
  'pending',
  1,
  NOW() - INTERVAL '4 hours',
  'Site visit — Surat fuel + tolls'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO approval_request (
  id, tenant_id, policy_id, entity_type, entity_id, amount,
  subject_user_id, status, current_step_order, created_at, notes
) VALUES (
  'aaaa0044-0000-0000-0000-000000002002',
  (SELECT id FROM tenant WHERE slug = 'vyara-tiles'),
  '5f7996f2-5dc4-4299-9e2c-c7e3ed437fde',
  'expense',
  'aaaa0044-0000-0000-0000-000000099002',
  150000,
  '01b929ba-73e6-458e-bb7b-ab3319376d06',  -- Priya Shah
  'pending',
  1,
  NOW() - INTERVAL '30 hours',             -- >24h → warning
  'Sample courier batch + client lunch — Rajhans Group meeting'
)
ON CONFLICT (id) DO NOTHING;

-- ─── 4. Receipts — cash movement, last 28d ──────────────────
-- 6 receipts across the period, against 6 existing open invoices.
-- Total inflow: ₹15.83L. Three invoices get fully paid (status='paid'),
-- three stay partially open. That leaves 2 invoices overdue at the
-- end — including the genuinely worst one (SMC 3+ months overdue).

DO $$
DECLARE
  v_tenant UUID := (SELECT id FROM tenant WHERE slug = 'vyara-tiles');
BEGIN
  -- Receipt 1: VT-INV-2026-0006 (SMC, ₹4.37L outstanding) — partial ₹2L, 25d ago
  INSERT INTO receipt (
    id, tenant_id, invoice_id, amount, payment_mode, payment_reference, received_at, source
  ) VALUES (
    'aaaa0044-0000-0000-0000-000000003001',
    v_tenant,
    '234f7b01-8064-4b09-9ed8-e89d06565ace',
    200000,
    'neft', 'SMC-NEFT-2026-04-21',
    CURRENT_DATE - INTERVAL '25 days',
    'manual'
  ) ON CONFLICT (id) DO NOTHING;

  -- Receipt 2: VT-INV-2026-0005 (Rajhans, ₹2.10L) — full, 18d ago
  INSERT INTO receipt (
    id, tenant_id, invoice_id, amount, payment_mode, payment_reference, received_at, source
  ) VALUES (
    'aaaa0044-0000-0000-0000-000000003002',
    v_tenant,
    'e48f58c7-2e30-4ed1-bf53-d50a483842c8',
    210040,
    'cheque', 'RJG-CHQ-58741',
    CURRENT_DATE - INTERVAL '18 days',
    'manual'
  ) ON CONFLICT (id) DO NOTHING;

  -- Receipt 3: VT-INV-2026-0004 (Greenfield, ₹2.41L) — partial ₹1.5L, 13d ago
  INSERT INTO receipt (
    id, tenant_id, invoice_id, amount, payment_mode, payment_reference, received_at, source
  ) VALUES (
    'aaaa0044-0000-0000-0000-000000003003',
    v_tenant,
    'fc1dea91-5593-4896-8a4e-f5fe5b29c5ab',
    150000,
    'rtgs', 'GFD-RTGS-090671',
    CURRENT_DATE - INTERVAL '13 days',
    'manual'
  ) ON CONFLICT (id) DO NOTHING;

  -- Receipt 4: EL-INV-2026-0001 (GETCO, ₹2.80L) — full, 10d ago
  INSERT INTO receipt (
    id, tenant_id, invoice_id, amount, payment_mode, payment_reference, received_at, source
  ) VALUES (
    'aaaa0044-0000-0000-0000-000000003004',
    v_tenant,
    'f5000000-0000-0000-0001-000000000001',
    280250,
    'neft', 'GETCO-NEFT-44211',
    CURRENT_DATE - INTERVAL '10 days',
    'manual'
  ) ON CONFLICT (id) DO NOTHING;

  -- Receipt 5: VT-INV-2026-9002 (Greenfield, ₹6.65L) — partial ₹3L, 5d ago
  INSERT INTO receipt (
    id, tenant_id, invoice_id, amount, payment_mode, payment_reference, received_at, source
  ) VALUES (
    'aaaa0044-0000-0000-0000-000000003005',
    v_tenant,
    'd3000000-0000-0000-0000-000000000012',
    300000,
    'rtgs', 'GFD-RTGS-094112',
    CURRENT_DATE - INTERVAL '5 days',
    'manual'
  ) ON CONFLICT (id) DO NOTHING;

  -- Receipt 6: VT-INV-2026-0003 (Rajhans, ₹1.08L) — full, 2d ago
  INSERT INTO receipt (
    id, tenant_id, invoice_id, amount, payment_mode, payment_reference, received_at, source
  ) VALUES (
    'aaaa0044-0000-0000-0000-000000003006',
    v_tenant,
    '7181206e-aef7-4996-8a3c-06098424b01b',
    108560,
    'cheque', 'RJG-CHQ-58812',
    CURRENT_DATE - INTERVAL '2 days',
    'manual'
  ) ON CONFLICT (id) DO NOTHING;

  -- Keep invoice.paid_amount + status consistent with the receipts above.
  -- These updates are idempotent and re-runnable.
  UPDATE invoice SET paid_amount = 200000
    WHERE id = '234f7b01-8064-4b09-9ed8-e89d06565ace';
  UPDATE invoice SET paid_amount = 210040, status = 'paid'
    WHERE id = 'e48f58c7-2e30-4ed1-bf53-d50a483842c8';
  UPDATE invoice SET paid_amount = 150000
    WHERE id = 'fc1dea91-5593-4896-8a4e-f5fe5b29c5ab';
  UPDATE invoice SET paid_amount = 280250, status = 'paid'
    WHERE id = 'f5000000-0000-0000-0001-000000000001';
  UPDATE invoice SET paid_amount = 300000
    WHERE id = 'd3000000-0000-0000-0000-000000000012';
  UPDATE invoice SET paid_amount = 108560, status = 'paid'
    WHERE id = '7181206e-aef7-4996-8a3c-06098424b01b';
END $$;

-- ─── 5. Drop AI brief cache so the next render regenerates ──
-- The Owner Brief is cached 6h. After seeding fresh signals, the
-- cached brief becomes misleading. Invalidate it so the next /owner
-- view triggers a fresh AI call against the new facts.
DELETE FROM ai_extraction
WHERE entity_kind = 'owner_brief'
  AND tenant_id = (SELECT id FROM tenant WHERE slug = 'vyara-tiles');
