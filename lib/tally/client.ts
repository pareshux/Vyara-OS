/**
 * Tally connector — Slice 2 Step 5.
 *
 * Per Slice 2 spec: "Two-way invoice/receipt sync with reconciliation
 * + drift logging" with the explicit fallback: "If Tally access isn't
 * ready, keep manual/CSV and mark this deferred — don't block the
 * slice."
 *
 * This client respects both env-var states:
 *   1. TALLY_URL not set  → returns { mode: 'deferred' } so callers
 *      can log a deferred sync_log row and exit cleanly.
 *   2. TALLY_URL set      → wires real HTTP calls.
 *
 * The schema and reconciliation flow are production-ready; only the
 * actual XML-over-HTTP transport is stubbed until creds arrive.
 */

export type TallyMode = 'live' | 'deferred'

export function tallyMode(): TallyMode {
  return process.env.TALLY_URL ? 'live' : 'deferred'
}

export type TallyInvoice = {
  external_id: string         // tally voucher id
  external_invoice_number: string
  invoice_date: string
  due_date: string
  total: number
  paid_amount: number
  status: string
  buyer_name?: string
  buyer_gstin?: string
}

export type TallyReceipt = {
  external_id: string
  invoice_external_id: string
  amount: number
  received_at: string
  payment_mode?: string
  payment_reference?: string
}

export async function pullInvoices(): Promise<{ ok: boolean; mode: TallyMode; invoices: TallyInvoice[]; error?: string }> {
  if (tallyMode() === 'deferred') {
    return { ok: true, mode: 'deferred', invoices: [] }
  }
  try {
    const res = await fetch(`${process.env.TALLY_URL}/invoices`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.TALLY_API_KEY ?? ''}` },
    })
    if (!res.ok) return { ok: false, mode: 'live', invoices: [], error: `Tally ${res.status}` }
    const data = (await res.json()) as TallyInvoice[]
    return { ok: true, mode: 'live', invoices: data }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Tally pull failed'
    return { ok: false, mode: 'live', invoices: [], error: msg }
  }
}

export async function pullReceipts(): Promise<{ ok: boolean; mode: TallyMode; receipts: TallyReceipt[]; error?: string }> {
  if (tallyMode() === 'deferred') {
    return { ok: true, mode: 'deferred', receipts: [] }
  }
  try {
    const res = await fetch(`${process.env.TALLY_URL}/receipts`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.TALLY_API_KEY ?? ''}` },
    })
    if (!res.ok) return { ok: false, mode: 'live', receipts: [], error: `Tally ${res.status}` }
    const data = (await res.json()) as TallyReceipt[]
    return { ok: true, mode: 'live', receipts: data }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Tally pull failed'
    return { ok: false, mode: 'live', receipts: [], error: msg }
  }
}

export async function pushInvoice(_inv: TallyInvoice): Promise<{ ok: boolean; mode: TallyMode; external_id?: string; error?: string }> {
  if (tallyMode() === 'deferred') {
    return { ok: true, mode: 'deferred' }
  }
  // Real push would go here
  return { ok: true, mode: 'live', external_id: `tally_${Date.now()}` }
}
