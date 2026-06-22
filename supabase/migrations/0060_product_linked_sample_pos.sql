-- ============================================================
-- 0060_product_linked_sample_pos.sql — product-linked PO seeds (P1γ)
--
-- Today's seeded POs use ad-hoc text lines (product_id IS NULL), so
-- when a GRN is posted the action correctly skips stock_movement
-- (services / fabricated items don't impact warehouse stock). That
-- means the user can't *see* /inventory shift on receipt.
--
-- This migration adds one product-linked draft PO per tenant:
--   - Vyara: VT-PO-2026-0006 — INTLK-300-GRY pavers x 200 sqft
--     (used as a 'raw-material' proxy; the product master is finished
--      goods but it's the cleanest way to demo stock impact without
--      adding a new product category)
--   - Raj:   RA-PO-2026-0007 — CBL-LT-150 x 10 mtr from Polycab
--
-- Both intentionally sized under ₹50k so the user can:
--   submit → auto-approve → send → receive → watch stock_movement
--   land on /inventory (and the per-product stock balance update).
--
-- Idempotent via fixed UUIDs + IF NOT EXISTS.
-- ============================================================

DO $$
DECLARE
  v_vyara_tenant     UUID;
  v_raj_tenant       UUID;
  v_vyara_admin      UUID;
  v_raj_admin        UUID;
  v_vyara_warehouse  UUID;
  v_raj_warehouse    UUID;
  v_vyara_vendor     UUID;
  v_raj_vendor       UUID;
  v_vyara_product    UUID;
  v_raj_product      UUID;
  v_po_id            UUID;
BEGIN
  SELECT id INTO v_vyara_tenant FROM tenant WHERE slug = 'vyara-tiles';
  SELECT id INTO v_raj_tenant   FROM tenant WHERE slug = 'raj-avinsys';
  SELECT id INTO v_vyara_admin  FROM user_profile WHERE tenant_id = v_vyara_tenant AND role = 'admin' AND is_active = true ORDER BY created_at LIMIT 1;
  SELECT id INTO v_raj_admin    FROM user_profile WHERE tenant_id = v_raj_tenant   AND role = 'admin' AND is_active = true ORDER BY created_at LIMIT 1;
  SELECT id INTO v_vyara_warehouse FROM warehouse WHERE tenant_id = v_vyara_tenant AND code = 'SURAT-PLANT-1' LIMIT 1;
  SELECT id INTO v_raj_warehouse   FROM warehouse WHERE tenant_id = v_raj_tenant   AND code = 'RAJ-MAIN' LIMIT 1;

  -- ─── Vyara: VT-PO-2026-0006 — pavers (intra-state, sub-₹50k) ──
  v_po_id := 'c0000000-0000-0000-0001-000000000006'::uuid;
  IF NOT EXISTS (SELECT 1 FROM purchase_order WHERE id = v_po_id) THEN
    SELECT id INTO v_vyara_vendor  FROM vendor WHERE tenant_id = v_vyara_tenant AND code = 'V-CEM-01' LIMIT 1;
    SELECT id INTO v_vyara_product FROM product WHERE tenant_id = v_vyara_tenant AND sku_code = 'INTLK-300-GRY' LIMIT 1;

    IF v_vyara_vendor IS NOT NULL AND v_vyara_product IS NOT NULL AND v_vyara_warehouse IS NOT NULL THEN
      -- 200 sqft × ₹180 = ₹36,000 + 18% GST = ₹42,480 (auto-approve)
      INSERT INTO purchase_order (
        id, tenant_id, po_number, vendor_id, ship_to_warehouse_id,
        po_date, expected_delivery_at, status,
        vendor_address_snapshot, bill_to_snapshot, ship_to_snapshot,
        subtotal, discount_amount, tax_amount, total,
        payment_terms_days, delivery_terms, notes,
        created_by, updated_by
      ) VALUES (
        v_po_id, v_vyara_tenant, 'VT-PO-2026-0006', v_vyara_vendor, v_vyara_warehouse,
        CURRENT_DATE, CURRENT_DATE + 3, 'draft',
        'Ambuja Cement (Surat depot) · Hazira Road, Surat · GSTIN 24AAACA1234B1Z5',
        'Vyara Tiles Limited · Vyara, Gujarat · GSTIN 24AABCV1234F1Z5',
        'Surat Plant 1 · Surat, Gujarat',
        36000, 0, 6480, 42480,
        45, 'FOR site',
        'Product-linked PO — exercises the stock_movement path on GRN post. Submit → auto-approves → send → receive → watch /inventory.',
        v_vyara_admin, v_vyara_admin
      );

      INSERT INTO purchase_order_line (
        tenant_id, po_id, line_no, product_id, description, hsn_code, unit, quantity, rate,
        discount_pct, taxable_value, is_interstate, gst_rate_pct,
        igst_amount, cgst_amount, sgst_amount, amount_total
      ) VALUES (
        v_vyara_tenant, v_po_id, 1, v_vyara_product,
        'Interlocking Paver 300x300mm Grey', '6810', 'sqft', 200, 180,
        0, 36000, false, 18, 0, 3240, 3240, 42480
      );
    END IF;
  END IF;

  -- ─── Raj: RA-PO-2026-0007 — LT cable (intra-state Polycab) ────
  v_po_id := 'c0000000-0000-0000-0001-000000000107'::uuid;
  IF NOT EXISTS (SELECT 1 FROM purchase_order WHERE id = v_po_id) THEN
    SELECT id INTO v_raj_vendor  FROM vendor WHERE tenant_id = v_raj_tenant AND code = 'V-CBL-01' LIMIT 1;
    SELECT id INTO v_raj_product FROM product WHERE tenant_id = v_raj_tenant AND sku_code = 'CBL-LT-150' LIMIT 1;

    IF v_raj_vendor IS NOT NULL AND v_raj_product IS NOT NULL AND v_raj_warehouse IS NOT NULL THEN
      -- 10 mtr × ₹2200 = ₹22,000 + 18% GST = ₹25,960 (auto-approve)
      INSERT INTO purchase_order (
        id, tenant_id, po_number, vendor_id, ship_to_warehouse_id,
        po_date, expected_delivery_at, status,
        vendor_address_snapshot, bill_to_snapshot, ship_to_snapshot,
        subtotal, discount_amount, tax_amount, total,
        payment_terms_days, delivery_terms, notes,
        created_by, updated_by
      ) VALUES (
        v_po_id, v_raj_tenant, 'RA-PO-2026-0007', v_raj_vendor, v_raj_warehouse,
        CURRENT_DATE, CURRENT_DATE + 5, 'draft',
        'Polycab Wires (Daman) · Halol GIDC, Gujarat · GSTIN 24AAACP3333G1Z5',
        'Raj Avinsys Pvt Ltd · Vapi, Gujarat · GSTIN 24AABCR9999X1Z8',
        'Vapi GIDC Main Warehouse · Vapi, Gujarat',
        22000, 0, 3960, 25960,
        30, 'FOR site',
        'Product-linked PO — exercises stock_movement on GRN post. Submit → auto-approves → send → receive → watch /inventory and /warehouses/RAJ-MAIN.',
        v_raj_admin, v_raj_admin
      );

      INSERT INTO purchase_order_line (
        tenant_id, po_id, line_no, product_id, description, hsn_code, unit, quantity, rate,
        discount_pct, taxable_value, is_interstate, gst_rate_pct,
        igst_amount, cgst_amount, sgst_amount, amount_total
      ) VALUES (
        v_raj_tenant, v_po_id, 1, v_raj_product,
        'LT XLPE Cable 3.5C × 150 sq.mm', '8544', 'rmt', 10, 2200,
        0, 22000, false, 18, 0, 1980, 1980, 25960
      );
    END IF;
  END IF;

  RAISE NOTICE '[p1g-seed] Done. Vyara: VT-PO-2026-0006 (200 sqft pavers, draft). Raj: RA-PO-2026-0007 (10 mtr LT cable, draft). Both product-linked + sub-₹50k auto-approve.';
END $$;
