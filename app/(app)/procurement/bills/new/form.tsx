'use client'

/**
 * NewVendorBillForm — book a vendor invoice against a PO.
 *
 * Lines pre-fill from the PO snapshot (qty = qty_billable, rate, HSN,
 * GST%). User can edit any of those to reflect what the vendor's
 * invoice actually says — that's the point of 3-way match: catch
 * mismatches the vendor introduces.
 */
import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle, Receipt } from 'lucide-react'
import { createVendorBill, type PoForBilling, type VendorBillLineInput } from '@/lib/actions/vendor-bills'

interface Props {
  po: PoForBilling
}

type LineDraft = {
  po_line_id: string
  line_no: number
  description: string
  hsn_code: string
  unit: string
  product_id: string | null
  qty_ordered: number
  qty_received: number
  qty_billed_already: number
  qty_billable: number
  po_rate: number
  po_gst_rate: number
  // Editable
  qty: string
  rate: string
  hsn: string
  gst: string
}

const GST_RATES = ['0', '5', '12', '18', '28']

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export function NewVendorBillForm({ po }: Props) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  // Header
  const [vendorInvoiceNo, setVendorInvoiceNo] = useState('')
  const [vendorInvoiceDate, setVendorInvoiceDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [billDate, setBillDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [receivedAt, setReceivedAt] = useState<string>('')
  const [notes, setNotes] = useState('')

  // Lines pre-filled from PO
  const [lines, setLines] = useState<LineDraft[]>(
    po.lines.map((l) => ({
      po_line_id: l.id,
      line_no: l.line_no,
      description: l.description,
      hsn_code: l.hsn_code ?? '',
      unit: l.unit,
      product_id: l.product_id,
      qty_ordered: l.quantity,
      qty_received: l.qty_received,
      qty_billed_already: l.qty_billed,
      qty_billable: l.qty_billable,
      po_rate: l.rate,
      po_gst_rate: l.gst_rate_pct,
      // Editable — default to billable headroom + PO rate/HSN/GST
      qty: l.qty_billable > 0 ? String(l.qty_billable) : '0',
      rate: String(l.rate),
      hsn: l.hsn_code ?? '',
      gst: String(l.gst_rate_pct),
    })),
  )

  function updateLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  // Live preview of bill total + mismatch warnings (server runs the
  // authoritative match; this is just user-facing UX).
  const preview = useMemo(() => {
    let subtotal = 0
    let tax = 0
    const warnings: Array<{ line: number; kind: string; msg: string }> = []
    for (const l of lines) {
      const q = Number(l.qty) || 0
      const r = Number(l.rate) || 0
      const g = Number(l.gst) || 0
      if (q === 0) continue
      const taxable = r2(q * r)
      const lineTax = r2(taxable * (g / 100))
      subtotal += taxable
      tax += lineTax
      // Local mismatch hints
      if (q > l.qty_billable + 1e-6) {
        warnings.push({ line: l.line_no, kind: 'qty_over', msg: `qty ${q} > billable ${l.qty_billable}` })
      }
      if (r2(r) !== r2(l.po_rate)) {
        warnings.push({ line: l.line_no, kind: 'rate_mismatch', msg: `rate ₹${r.toFixed(2)} vs PO ₹${l.po_rate.toFixed(2)}` })
      }
      if (Number(l.gst) !== Number(l.po_gst_rate)) {
        warnings.push({ line: l.line_no, kind: 'gst_mismatch', msg: `GST ${g}% vs PO ${l.po_gst_rate}%` })
      }
    }
    return { subtotal: r2(subtotal), tax: r2(tax), total: r2(subtotal + tax), warnings }
  }, [lines])

  async function save(submit: boolean) {
    setErr(null)
    if (!vendorInvoiceNo.trim()) { setErr('Vendor invoice number is required'); return }
    if (!vendorInvoiceDate) { setErr('Vendor invoice date is required'); return }

    const payload: VendorBillLineInput[] = []
    for (const l of lines) {
      const q = Number(l.qty) || 0
      if (q === 0) continue
      if (q < 0) { setErr(`Line ${l.line_no}: qty cannot be negative`); return }
      const r = Number(l.rate) || 0
      if (r < 0) { setErr(`Line ${l.line_no}: rate cannot be negative`); return }
      payload.push({
        po_line_id: l.po_line_id,
        product_id: l.product_id,
        description: l.description,
        hsn_code: l.hsn.trim() || null,
        unit: l.unit,
        quantity: q,
        rate: r,
        gst_rate_pct: Number(l.gst) || 0,
      })
    }
    if (payload.length === 0) { setErr('Set qty > 0 on at least one line'); return }

    startTransition(async () => {
      const res = await createVendorBill({
        vendor_id: po.vendor_id,
        po_id: po.id,
        vendor_invoice_no: vendorInvoiceNo.trim(),
        vendor_invoice_date: vendorInvoiceDate,
        bill_date: billDate,
        received_at: receivedAt || null,
        notes: notes.trim() || undefined,
        lines: payload,
        submit_immediately: submit,
      })
      if (!res.ok) { setErr(res.error); toast.error(res.error); return }
      const msg = res.match_status === 'matched'
        ? `${res.bill_number} booked · 3-way match clean`
        : res.match_status === 'mismatched'
          ? `${res.bill_number} booked · ⚠ mismatches flagged`
          : `${res.bill_number} booked · review needed`
      toast.success(msg)
      router.push(`/procurement/bills/${res.id}`)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="grid md:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label className="text-xs">Vendor invoice number *</Label>
            <Input
              value={vendorInvoiceNo}
              onChange={(e) => setVendorInvoiceNo(e.target.value)}
              placeholder="The number printed on the vendor's tax invoice"
              className="font-mono"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Vendor invoice date *</Label>
            <Input type="date" value={vendorInvoiceDate} onChange={(e) => setVendorInvoiceDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Booking date</Label>
            <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Goods received on (drives MSME 45-day)</Label>
            <Input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} placeholder="From GRN" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium inline-flex items-center gap-1.5">
              <Receipt className="size-3.5" /> Lines (3-way match)
            </div>
            <div className="text-xs text-muted-foreground">
              Edit qty / rate / HSN / GST% to reflect what the vendor invoice says
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {lines.map((l, idx) => {
              const q = Number(l.qty) || 0
              const r = Number(l.rate) || 0
              const g = Number(l.gst) || 0
              const taxable = r2(q * r)
              const tax = r2(taxable * (g / 100))
              const total = r2(taxable + tax)
              const qtyOver = q > l.qty_billable + 1e-6
              const rateMismatch = q > 0 && r2(r) !== r2(l.po_rate)
              const gstMismatch = q > 0 && Number(l.gst) !== Number(l.po_gst_rate)
              const noBillable = l.qty_billable <= 0
              return (
                <div key={l.po_line_id} className="rounded-md border border-border p-3 flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">Line {l.line_no} — {l.description}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                        PO qty: {l.qty_ordered} · received: {l.qty_received} · billed: {l.qty_billed_already}
                        {' · '}
                        <span className={noBillable ? 'text-amber-700' : 'text-emerald-700'}>billable: {l.qty_billable}</span>
                        {' · '}PO rate ₹{l.po_rate.toFixed(2)} @ {l.po_gst_rate}% GST
                      </div>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-12 gap-2">
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">Bill qty</Label>
                      <Input
                        type="number" step="0.001" min="0"
                        value={l.qty}
                        onChange={(e) => updateLine(idx, { qty: e.target.value })}
                        className={`tabular-nums ${qtyOver ? 'border-rose-500' : ''}`}
                      />
                      {qtyOver && <div className="text-[10px] text-rose-700">Over-billing PO line</div>}
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">Bill rate (₹)</Label>
                      <Input
                        type="number" step="0.01" min="0"
                        value={l.rate}
                        onChange={(e) => updateLine(idx, { rate: e.target.value })}
                        className={`tabular-nums ${rateMismatch ? 'border-amber-500' : ''}`}
                      />
                      {rateMismatch && (
                        <div className="text-[10px] text-amber-700">
                          {r > l.po_rate ? `+₹${(r - l.po_rate).toFixed(2)}/unit vs PO` : `−₹${(l.po_rate - r).toFixed(2)}/unit vs PO`}
                        </div>
                      )}
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">HSN/SAC</Label>
                      <Input
                        value={l.hsn}
                        onChange={(e) => updateLine(idx, { hsn: e.target.value })}
                        className="font-mono"
                      />
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">GST%</Label>
                      <select
                        value={l.gst}
                        onChange={(e) => updateLine(idx, { gst: e.target.value })}
                        className={`h-9 rounded-md border bg-background px-2 text-sm tabular-nums ${gstMismatch ? 'border-amber-500' : 'border-input'}`}
                      >
                        {GST_RATES.map((rate) => <option key={rate} value={rate}>{rate}%</option>)}
                      </select>
                    </div>
                    <div className="md:col-span-4 flex flex-col gap-1 justify-end text-xs tabular-nums">
                      <div className="text-muted-foreground">Taxable ₹{formatINR(taxable)}</div>
                      <div className="text-muted-foreground">Tax ₹{formatINR(tax)}</div>
                      <div className="font-medium text-foreground">₹{formatINR(total)}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent className="flex flex-col gap-1.5 text-sm">
          <Row label="Subtotal (taxable)" value={`₹${formatINR(preview.subtotal)}`} />
          <Row label="Tax" value={`₹${formatINR(preview.tax)}`} />
          <div className="border-t border-border my-1" />
          <Row label="Grand total" value={`₹${formatINR(preview.total)}`} bold />
          {preview.warnings.length > 0 && (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/50 text-amber-900 px-2.5 py-2 text-xs">
              <div className="font-medium mb-1">3-way match will flag {preview.warnings.length} issue{preview.warnings.length === 1 ? '' : 's'}:</div>
              <ul className="list-disc pl-4 space-y-0.5">
                {preview.warnings.map((w, i) => <li key={i}>Line {w.line}: {w.msg}</li>)}
              </ul>
              <p className="mt-1.5 text-amber-800/80">You can still book the bill — the approver will see these in the bill detail.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent>
          <Label className="text-xs">Internal notes (not on the vendor copy)</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
        </CardContent>
      </Card>

      {err && (
        <div className="rounded-md border border-rose-300 bg-rose-50 text-rose-800 px-3 py-2 text-sm inline-flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          {err}
        </div>
      )}

      <div className="flex items-center gap-2 justify-end">
        <Button variant="outline" disabled={busy} onClick={() => save(false)}>Save as draft</Button>
        <Button disabled={busy} onClick={() => save(true)}>Save & submit for approval</Button>
      </div>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'font-semibold text-base' : ''}`}>
      <span className={bold ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
