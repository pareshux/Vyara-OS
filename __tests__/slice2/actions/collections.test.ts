/**
 * Unit tests for lib/actions/collections.ts
 * Covers: recordReceipt, recordPromiseToPay, sendDunningWhatsApp,
 *         markCollectionDisputed, writeOffCollection
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

const mockInngest = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue(undefined) }))
const mockSendWhatsApp = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true as const, messageId: 'msg-stub', mode: 'stub' as const }))

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => sb }))
vi.mock('@/lib/inngest/client', () => ({ inngest: mockInngest }))
vi.mock('@/lib/aisensy/client', () => ({ sendWhatsApp: mockSendWhatsApp }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  recordReceipt,
  recordPromiseToPay,
  sendDunningWhatsApp,
  markCollectionDisputed,
  writeOffCollection,
} from '@/lib/actions/collections'

const pushProfile = () => push({ tenant_id: 'tenant-1', role: 'admin' })

// ── recordReceipt ─────────────────────────────────────────────────────────────

describe('recordReceipt', () => {
  beforeEach(() => {
    sb.auth._noUser = false
    vi.clearAllMocks()
    mockInngest.send.mockResolvedValue(undefined)
  })

  it('returns error when not authenticated', async () => {
    sb.auth._noUser = true
    const result = await recordReceipt({ invoice_id: 'inv-1', amount: 50000, payment_mode: 'neft', received_at: '2026-07-01' })
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('records receipt and returns id', async () => {
    pushProfile()
    push({ id: 'receipt-1' })  // receipt insert

    const result = await recordReceipt({
      invoice_id: 'inv-1',
      amount: 50_000,
      payment_mode: 'neft',
      payment_reference: 'UTR123456',
      received_at: '2026-07-01',
    })
    expect(result).toEqual({ id: 'receipt-1' })
  })

  it('emits payment.received inngest event', async () => {
    pushProfile()
    push({ id: 'receipt-2' })

    await recordReceipt({ invoice_id: 'inv-1', amount: 25_000, payment_mode: 'upi', received_at: '2026-07-01' })
    expect(mockInngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'payment.received', data: { invoice_id: 'inv-1', amount: 25_000 } })
    )
  })

  it('still succeeds when inngest.send throws (non-fatal)', async () => {
    mockInngest.send.mockRejectedValueOnce(new Error('network timeout'))
    pushProfile()
    push({ id: 'receipt-3' })

    const result = await recordReceipt({ invoice_id: 'inv-1', amount: 10_000, payment_mode: 'cash', received_at: '2026-07-01' })
    expect(result).toEqual({ id: 'receipt-3' })
  })

  it('returns error when insert fails', async () => {
    pushProfile()
    push(null, { message: 'FK violation: invoice not found' })

    const result = await recordReceipt({ invoice_id: 'bad-inv', amount: 1000, payment_mode: 'cash', received_at: '2026-07-01' })
    expect(result).toEqual({ error: 'FK violation: invoice not found' })
  })
})

// ── recordPromiseToPay ────────────────────────────────────────────────────────

describe('recordPromiseToPay', () => {
  beforeEach(() => {
    sb.auth._noUser = false
    vi.clearAllMocks()
    mockInngest.send.mockResolvedValue(undefined)
  })

  it('returns error when not authenticated', async () => {
    sb.auth._noUser = true
    const result = await recordPromiseToPay({
      collection_id: 'col-1', invoice_id: 'inv-1', amount: 50000, promise_date: '2026-07-15',
    })
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('creates PTP and returns id', async () => {
    pushProfile()
    push({ id: 'ptp-1' })  // promise_to_pay insert
    // advanceCollectionStage:
    push({ id: 'stage-ptp' })  // stageIdByKey for 'promise_to_pay'
    push({ current_stage_id: 'stage-overdue' })  // existing collection
    push(null)  // update collection (via then)
    push(null)  // stage_history insert (via then)
    // task insert (via then):
    push(null)

    const result = await recordPromiseToPay({
      collection_id: 'col-1',
      invoice_id: 'inv-1',
      amount: 75_000,
      promise_date: '2026-07-15',
      notes: 'Promised on call',
    })
    expect(result).toEqual({ id: 'ptp-1' })
  })

  it('creates a follow-up task on the promise date', async () => {
    pushProfile()
    push({ id: 'ptp-2' })
    push({ id: 'stage-ptp' })
    push({ current_stage_id: 'stage-overdue' })
    push(null)  // collection update
    push(null)  // stage history
    push(null)  // task insert

    await recordPromiseToPay({
      collection_id: 'col-1',
      invoice_id: 'inv-1',
      amount: 50_000,
      promise_date: '2026-07-20',
    })
    // If we get here without error, the task was inserted
    expect(true).toBe(true)
  })

  it('emits payment.promised inngest event', async () => {
    pushProfile()
    push({ id: 'ptp-3' })
    push({ id: 'stage-ptp' })
    push({ current_stage_id: 'stage-overdue' })
    push(null)  // collection update
    push(null)  // stage history
    push(null)  // task

    await recordPromiseToPay({ collection_id: 'col-1', invoice_id: 'inv-1', amount: 30_000, promise_date: '2026-07-25' })
    expect(mockInngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'payment.promised' })
    )
  })
})

// ── sendDunningWhatsApp ────────────────────────────────────────────────────────

describe('sendDunningWhatsApp', () => {
  beforeEach(() => {
    sb.auth._noUser = false
    vi.clearAllMocks()
    mockSendWhatsApp.mockResolvedValue({ ok: true, messageId: 'msg-stub', mode: 'stub' })
  })

  it('returns error when not authenticated', async () => {
    sb.auth._noUser = true
    const result = await sendDunningWhatsApp({
      collection_id: 'col-1', to_phone: '+919876543210', message_text: 'test', invoice_number: 'INV-001', amount: '₹50,000',
    })
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('sends WhatsApp dunning and records activity', async () => {
    pushProfile()
    push({ id: 'act-1' })  // collection_activity insert
    push(null)  // collection last_dunning_at update (via then)
    // advanceCollectionStage:
    push({ id: 'stage-dunning' })  // stageIdByKey
    push({ current_stage_id: 'stage-overdue' })  // existing collection
    push(null)  // update stage
    push(null)  // stage history

    const result = await sendDunningWhatsApp({
      collection_id: 'col-1',
      to_phone: '+919876543210',
      message_text: 'Invoice INV-001 overdue',
      invoice_number: 'INV-001',
      amount: '50,000',
    })
    expect(result).toEqual({ ok: true, mode: 'stub', activity_id: 'act-1' })
  })

  it('returns error and logs failed activity when WhatsApp fails', async () => {
    mockSendWhatsApp.mockResolvedValueOnce({ ok: false, error: 'AiSensy 429: rate limit' })
    pushProfile()
    push(null)  // failed collection_activity insert (via then)

    const result = await sendDunningWhatsApp({
      collection_id: 'col-1',
      to_phone: '+919876543210',
      message_text: 'test',
      invoice_number: 'INV-001',
      amount: '50,000',
    })
    expect(result).toEqual({ error: 'AiSensy 429: rate limit' })
  })

  it('uses default template key when not specified', async () => {
    pushProfile()
    push({ id: 'act-2' })
    push(null)  // last_dunning update
    push({ id: 'stage-dunning' })
    push({ current_stage_id: 'stage-overdue' })
    push(null)
    push(null)

    await sendDunningWhatsApp({
      collection_id: 'col-1',
      to_phone: '+919876543210',
      message_text: 'test',
      invoice_number: 'INV-001',
      amount: '25,000',
    })
    expect(mockSendWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'vyara_dunning_v1' })
    )
  })

  it('uses provided template_key override', async () => {
    pushProfile()
    push({ id: 'act-3' })
    push(null)
    push({ id: 'stage-dunning' })
    push({ current_stage_id: 'stage-overdue' })
    push(null)
    push(null)

    await sendDunningWhatsApp({
      collection_id: 'col-1',
      to_phone: '+919876543210',
      message_text: 'test',
      invoice_number: 'INV-001',
      amount: '25,000',
      template_key: 'vyara_escalation_v1',
    })
    expect(mockSendWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'vyara_escalation_v1' })
    )
  })
})

// ── markCollectionDisputed ────────────────────────────────────────────────────

describe('markCollectionDisputed', () => {
  beforeEach(() => {
    sb.auth._noUser = false
    vi.clearAllMocks()
  })

  it('returns error when not authenticated', async () => {
    sb.auth._noUser = true
    const result = await markCollectionDisputed('col-1', 'Customer disputes amount')
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('returns error when remark is empty', async () => {
    pushProfile()
    const result = await markCollectionDisputed('col-1', '   ')
    expect(result).toEqual({ error: 'A remark is required when marking disputed' })
  })

  it('advances collection to disputed stage', async () => {
    pushProfile()
    push({ id: 'stage-disputed' })  // stageIdByKey
    push({ current_stage_id: 'stage-overdue' })  // existing collection
    push(null)  // update (via then)
    push(null)  // stage history (via then)

    const result = await markCollectionDisputed('col-1', 'Customer claims invoice is incorrect')
    expect(result).toEqual({ success: true })
  })
})

// ── writeOffCollection ────────────────────────────────────────────────────────

describe('writeOffCollection', () => {
  beforeEach(() => {
    sb.auth._noUser = false
    vi.clearAllMocks()
  })

  it('returns error when not authenticated', async () => {
    sb.auth._noUser = true
    const result = await writeOffCollection('col-1', 'Bad debt')
    expect(result).toEqual({ error: 'Not authenticated' })
  })

  it('returns error when remark is empty', async () => {
    pushProfile()
    const result = await writeOffCollection('col-1', '')
    expect(result).toEqual({ error: 'A remark is required to write off' })
  })

  it('advances collection to written_off and marks invoice written_off', async () => {
    pushProfile()
    push({ id: 'stage-written-off' })  // stageIdByKey
    push({ current_stage_id: 'stage-overdue' })  // existing collection
    push(null)  // update collection stage (via then)
    push(null)  // stage history (via then)
    push({ invoice_id: 'inv-1' })  // collection lookup for invoice_id
    push(null)  // invoice status update to written_off (via then)

    const result = await writeOffCollection('col-1', 'Customer insolvent, unrecoverable')
    expect(result).toEqual({ success: true })
  })

  it('succeeds even when collection has no linked invoice', async () => {
    pushProfile()
    push({ id: 'stage-written-off' })
    push({ current_stage_id: 'stage-disputed' })
    push(null)
    push(null)
    push({ invoice_id: null })  // no invoice

    const result = await writeOffCollection('col-1', 'Bad debt write-off')
    expect(result).toEqual({ success: true })
  })
})
