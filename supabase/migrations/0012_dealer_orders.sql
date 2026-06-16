-- ============================================================
-- 0012_dealer_orders.sql — Slice 3 Step 4: Dealer-side orders
--
-- Three concerns:
--   1. dealer.default_project_id — caches the auto-created
--      "Dealer orders — {firm_name}" project so subsequent dealer
--      orders reuse it (Decision I1)
--   2. Dealer-side INSERT RLS on sales_order + sales_order_line so
--      dealer-role users can place orders for their own firm_id only
--      (Step 1 only added SELECT policies)
--   3. Dealer-side SELECT RLS on dispatch + dispatch_line so the
--      dealer order-detail page can show "in transit / delivered"
--      status (Decision K1)
--
-- Also seeds one pipeline_stage row for segment='dealer' so auto-
-- created dealer projects have a valid initial stage.
-- ============================================================


-- ─── 1. DEALER: default_project_id ───────────────────────────────────────────
ALTER TABLE dealer
  ADD COLUMN IF NOT EXISTS default_project_id UUID REFERENCES project(id);


-- ─── 2. PIPELINE_STAGE: seed one stage for segment='dealer' ──────────────────
-- Auto-created dealer projects (one per dealer, used for all their portal
-- orders) need an initial stage. A single 'active' stage is sufficient —
-- the dealer relationship is ongoing, no real progression model.

INSERT INTO pipeline_stage (id, tenant_id, segment, stage_key, label, order_index, color, is_paving_stage, is_terminal)
VALUES
  ('c0000000-0000-0000-0000-000000000010'::uuid, NULL, 'dealer', 'active', 'Active', 1, '#22c55e', false, false)
ON CONFLICT DO NOTHING;


-- ─── 3. SALES_ORDER: dealer-side INSERT policy ───────────────────────────────
-- Dealers can insert orders WHERE buyer_firm_id matches their own dealer's
-- firm_id AND created_via='dealer_portal'. RLS prevents them from impersonating
-- another firm or creating internal-flagged orders.

CREATE POLICY "dealer_self_insert" ON sales_order
  FOR INSERT
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_actor_role() = 'dealer'
    AND created_via = 'dealer_portal'
    AND buyer_firm_id IN (SELECT firm_id FROM dealer WHERE id = current_dealer_id())
  );

-- ─── 4. SALES_ORDER_LINE: dealer-side INSERT policy ──────────────────────────
CREATE POLICY "dealer_self_insert" ON sales_order_line
  FOR INSERT
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_actor_role() = 'dealer'
    AND sales_order_id IN (
      SELECT id FROM sales_order
      WHERE buyer_firm_id IN (SELECT firm_id FROM dealer WHERE id = current_dealer_id())
    )
  );


-- ─── 5. DISPATCH: dealer-side SELECT (K1) ────────────────────────────────────
-- Tighten existing tenant_isolation to exclude dealer role first, then add
-- a dealer-self-read policy. Matches the pattern used for invoice/sales_order
-- in Step 1.

DROP POLICY IF EXISTS "tenant_isolation" ON dispatch;
DROP POLICY IF EXISTS "tenant_insert" ON dispatch;

CREATE POLICY "internal_full_access" ON dispatch
  FOR ALL
  USING (
    tenant_id = current_tenant_id()
    AND deleted_at IS NULL
    AND COALESCE(current_actor_role(), '') != 'dealer'
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND COALESCE(current_actor_role(), '') != 'dealer'
  );

CREATE POLICY "dealer_self_read" ON dispatch
  FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    AND deleted_at IS NULL
    AND current_actor_role() = 'dealer'
    AND sales_order_id IN (
      SELECT id FROM sales_order
      WHERE buyer_firm_id IN (SELECT firm_id FROM dealer WHERE id = current_dealer_id())
    )
  );

-- ─── 6. DISPATCH_LINE: dealer-side SELECT ────────────────────────────────────
DROP POLICY IF EXISTS "tenant_isolation" ON dispatch_line;
DROP POLICY IF EXISTS "tenant_insert" ON dispatch_line;

CREATE POLICY "internal_full_access" ON dispatch_line
  FOR ALL
  USING (
    tenant_id = current_tenant_id()
    AND COALESCE(current_actor_role(), '') != 'dealer'
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND COALESCE(current_actor_role(), '') != 'dealer'
  );

CREATE POLICY "dealer_self_read" ON dispatch_line
  FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    AND current_actor_role() = 'dealer'
    AND dispatch_id IN (
      SELECT d.id FROM dispatch d
      WHERE d.sales_order_id IN (
        SELECT id FROM sales_order
        WHERE buyer_firm_id IN (SELECT firm_id FROM dealer WHERE id = current_dealer_id())
      )
    )
  );

-- ─── 7. SALES_ORDER_STAGE_HISTORY: dealer-side SELECT ────────────────────────
-- Already tenant-isolated; dealer detail page wants to show "your order moved
-- from Confirmed → In Production on date X". Add dealer-self-read.

DROP POLICY IF EXISTS "tenant_isolation" ON sales_order_stage_history;
DROP POLICY IF EXISTS "tenant_insert" ON sales_order_stage_history;

CREATE POLICY "internal_full_access" ON sales_order_stage_history
  FOR ALL
  USING (
    tenant_id = current_tenant_id()
    AND COALESCE(current_actor_role(), '') != 'dealer'
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND COALESCE(current_actor_role(), '') != 'dealer'
  );

CREATE POLICY "dealer_self_read" ON sales_order_stage_history
  FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    AND current_actor_role() = 'dealer'
    AND sales_order_id IN (
      SELECT id FROM sales_order
      WHERE buyer_firm_id IN (SELECT firm_id FROM dealer WHERE id = current_dealer_id())
    )
  );


-- ─── 8. ORDER_STAGE: dealers can read stage definitions ──────────────────────
-- Required so the order detail page can render stage labels/colors via the
-- joined `stage:current_stage_id(...)` query. Existing read_system_or_own
-- policy already covers this (system stages have tenant_id IS NULL); we
-- don't need to change it. Verified by inspection.

-- Same for dispatch_stage — existing read_system_or_own already permits.
