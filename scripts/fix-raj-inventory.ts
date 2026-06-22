#!/usr/bin/env tsx
/**
 * scripts/fix-raj-inventory.ts — Hot-fix for the broken Phase 7a inventory seed.
 *
 * Two bugs in the original seed (seed-raj-extras.ts):
 *   1. Wrong table — used `stock_location` (doesn't exist) instead of `stock`
 *   2. stock_movement insert included a `created_by` field that doesn't exist
 *      on that table
 *
 * Both silent failures because the script didn't check `.error` on those
 * insert calls. This one-off fix populates the correct table + retries
 * the movements.
 *
 * Idempotent — uses UPSERT on (warehouse_id, product_id) which is the
 * unique constraint per the stock schema.
 */

import { createClient } from '@supabase/supabase-js'

const RAJ_TENANT_ID = 'aa1a50b2-24b7-441d-8708-6d91e750c4d3'
const WAREHOUSE_ID  = 'aa0c0001-0000-0000-0000-000000000001'

const PROD_HT_CABLE    = 'aa010001-0000-0000-0000-000000000001'
const PROD_LT_CABLE    = 'aa010002-0000-0000-0000-000000000002'
const PROD_TRANSFORMER = 'aa010003-0000-0000-0000-000000000003'
const PROD_MCC         = 'aa010004-0000-0000-0000-000000000004'
const PROD_VFD         = 'aa010006-0000-0000-0000-000000000006'
const PROD_HT_SWG      = 'aa010007-0000-0000-0000-000000000007'

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  console.log('Removing any prior test/probe rows…')
  // Clean test-only rows from the probe I ran earlier (single MGR-inserted row)
  await sb.from('stock').delete().eq('tenant_id', RAJ_TENANT_ID).eq('warehouse_id', WAREHOUSE_ID)

  console.log('Seeding stock rows…')
  const stockRows = [
    { tenant_id: RAJ_TENANT_ID, warehouse_id: WAREHOUSE_ID, product_id: PROD_HT_CABLE,    available_qty:  600, reserved_qty: 800, min_level: 200, max_level: 3000 },
    { tenant_id: RAJ_TENANT_ID, warehouse_id: WAREHOUSE_ID, product_id: PROD_LT_CABLE,    available_qty: 1400, reserved_qty: 600, min_level: 400, max_level: 4000 },
    { tenant_id: RAJ_TENANT_ID, warehouse_id: WAREHOUSE_ID, product_id: PROD_TRANSFORMER, available_qty:    1, reserved_qty:   2, min_level:   1, max_level:    8 },
    { tenant_id: RAJ_TENANT_ID, warehouse_id: WAREHOUSE_ID, product_id: PROD_MCC,         available_qty:    3, reserved_qty:   2, min_level:   2, max_level:   12 },
    { tenant_id: RAJ_TENANT_ID, warehouse_id: WAREHOUSE_ID, product_id: PROD_VFD,         available_qty:    0, reserved_qty:   6, min_level:   2, max_level:   10 },
    { tenant_id: RAJ_TENANT_ID, warehouse_id: WAREHOUSE_ID, product_id: PROD_HT_SWG,      available_qty:    0, reserved_qty:   2, min_level:   1, max_level:    4 },
  ]
  const { error: sErr } = await sb.from('stock').upsert(stockRows, { onConflict: 'warehouse_id,product_id' })
  if (sErr) throw new Error(`stock upsert failed: ${sErr.message}`)

  console.log('Seeding stock_movements (no created_by — column doesn\'t exist on this table)…')
  // Clear existing movements at this warehouse (clean re-run)
  await sb.from('stock_movement').delete().eq('warehouse_id', WAREHOUSE_ID)
  // Note: skipping reservation_in movements — the stock rows already
  // carry the post-reservation state (reserved_qty values set above).
  // The stock-update trigger would otherwise try to MOVE additional qty
  // from available → reserved, pushing VFD/HT_SWG below zero
  // (which CHECK (available_qty >= 0) rejects). For the demo, the
  // current stock snapshot is what matters; reservation history is
  // recorded conceptually in the sales_order's expected delivery.
  const moveRows = [
    { tenant_id: RAJ_TENANT_ID, warehouse_id: WAREHOUSE_ID, product_id: PROD_HT_CABLE,    movement_type: 'receipt',          quantity:  800, reason_code: 'Production receipt' },
    { tenant_id: RAJ_TENANT_ID, warehouse_id: WAREHOUSE_ID, product_id: PROD_TRANSFORMER, movement_type: 'receipt',          quantity:    2, reason_code: 'Vendor delivery (Schneider)' },
    { tenant_id: RAJ_TENANT_ID, warehouse_id: WAREHOUSE_ID, product_id: PROD_LT_CABLE,    movement_type: 'receipt',          quantity:  500, reason_code: 'Production receipt' },
  ]
  const { error: mErr } = await sb.from('stock_movement').insert(moveRows)
  if (mErr) throw new Error(`stock_movement insert failed: ${mErr.message}`)

  // Verify
  const { data: stockNow } = await sb.from('stock').select('product_id, available_qty, reserved_qty').eq('tenant_id', RAJ_TENANT_ID)
  const { data: moveNow } = await sb.from('stock_movement').select('movement_type, quantity').eq('tenant_id', RAJ_TENANT_ID)
  console.log(JSON.stringify({
    ok: true,
    stock_rows: stockNow?.length ?? 0,
    movement_rows: moveNow?.length ?? 0,
  }, null, 2))
}

main().catch((err) => {
  console.error(`fix-raj-inventory failed: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
