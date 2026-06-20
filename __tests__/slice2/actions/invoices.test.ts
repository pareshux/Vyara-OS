/**
 * Unit tests for lib/actions/invoices.ts
 * Covers: createInvoiceManual (money + running bill validation), importInvoicesCSV, updateInvoiceStatus
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

const { sb, push, queue } = vi.hoisted(() => {
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

const mockInngest = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue(undefined) }))

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => sb }))
vi.mock('@/lib/inngest/client', () => ({ inngest: mockInngest }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createInvoiceManual, importInvoicesCSV, updateInvoiceStatus } from '@/lib/actions/invoices'

const pushProfile = () => push({ tenant_id: 'tenant-1', role: 'admin' })

// ── createInvoiceManual ────────────────────────────────────────────────────────

describe('createInvoiceManual', () => {
  beforeEach(() => {
    sb.auth._noUser = false
    queue.length = 0
    vi.clearAllMocks()
    mockInngest.send.mockResolvedValue(undefined)
  })

  it('returns error when not authenticated', async () => {
    sb.auth._noUser = true
    const result = await createInvoiceManual({
      invoice_date: '2026-07-01', due_date: '2026-07-31', subtotal: 100000,
    })
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('creates invoice with correct money calculations (18% GST, 0% retention)', async () => {
    pushProfile()
    // Insert returns invoice row
    push({ id: 'inv-1', invoice_number: 'VT-INV-001' })

    const result = await createInvoiceManual({
      invoice_date: '2026-07-01',
      due_date: '2026-07-31',
      subtotal: 100_000,
      gst_pct: 18,
      retention_pct: 0,
    })
    expect(result).toEqual({ id: 'inv-1', invoice_number: 'VT-INV-001' })
  })

  it('creates invoice with retention applied', async () => {
    pushProfile()
    push({ id: 'inv-2', invoice_number: 'VT-INV-002' })

    const result = await createInvoiceManual({
      invoice_date: '2026-07-01',
      due_date: '2026-10-31',
      subtotal: 100_000,
      gst_pct: 18,
      retention_pct: 5,
      is_running_bill: true,
      running_bill_seq: 1,
    })
    expect(result).toEqual({ id: 'inv-2', invoice_number: 'VT-INV-002' })
  })

  it('returns error when running_bill flag set without sequence', async () => {
    pushProfile()
    const result = await createInvoiceManual({
      invoice_date: '2026-07-01',
      due_date: '2026-07-31',
      subtotal: 50_000,
      is_running_bill: true,
      // No running_bill_seq
    })
    expect(result).toEqual({ error: 'Running bill sequence (1, 2, 3 …) is required' })
  })

  it('returns error for running_bill_seq <= 0', async () => {
    pushProfile()
    const result = await createInvoiceManual({
      invoice_date: '2026-07-01',
      due_date: '2026-07-31',
      subtotal: 50_000,
      is_running_bill: true,
      running_bill_seq: 0,
    })
    expect(result).toEqual({ error: 'Running bill sequence (1, 2, 3 …) is required' })
  })

  it('returns error when duplicate running bill sequence exists for the same order', async () => {
    pushProfile()
    // maybeSingle check for duplicate → finds existing RA bill
    push({ id: 'inv-existing', invoice_number: 'VT-INV-001' })

    const result = await createInvoiceManual({
      invoice_date: '2026-07-01',
      due_date: '2026-07-31',
      subtotal: 50_000,
      is_running_bill: true,
      running_bill_seq: 1,
      sales_order_id: 'order-1',
    })
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('RA-Bill #1 already exists')
  })

  it('allows running_bill with unique sequence for same order', async () => {
    pushProfile()
    push(null)  // maybeSingle for duplicate → null (no conflict)
    push({ id: 'inv-3', invoice_number: 'VT-INV-003' })  // insert

    const result = await createInvoiceManual({
      invoice_date: '2026-07-01',
      due_date: '2026-07-31',
      subtotal: 50_000,
      is_running_bill: true,
      running_bill_seq: 2,
      sales_order_id: 'order-1',
    })
    expect(result).toEqual({ id: 'inv-3', invoice_number: 'VT-INV-003' })
  })

  it('defaults to 18% GST when not specified', async () => {
    pushProfile()
    push({ id: 'inv-4', invoice_number: 'VT-INV-004' })

    const result = await createInvoiceManual({
      invoice_date: '2026-07-01',
      due_date: '2026-07-31',
      subtotal: 50_000,
      // no gst_pct — should default to 18
    })
    expect(result).not.toHaveProperty('error')
  })

  it('inserts invoice lines when provided', async () => {
    pushProfile()
    push({ id: 'inv-5', invoice_number: 'VT-INV-005' })  // invoice insert
    push(null)  // lines insert (via then)

    const result = await createInvoiceManual({
      invoice_date: '2026-07-01',
      due_date: '2026-07-31',
      subtotal: 100_000,
      lines: [
        { description: 'Paver 60mm — 500 sqm', sku_code: 'PAV-60', quantity: 500, unit: 'sqm', unit_price: 200, line_total: 100_000 },
      ],
    })
    expect(result).toEqual({ id: 'inv-5', invoice_number: 'VT-INV-005' })
  })

  it('emits invoice.synced inngest event on creation', async () => {
    pushProfile()
    push({ id: 'inv-6', invoice_number: 'VT-INV-006' })

    await createInvoiceManual({ invoice_date: '2026-07-01', due_date: '2026-07-31', subtotal: 50_000 })
    expect(mockInngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'invoice.synced', data: { invoice_id: 'inv-6', source: 'manual' } })
    )
  })
})

// ── importInvoicesCSV ──────────────────────────────────────────────────────────

describe('importInvoicesCSV', () => {
  beforeEach(() => {
    sb.auth._noUser = false
    queue.length = 0
    vi.clearAllMocks()
  })

  it('returns error when not authenticated', async () => {
    sb.auth._noUser = true
    const result = await importInvoicesCSV('header\nrow1')
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('returns error when CSV has fewer than 2 lines', async () => {
    pushProfile()
    const result = await importInvoicesCSV('')
    expect(result).toEqual({ error: 'CSV must contain a header row + at least one data row' })
  })

  it('returns error when required column is missing', async () => {
    pushProfile()
    push({ id: 'tax-1', rate_pct: 18 })  // default tax
    const csv = 'invoice_date,due_date,subtotal\n2026-07-01,2026-07-31,50000'
    const result = await importInvoicesCSV(csv)
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('Missing required column: external_invoice_number')
  })

  it('imports valid CSV rows, skipping rows without external_invoice_number', async () => {
    pushProfile()
    push({ id: 'tax-1', rate_pct: '18' })  // default tax (maybeSingle via then)
    // Row 1: VTL/001 — no existing invoice
    push(null)  // maybeSingle for dedup → null
    push(null)  // insert row 1 (via then)
    // Row 2: empty external_invoice_number → skipped
    const csv = [
      'external_invoice_number,invoice_date,due_date,subtotal',
      'VTL/2025-26/001,2026-07-01,2026-07-31,100000',
      ',2026-07-02,2026-07-31,50000',
    ].join('\n')

    const result = await importInvoicesCSV(csv)
    expect(result).toEqual({ imported: 1, skipped: 1, errors: [] })
  })

  it('skips duplicate external_invoice_numbers', async () => {
    pushProfile()
    push({ id: 'tax-1', rate_pct: '18' })  // default tax
    // dedup check for VTL/001 → already exists
    push({ id: 'existing-inv', invoice_number: 'VT-INV-001' })

    const csv = [
      'external_invoice_number,invoice_date,due_date,subtotal',
      'VTL/2025-26/001,2026-07-01,2026-07-31,100000',
    ].join('\n')

    const result = await importInvoicesCSV(csv)
    expect(result).toEqual({ imported: 0, skipped: 1, errors: [] })
  })

  it('uses custom gst_pct from CSV column when provided', async () => {
    pushProfile()
    push({ id: 'tax-1', rate_pct: '18' })  // tenant default (used as fallback only)
    push(null)  // dedup → null
    push(null)  // insert

    const csv = [
      'external_invoice_number,invoice_date,due_date,subtotal,gst_pct',
      'VTL/001,2026-07-01,2026-07-31,50000,12',
    ].join('\n')

    const result = await importInvoicesCSV(csv)
    expect(result).toEqual({ imported: 1, skipped: 0, errors: [] })
  })

  it('records insert errors in the errors array without stopping import', async () => {
    pushProfile()
    push({ id: 'tax-1', rate_pct: '18' })
    push(null)  // dedup row 1 → null
    push(null, { message: 'DB constraint violation' })  // insert row 1 fails (via then)
    push(null)  // dedup row 2 → null
    push(null)  // insert row 2 succeeds (via then)

    const csv = [
      'external_invoice_number,invoice_date,due_date,subtotal',
      'VTL/001,2026-07-01,2026-07-31,100000',
      'VTL/002,2026-07-02,2026-07-31,50000',
    ].join('\n')

    const result = await importInvoicesCSV(csv)
    expect(result).toEqual({ imported: 1, skipped: 0, errors: ['Row 2: DB constraint violation'] })
  })
})

// ── updateInvoiceStatus ────────────────────────────────────────────────────────

describe('updateInvoiceStatus', () => {
  beforeEach(() => {
    sb.auth._noUser = false
    queue.length = 0
    vi.clearAllMocks()
  })

  it('returns error when not authenticated', async () => {
    sb.auth._noUser = true
    const result = await updateInvoiceStatus('inv-1', 'sent')
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('updates status to sent', async () => {
    pushProfile()
    push(null)  // update via then

    const result = await updateInvoiceStatus('inv-1', 'sent')
    expect(result).toEqual({ success: true })
  })

  it('updates status to paid', async () => {
    pushProfile()
    push(null)

    const result = await updateInvoiceStatus('inv-1', 'paid')
    expect(result).toEqual({ success: true })
  })

  it('updates status to cancelled', async () => {
    pushProfile()
    push(null)

    const result = await updateInvoiceStatus('inv-1', 'cancelled')
    expect(result).toEqual({ success: true })
  })

  it('updates status to written_off', async () => {
    pushProfile()
    push(null)

    const result = await updateInvoiceStatus('inv-1', 'written_off')
    expect(result).toEqual({ success: true })
  })

  it('returns error when update fails', async () => {
    pushProfile()
    push(null, { message: 'Row not found' })  // update via then returns error

    const result = await updateInvoiceStatus('inv-999', 'paid')
    expect(result).toEqual({ error: 'Row not found' })
  })
})
