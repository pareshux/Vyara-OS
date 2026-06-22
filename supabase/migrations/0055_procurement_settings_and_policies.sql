-- ============================================================
-- 0055_procurement_settings_and_policies.sql — Procurement P1α
--
-- Tenant-aware procurement configuration:
--   1. PO + GRN code templates per tenant (RA-* for Raj, VT-* for
--      Vyara). The render_tenant_code helper from 0051 reads these.
--   2. Approval policies + steps for entity_type='purchase_order'
--      with three bands per tenant:
--        - ₹50,000.01 - ₹5,00,000      → manager (1 step)
--        - ₹5,00,000.01 - ₹25,00,000   → manager → admin (2 steps)
--        - ₹25,00,000.01+              → admin (1 step)
--      Sub-₹50k POs auto-approve (PLAT-014 default when no policy
--      matches the band).
--
-- DEFERRED: ap_master feature flag (procurement.ap_master = 'native'
-- vs 'tally'). The platform doesn't need it until Phase 2 when vendor
-- bills land. Recorded in Blueprint PLAT-028 as 📋 P2.
-- ============================================================


-- ─── 1. CODE TEMPLATES (per tenant) ───────────────────────────

UPDATE tenant
SET settings = jsonb_set(
  jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{codes,purchase_order}',
    '"VT-PO-{yyyy}-{nnnn}"'::jsonb,
    true
  ),
  '{codes,goods_receipt_note}',
  '"VT-GRN-{yyyy}-{nnnn}"'::jsonb,
  true
)
WHERE slug = 'vyara-tiles';

UPDATE tenant
SET settings = jsonb_set(
  jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{codes,purchase_order}',
    '"RA-PO-{yyyy}-{nnnn}"'::jsonb,
    true
  ),
  '{codes,goods_receipt_note}',
  '"RA-GRN-{yyyy}-{nnnn}"'::jsonb,
  true
)
WHERE slug = 'raj-avinsys';


-- ─── 2. APPROVAL POLICIES — entity_type='purchase_order' ───────

DO $$
DECLARE
  t_record       RECORD;
  v_policy_mid   UUID;
  v_policy_high  UUID;
  v_policy_top   UUID;
BEGIN
  FOR t_record IN
    SELECT id, slug FROM tenant WHERE slug IN ('vyara-tiles', 'raj-avinsys')
  LOOP
    -- Band 1: ₹50,000.01 - ₹5,00,000 — manager (1 step, sequential)
    INSERT INTO approval_policy (
      tenant_id, entity_type, name, min_amount, max_amount, mode,
      require_all_parallel, active, notes
    ) VALUES (
      t_record.id, 'purchase_order', 'PO ₹50k - ₹5L',
      50000.01, 500000, 'sequential',
      true, true,
      'Manager approval for routine procurement.'
    )
    RETURNING id INTO v_policy_mid;

    INSERT INTO approval_policy_step (
      tenant_id, policy_id, step_order, approver_via, approver_role, label
    ) VALUES (
      t_record.id, v_policy_mid, 1, 'role', 'manager', 'Manager approval'
    );

    -- Band 2: ₹5,00,000.01 - ₹25,00,000 — manager → admin
    INSERT INTO approval_policy (
      tenant_id, entity_type, name, min_amount, max_amount, mode,
      require_all_parallel, active, notes
    ) VALUES (
      t_record.id, 'purchase_order', 'PO ₹5L - ₹25L',
      500000.01, 2500000, 'sequential',
      true, true,
      'Two-step: manager then director.'
    )
    RETURNING id INTO v_policy_high;

    INSERT INTO approval_policy_step (
      tenant_id, policy_id, step_order, approver_via, approver_role, label
    ) VALUES
      (t_record.id, v_policy_high, 1, 'role', 'manager', 'Manager approval'),
      (t_record.id, v_policy_high, 2, 'role', 'admin',   'Director approval');

    -- Band 3: ₹25,00,000.01+ — admin (1 step). max NULL = unbounded.
    INSERT INTO approval_policy (
      tenant_id, entity_type, name, min_amount, max_amount, mode,
      require_all_parallel, active, notes
    ) VALUES (
      t_record.id, 'purchase_order', 'PO ≥ ₹25L',
      2500000.01, NULL, 'sequential',
      true, true,
      'Capital procurement — director sign-off only.'
    )
    RETURNING id INTO v_policy_top;

    INSERT INTO approval_policy_step (
      tenant_id, policy_id, step_order, approver_via, approver_role, label
    ) VALUES (
      t_record.id, v_policy_top, 1, 'role', 'admin', 'Director approval'
    );

    RAISE NOTICE 'Seeded purchase_order approval policies for tenant %', t_record.slug;
  END LOOP;
END $$;
