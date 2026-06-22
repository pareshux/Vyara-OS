/**
 * POST /api/procurement/gstr-2b/upload — accept GSTR-2B CSV upload.
 *
 * Expects multipart/form-data with:
 *   period: 'YYYY-MM'
 *   file:   CSV with columns (case-insensitive, flexible order):
 *           gstin,vendor_name,invoice_no,invoice_date,
 *           invoice_type,taxable_value,igst,cgst,sgst,cess,total,itc_available
 *
 * Calls uploadGstr2bBatch which parses + reconciles.
 *
 * P5γ portal-sync would replace this with a button that pulls from
 * the GSTN API directly using saved credentials.
 */
import { uploadGstr2bBatch, type Gstr2bEntryInput } from '@/lib/actions/gstr-2b'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') inQuotes = false
      else cell += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { cur.push(cell); cell = '' }
      else if (c === '\n') { cur.push(cell); rows.push(cur); cur = []; cell = '' }
      else if (c === '\r') { /* skip */ }
      else cell += c
    }
  }
  if (cell || cur.length > 0) { cur.push(cell); rows.push(cur) }
  return rows.filter((r) => r.some((c) => c.trim().length > 0))
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[\s_-]+/g, '')
}

const COLUMN_ALIASES: Record<string, string[]> = {
  vendor_gstin:        ['gstin', 'vendorgstin', 'supplierssgstin', 'ctingstin'],
  vendor_name:         ['vendorname', 'suppliername', 'tradeName', 'partyname'],
  vendor_invoice_no:   ['invoiceno', 'invoicenumber', 'invoiceno.', 'docno'],
  vendor_invoice_date: ['invoicedate', 'docdate'],
  invoice_type:        ['invoicetype', 'doctype'],
  taxable_value:       ['taxablevalue', 'taxable'],
  igst_amount:         ['igst', 'igstamount'],
  cgst_amount:         ['cgst', 'cgstamount'],
  sgst_amount:         ['sgst', 'sgstamount', 'utgst'],
  cess_amount:         ['cess', 'cessamount'],
  total:               ['total', 'invoicevalue', 'totalvalue'],
  itc_available:       ['itcavailable', 'itc', 'eligibleforitc'],
}

function mapColumns(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {}
  const normalized = headerRow.map(normalizeHeader)
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const idx = normalized.indexOf(alias)
      if (idx !== -1) { map[key] = idx; break }
    }
  }
  return map
}

function parseIndianDate(s: string): string | null {
  // Try ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  // Try DD-MM-YYYY or DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/)
  if (m) {
    const dd = m[1].padStart(2, '0')
    const mm = m[2].padStart(2, '0')
    const yyyy = m[3]
    return `${yyyy}-${mm}-${dd}`
  }
  return null
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const form = await request.formData()
  const period = (form.get('period') as string | null)?.trim() ?? ''
  const file = form.get('file') as File | null

  if (!/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: 'period must be YYYY-MM' }, { status: 400 })
  }
  if (!file) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  const text = await file.text()
  const rows = parseCsv(text)
  if (rows.length < 2) {
    return NextResponse.json({ error: 'CSV needs a header row + at least one data row' }, { status: 400 })
  }

  const header = rows[0]
  const map = mapColumns(header)

  // Validate required columns
  const required = ['vendor_gstin', 'vendor_invoice_no', 'vendor_invoice_date', 'total']
  const missing = required.filter((k) => !(k in map))
  if (missing.length > 0) {
    return NextResponse.json({
      error: `Missing required columns: ${missing.join(', ')}. Found: ${header.join(', ')}`,
    }, { status: 400 })
  }

  const entries: Gstr2bEntryInput[] = []
  const errors: string[] = []

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const get = (k: string): string => map[k] != null ? (r[map[k]] ?? '').trim() : ''
    const dateStr = get('vendor_invoice_date')
    const isoDate = parseIndianDate(dateStr)
    if (!isoDate) {
      errors.push(`Row ${i + 1}: invalid date "${dateStr}"`)
      continue
    }
    const total = parseFloat(get('total').replace(/,/g, ''))
    if (!Number.isFinite(total)) {
      errors.push(`Row ${i + 1}: invalid total "${get('total')}"`)
      continue
    }
    const itcAvailRaw = get('itc_available').toLowerCase()
    const itcAvailable = itcAvailRaw === '' ? true : ['y', 'yes', 'true', '1'].includes(itcAvailRaw)

    entries.push({
      vendor_gstin: get('vendor_gstin'),
      vendor_name: get('vendor_name'),
      vendor_invoice_no: get('vendor_invoice_no'),
      vendor_invoice_date: isoDate,
      invoice_type: get('invoice_type') || 'B2B',
      taxable_value: parseFloat(get('taxable_value').replace(/,/g, '')) || 0,
      igst_amount: parseFloat(get('igst_amount').replace(/,/g, '')) || 0,
      cgst_amount: parseFloat(get('cgst_amount').replace(/,/g, '')) || 0,
      sgst_amount: parseFloat(get('sgst_amount').replace(/,/g, '')) || 0,
      cess_amount: parseFloat(get('cess_amount').replace(/,/g, '')) || 0,
      total,
      itc_available: itcAvailable,
    })
  }

  if (entries.length === 0) {
    return NextResponse.json({
      error: 'No valid rows parsed',
      details: errors.slice(0, 10),
    }, { status: 400 })
  }

  const result = await uploadGstr2bBatch({ period, entries })
  if (!result.ok) {
    return NextResponse.json({ error: result.error, parse_errors: errors }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    period,
    inserted: result.inserted,
    matched_after_recon: result.matched,
    bills_updated: result.updated,
    parse_errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
  })
}
