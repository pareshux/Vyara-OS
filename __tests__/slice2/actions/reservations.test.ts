/**
 * Unit tests for lib/actions/reservations.ts
 * Covers: releaseReservation, releaseOrderReservations
 * (attemptReserveOrderLines logic is covered via integration scenarios)
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

const { sb, push } = vi.hoisted(() => {
  const queue: { data: unknown; error: { message: string } | null }[] = []
  const pop = () => queue.shift() ?? { data: null, error: null }
  const push = (d: unknown, e: { message: string } | null = null) => queue.push({ data: d, error: e })

  const b: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(pop()).then(resolve, reject),
    single: () => Promise.resolve(pop()),
    maybeSingle: () => Promise.resolve(pop()),
  }
  const chain = () => b
  ;['select','insert','update','delete','upsert','eq','neq','is','in','or','not','filter','limit','order','gte','lte','head'].forEach(k => { b[k] = chain })

  const sb = {
    from: () => b,
    auth: {
      _noUser: false,
      getUser(this: { _noUser: boolean }) {
        return Promise.resolve({ data: { user: this._noUser ? null : { id: 'test-user' } }, error: null })
      },
    },
  }
  sb.auth.getUser = sb.auth.getUser.bind(sb.auth)
  return { sb, push, queue }
})

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => sb }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { releaseReservation, releaseOrderReservations, attemptReserveOrderLines } from '@/lib/actions/reservations'

const pushProfile = () => push({ tenant_id: 'tenant-1', role: 'admin' })

// ── releaseReservation ────────────────────────────────────────────────────────

describe('releaseReservation', () => {
  beforeEach(() => {
    sb.auth._noUser = false
    vi.clearAllMocks()
  })

  it('returns error when not authenticated', async () => {
    sb.auth._noUser = true
    const result = await releaseReservation('res-1', 'Manual release')
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('returns error when reason is blank', async () => {
    pushProfile()
    const result = await releaseReservation('res-1', '   ')
    expect(result).toEqual({ error: 'Reason required' })
  })

  it('returns error when reservation not found', async () => {
    pushProfile()
    push(null, null)  // reservation single → null

    const result = await releaseReservation('res-bad', 'Test')
    expect(result).toEqual({ error: 'Reservation not found' })
  })

  it('returns error when reservation is not active', async () => {
    pushProfile()
    push({ warehouse_id: 'wh-1', product_id: 'prod-1', quantity: 100, status: 'released', related_entity_id: 'line-1' })

    const result = await releaseReservation('res-1', 'Release attempt')
    expect(result).toEqual({ error: 'Cannot release released reservation' })
  })

  it('releases active reservation and inserts reservation_out movement', async () => {
    pushProfile()
    push({ warehouse_id: 'wh-1', product_id: 'prod-1', quantity: 100, status: 'active', related_entity_id: 'line-1' })
    push(null)  // update reservation status (via then)
    push(null)  // insert stock_movement reservation_out (via then)

    const result = await releaseReservation('res-1', 'Order cancelled by customer')
    expect(result).toEqual({ success: true })
  })

  it('trims whitespace from reason', async () => {
    pushProfile()
    push({ warehouse_id: 'wh-1', product_id: 'prod-1', quantity: 50, status: 'active', related_entity_id: 'line-2' })
    push(null)
    push(null)

    const result = await releaseReservation('res-2', '  Manual release  ')
    expect(result).toEqual({ success: true })
  })
})

// ── releaseOrderReservations ──────────────────────────────────────────────────

describe('releaseOrderReservations', () => {
  beforeEach(() => {
    sb.auth._noUser = false
    vi.clearAllMocks()
  })

  it('returns error when not authenticated', async () => {
    sb.auth._noUser = true
    const result = await releaseOrderReservations('order-1', 'Cancelled')
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('returns { released: 0 } when order has no lines', async () => {
    pushProfile()
    push([])  // sales_order_line query → empty array

    const result = await releaseOrderReservations('order-1', 'Cancelled')
    expect(result).toEqual({ released: 0 })
  })

  it('returns { released: 0 } when no active reservations exist for the order', async () => {
    pushProfile()
    push([{ id: 'line-1' }, { id: 'line-2' }])  // order lines
    push([])  // reservations query → empty

    const result = await releaseOrderReservations('order-1', 'Cancelled')
    expect(result).toEqual({ released: 0 })
  })

  it('releases all active reservations for an order', async () => {
    pushProfile()
    push([{ id: 'line-1' }, { id: 'line-2' }])  // order lines
    push([
      { id: 'res-1', warehouse_id: 'wh-1', product_id: 'prod-1', quantity: 100 },
      { id: 'res-2', warehouse_id: 'wh-1', product_id: 'prod-2', quantity: 50 },
    ])  // reservations
    // For each reservation: update + insert movement
    push(null)  // update res-1 (via then)
    push(null)  // movement for res-1 (via then)
    push(null)  // update res-2 (via then)
    push(null)  // movement for res-2 (via then)

    const result = await releaseOrderReservations('order-1', 'Order cancelled')
    expect(result).toEqual({ released: 2 })
  })
})

// ── attemptReserveOrderLines ──────────────────────────────────────────────────

describe('attemptReserveOrderLines', () => {
  beforeEach(() => {
    sb.auth._noUser = false
    vi.clearAllMocks()
  })

  it('returns error when not authenticated', async () => {
    sb.auth._noUser = true
    const result = await attemptReserveOrderLines('order-1')
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('returns error when no warehouse is configured', async () => {
    pushProfile()
    push({ settings: { inventory: {} } })  // tenant settings (no default_warehouse_code)
    push(null, null)  // fallback warehouse query → null (no own_plant warehouse)

    const result = await attemptReserveOrderLines('order-1')
    expect(result).toEqual({ error: 'No active own_plant warehouse configured for this tenant' })
  })

  it('returns error when order not found', async () => {
    pushProfile()
    push({ settings: { inventory: { default_warehouse_code: 'WH-MAIN' } } })  // tenant
    push({ id: 'wh-1' })  // warehouse by code
    push(null, null)  // order not found

    const result = await attemptReserveOrderLines('bad-order')
    expect(result).toEqual({ error: 'Order not found' })
  })

  it('marks lines as backorder when no stock is available', async () => {
    pushProfile()
    push({ settings: {} })  // tenant (no code)
    push({ id: 'wh-1' })  // fallback warehouse
    push({ id: 'order-1', lines: [{ id: 'line-1', product_id: 'prod-1', sku_code: 'PAV-60', quantity: 100 }] })  // order with lines
    // existing reservation check → null
    push(null)
    // stock check → 0 available
    push({ available_qty: 0 })

    const result = await attemptReserveOrderLines('order-1')
    expect(result).not.toHaveProperty('error')
    const r = result as { results: Array<{ status: string }> }
    expect(r.results[0].status).toBe('backorder')
  })

  it('marks line as no_product when product_id is missing', async () => {
    pushProfile()
    push({ settings: {} })
    push({ id: 'wh-1' })
    push({ id: 'order-1', lines: [{ id: 'line-1', product_id: null, sku_code: 'CUSTOM', quantity: 10 }] })

    const result = await attemptReserveOrderLines('order-1')
    const r = result as { results: Array<{ status: string }> }
    expect(r.results[0].status).toBe('no_product')
  })

  it('creates reservation when sufficient stock is available', async () => {
    pushProfile()
    push({ settings: {} })
    push({ id: 'wh-1' })
    push({ id: 'order-1', lines: [{ id: 'line-1', product_id: 'prod-1', sku_code: 'PAV-60', quantity: 100 }] })
    push(null)  // existing reservation → null (not yet reserved)
    push({ available_qty: 500 })  // stock check
    push({ id: 'res-new' })  // reservation insert
    push(null)  // stock_movement insert (via then)

    const result = await attemptReserveOrderLines('order-1')
    const r = result as { results: Array<{ status: string; reserved: number }> }
    expect(r.results[0].status).toBe('reserved')
    expect(r.results[0].reserved).toBe(100)
  })

  it('creates partial reservation when stock is less than ordered', async () => {
    pushProfile()
    push({ settings: {} })
    push({ id: 'wh-1' })
    push({ id: 'order-1', lines: [{ id: 'line-1', product_id: 'prod-1', sku_code: 'PAV-60', quantity: 500 }] })
    push(null)  // no existing reservation
    push({ available_qty: 200 })  // only 200 available of 500 ordered
    push({ id: 'res-partial' })
    push(null)  // movement

    const result = await attemptReserveOrderLines('order-1')
    const r = result as { results: Array<{ status: string; reserved: number; requested: number }> }
    expect(r.results[0].status).toBe('partial')
    expect(r.results[0].reserved).toBe(200)
    expect(r.results[0].requested).toBe(500)
  })

  it('skips already-reserved lines (idempotent)', async () => {
    pushProfile()
    push({ settings: {} })
    push({ id: 'wh-1' })
    push({ id: 'order-1', lines: [{ id: 'line-1', product_id: 'prod-1', sku_code: 'PAV-60', quantity: 100 }] })
    // Existing active reservation found
    push({ id: 'res-existing', quantity: 100 })

    const result = await attemptReserveOrderLines('order-1')
    const r = result as { results: Array<{ status: string; message: string }> }
    expect(r.results[0].status).toBe('reserved')
    expect(r.results[0].message).toBe('Already reserved')
  })
})
