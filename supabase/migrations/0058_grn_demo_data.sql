-- ============================================================
-- 0058_grn_demo_data.sql — sample Goods Receipt Notes
--
-- Adds two posted GRNs against the previously-sent POs so the user
-- can see a fully-received and a partly-received PO on the list:
--
--   - Vyara VT-PO-2026-0004 (Pack Industries · sent · ₹1.30L)
--     → 1 GRN that fully receives all 5,000 cartons. PO flips to 'received'.
--
--   - Raj RA-PO-2026-0005 (L&T · sent · ₹12.30L · 3 lines)
--     → 1 GRN that partially receives:
--         line 1 (VFD 30HP × 2) → receive 1, leave 1 pending
--         line 2 (SFU 400A × 4) → receive all 4
--         line 3 (Bus duct × 12 mtr) → don't receive
--     PO flips to 'partly_received'.
--
-- Each GRN walks the full server-action path: writes line rows,
-- updates po_line.qty_received, recomputes po.status, writes
-- stock_movement rows for product-linked lines.
--
-- Since these PO lines have no product_id (they're ad-hoc text),
-- no stock_movement rows get written. That matches the action's
-- behaviour. To exercise the stock-movement path in P1γ we'll
-- seed product-linked PO lines.
--
-- Idempotent: each GRN gated by fixed UUID + IF NOT EXISTS.
-- Safe to re-run.
-- ============================================================

DO $$
DECLARE
  v_vyara_tenant     UUID;
  v_raj_tenant       UUID;
  v_vyara_admin      UUID;
  v_raj_admin        UUID;
  v_vt_po4_id        UUID := 'c0000000-0000-0000-0001-000000000004'::uuid;
  v_ra_po5_id        UUID := 'c0000000-0000-0000-0001-000000000105'::uuid;
  v_vt_grn1_id       UUID := 'd0000000-0000-0000-0001-000000000001'::uuid;
  v_ra_grn1_id       UUID := 'd0000000-0000-0000-0001-000000000101'::uuid;
  -- Captured line refs
  v_vt_line1         UUID;
  v_vt_line1_qty     NUMERIC;
  v_ra_line1         UUID;
  v_ra_line1_qty     NUMERIC;
  v_ra_line2         UUID;
  v_ra_line2_qty     NUMERIC;
BEGIN
  SELECT id INTO v_vyara_tenant FROM tenant WHERE slug = 'vyara-tiles';
  SELECT id INTO v_raj_tenant   FROM tenant WHERE slug = 'raj-avinsys';
  SELECT id INTO v_vyara_admin FROM user_profile WHERE tenant_id = v_vyara_tenant AND role = 'admin' AND is_active = true ORDER BY created_at LIMIT 1;
  SELECT id INTO v_raj_admin   FROM user_profile WHERE tenant_id = v_raj_tenant   AND role = 'admin' AND is_active = true ORDER BY created_at LIMIT 1;

  -- ─── Vyara: full receipt against VT-PO-2026-0004 ─────────────
  IF NOT EXISTS (SELECT 1 FROM goods_receipt_note WHERE id = v_vt_grn1_id) THEN
    -- Locate PO line 1 (the only line on this PO)
    SELECT id, quantity INTO v_vt_line1, v_vt_line1_qty
    FROM purchase_order_line
    WHERE po_id = v_vt_po4_id AND line_no = 1;

    IF v_vt_line1 IS NOT NULL THEN
      INSERT INTO goods_receipt_note (
        id, tenant_id, po_id, vendor_id, warehouse_id, grn_date,
        vendor_challan_no, vehicle_no, transporter, e_way_bill_no,
        qc_status, status, posted_at, posted_by, notes,
        created_by, updated_by
      )
      SELECT
        v_vt_grn1_id, v_vyara_tenant, po.id, po.vendor_id, po.ship_to_warehouse_id,
        CURRENT_DATE - 1,
        'DC-2026-PKG-001', 'MH12 AB 4567', 'Pack Industries (own truck)', '252026123456',
        'accepted', 'posted', NOW() - INTERVAL '1 day', v_vyara_admin,
        '5000 cartons in full. QC checked sample of 20 — all OK.',
        v_vyara_admin, v_vyara_admin
      FROM purchase_order po WHERE po.id = v_vt_po4_id;

      INSERT INTO goods_receipt_note_line (
        tenant_id, grn_id, po_line_id, product_id, description, unit,
        qty_received, qty_accepted, qty_rejected, remarks
      )
      SELECT
        v_vyara_tenant, v_vt_grn1_id, v_vt_line1, NULL,
        'Corrugated cartons 30 × 30 × 30 cm (5-ply)', 'nos',
        v_vt_line1_qty, v_vt_line1_qty, 0,
        '5-ply confirmed; sample lot tested OK.';

      -- Update PO line + PO header to match a posted-GRN state.
      UPDATE purchase_order_line
      SET qty_received = v_vt_line1_qty
      WHERE id = v_vt_line1;

      UPDATE purchase_order
      SET status = 'received', updated_at = NOW()
      WHERE id = v_vt_po4_id;
    END IF;
  END IF;

  -- ─── Raj: partial receipt against RA-PO-2026-0005 (L&T) ──────
  IF NOT EXISTS (SELECT 1 FROM goods_receipt_note WHERE id = v_ra_grn1_id) THEN
    SELECT id, quantity INTO v_ra_line1, v_ra_line1_qty
    FROM purchase_order_line
    WHERE po_id = v_ra_po5_id AND line_no = 1;  -- VFD × 2

    SELECT id, quantity INTO v_ra_line2, v_ra_line2_qty
    FROM purchase_order_line
    WHERE po_id = v_ra_po5_id AND line_no = 2;  -- SFU × 4

    IF v_ra_line1 IS NOT NULL AND v_ra_line2 IS NOT NULL THEN
      INSERT INTO goods_receipt_note (
        id, tenant_id, po_id, vendor_id, warehouse_id, grn_date,
        vendor_challan_no, vehicle_no, transporter, e_way_bill_no,
        qc_status, status, posted_at, posted_by, notes,
        created_by, updated_by
      )
      SELECT
        v_ra_grn1_id, v_raj_tenant, po.id, po.vendor_id, po.ship_to_warehouse_id,
        CURRENT_DATE - 1,
        'LT-DC-2026-9981', 'MH04 CD 8901', 'L&T Logistics', '252026999100',
        'partial_accept', 'posted', NOW() - INTERVAL '1 day', v_raj_admin,
        'First tranche: 1 of 2 VFDs + all 4 SFUs. Bus duct held back for Vapi site readiness.',
        v_raj_admin, v_raj_admin
      FROM purchase_order po WHERE po.id = v_ra_po5_id;

      INSERT INTO goods_receipt_note_line (
        tenant_id, grn_id, po_line_id, product_id, description, unit,
        qty_received, qty_accepted, qty_rejected, batch_no, remarks
      ) VALUES
        (v_raj_tenant, v_ra_grn1_id, v_ra_line1, NULL,
         'VFD 30 HP 415V (SL1S series)', 'nos',
         1, 1, 0, 'L1-2026-VFD-A0231',
         'First unit. Second unit shipping next week.'),
        (v_raj_tenant, v_ra_grn1_id, v_ra_line2, NULL,
         'SFU 400A 4P (Switch-Fuse Unit)', 'nos',
         4, 4, 0, 'L1-2026-SFU-B', NULL);

      UPDATE purchase_order_line SET qty_received = 1 WHERE id = v_ra_line1;
      UPDATE purchase_order_line SET qty_received = 4 WHERE id = v_ra_line2;

      UPDATE purchase_order
      SET status = 'partly_received', updated_at = NOW()
      WHERE id = v_ra_po5_id;
    END IF;
  END IF;

  RAISE NOTICE '[grn-seed] Done. VT-PO-2026-0004 → received (1 GRN). RA-PO-2026-0005 → partly_received (1 GRN).';
END $$;
