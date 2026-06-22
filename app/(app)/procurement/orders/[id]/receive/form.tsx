'use client'

/**
 * ReceiveForm — GRN entry UI.
 *
 * Per-line: qty_received_now defaults to qty_pending (greedy receive).
 * Optional qty_rejected for damaged/spec-failed material. Rejection
 * reason becomes required once qty_rejected > 0 (server-side too).
 *
 * Save as draft / Save & post. Posting hits server, which atomically
 * (best-effort) updates PO state + writes stock_movement rows. See
 * lib/actions/goods-receipt-notes.ts for the state machine.
 */
import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertCircle, Package } from 'lucide-react'
import { createGoodsReceiptNote, type GrnLineInput, type QcStatus, type PoForReceive } from '@/lib/actions/goods-receipt-notes'

interface Props {
  po: PoForReceive
}

type LineDraft = {
  po_line_id: string
  line_no: number
  description: string
  hsn_code: string | null
  unit: string
  quantity: number
  qty_received_already: number
  qty_pending: number
  product_id: string | null
  // Editable
  qty_received_now: string
  qty_rejected_now: string
  rejection_reason: string
  batch_no: string
  expiry_date: string
  remarks: string
}

const QC_STATUSES: { value: QcStatus; label: string }[] = [
  { value: 'not_required',   label: 'Not required (no QC step)' },
  { value: 'pending',        label: 'Pending QC' },
  { value: 'accepted',       label: 'QC accepted (all lines OK)' },
  { value: 'partial_accept', label: 'Partial accept (some rejections)' },
  { value: 'rejected',       label: 'QC rejected' },
]

export function ReceiveForm({ po }: Props) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  // Header state
  const [grnDate, setGrnDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [challanNo, setChallanNo] = useState('')
  const [vendorInvoiceNo, setVendorInvoiceNo] = useState('')
  const [vehicleNo, setVehicleNo] = useState('')
  const [transporter, setTransporter] = useState('')
  const [ewayBill, setEwayBill] = useState('')
  const [qcStatus, setQcStatus] = useState<QcStatus>('not_required')
  const [qcNotes, setQcNotes] = useState('')
  const [notes, setNotes] = useState('')

  // Line state — default qty_received_now to qty_pending
  const [lines, setLines] = useState<LineDraft[]>(
    po.lines.map((l) => ({
      po_line_id: l.id,
      line_no: l.line_no,
      description: l.description,
      hsn_code: l.hsn_code,
      unit: l.unit,
      quantity: l.quantity,
      qty_received_already: l.qty_received,
      qty_pending: l.qty_pending,
      product_id: l.product_id,
      qty_received_now: l.qty_pending > 0 ? String(l.qty_pending) : '0',
      qty_rejected_now: '0',
      rejection_reason: '',
      batch_no: '',
      expiry_date: '',
      remarks: '',
    })),
  )

  function updateLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  const totalAccepted = useMemo(
    () => lines.reduce((s, l) => {
      const r = Number(l.qty_received_now) || 0
      const j = Number(l.qty_rejected_now) || 0
      return s + Math.max(0, r - j)
    }, 0),
    [lines],
  )
  const totalRejected = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.qty_rejected_now) || 0), 0),
    [lines],
  )
  const linesWithReceipt = useMemo(
    () => lines.filter((l) => (Number(l.qty_received_now) || 0) > 0).length,
    [lines],
  )

  async function save(post: boolean) {
    setErr(null)
    const payload: GrnLineInput[] = []
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      const qReceived = Number(l.qty_received_now) || 0
      const qRejected = Number(l.qty_rejected_now) || 0
      if (qReceived === 0 && qRejected === 0) continue
      if (qReceived < 0 || qRejected < 0) {
        setErr(`Line ${l.line_no}: quantities must be non-negative`)
        return
      }
      if (qRejected > qReceived) {
        setErr(`Line ${l.line_no}: rejected cannot exceed received`)
        return
      }
      if (qRejected > 0 && !l.rejection_reason.trim()) {
        setErr(`Line ${l.line_no}: rejection reason required when rejected > 0`)
        return
      }
      payload.push({
        po_line_id: l.po_line_id,
        qty_received: qReceived,
        qty_rejected: qRejected,
        rejection_reason: l.rejection_reason.trim() || undefined,
        batch_no: l.batch_no.trim() || undefined,
        expiry_date: l.expiry_date || undefined,
        remarks: l.remarks.trim() || undefined,
      })
    }
    if (payload.length === 0) {
      setErr('At least one line must have qty_received > 0')
      return
    }

    startTransition(async () => {
      const res = await createGoodsReceiptNote({
        po_id: po.id,
        grn_date: grnDate,
        vendor_challan_no: challanNo.trim() || undefined,
        vendor_invoice_no: vendorInvoiceNo.trim() || undefined,
        vehicle_no: vehicleNo.trim() || undefined,
        transporter: transporter.trim() || undefined,
        e_way_bill_no: ewayBill.trim() || undefined,
        qc_status: qcStatus,
        qc_notes: qcNotes.trim() || undefined,
        notes: notes.trim() || undefined,
        lines: payload,
        post_immediately: post,
      })
      if (!res.ok) { setErr(res.error); toast.error(res.error); return }
      toast.success(post ? `${res.grn_number} posted — PO stock updated` : `${res.grn_number} saved as draft`)
      router.push(`/procurement/grns/${res.id}`)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Paperwork */}
      <Card>
        <CardContent className="grid md:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Receipt date</Label>
            <Input type="date" value={grnDate} onChange={(e) => setGrnDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Vendor challan / DC no.</Label>
            <Input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} placeholder="DC-2026-1234" className="font-mono" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Vendor invoice no. (if attached)</Label>
            <Input value={vendorInvoiceNo} onChange={(e) => setVendorInvoiceNo(e.target.value)} placeholder="INV-2026-001" className="font-mono" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Vehicle no.</Label>
            <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value.toUpperCase())} placeholder="GJ05 AB 1234" className="font-mono" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Transporter</Label>
            <Input value={transporter} onChange={(e) => setTransporter(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">E-way bill no.</Label>
            <Input value={ewayBill} onChange={(e) => setEwayBill(e.target.value)} placeholder="12-digit" className="font-mono" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">QC status</Label>
            <Select value={qcStatus} onValueChange={(v) => setQcStatus(v as QcStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {QC_STATUSES.map((q) => <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label className="text-xs">QC notes (optional)</Label>
            <Input value={qcNotes} onChange={(e) => setQcNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium inline-flex items-center gap-1.5">
              <Package className="size-3.5" /> Line items
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {linesWithReceipt} of {lines.length} receiving · {totalAccepted} accepted · {totalRejected} rejected
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {lines.map((l, idx) => {
              const qReceived = Number(l.qty_received_now) || 0
              const qRejected = Number(l.qty_rejected_now) || 0
              const accepted = Math.max(0, qReceived - qRejected)
              const overshoot = qReceived > l.qty_pending
              const fullyFulfilledAfter = l.qty_received_already + accepted >= l.quantity

              return (
                <div key={l.po_line_id} className="rounded-md border border-border p-3 flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">Line {l.line_no} — {l.description}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                        Ordered: {l.quantity} {l.unit} · Already received: {l.qty_received_already} · Pending: {l.qty_pending}
                        {!l.product_id && <span className="ml-2 text-amber-700">(ad-hoc — no stock impact)</span>}
                      </div>
                    </div>
                    {fullyFulfilledAfter && qReceived > 0 && (
                      <div className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                        line will close
                      </div>
                    )}
                  </div>

                  <div className="grid md:grid-cols-12 gap-2">
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">Received now</Label>
                      <Input
                        type="number" step="0.001" min="0"
                        value={l.qty_received_now}
                        onChange={(e) => updateLine(idx, { qty_received_now: e.target.value })}
                        className="tabular-nums"
                      />
                      {overshoot && (
                        <div className="text-[10px] text-amber-700">Over-receipt vs pending</div>
                      )}
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">Rejected</Label>
                      <Input
                        type="number" step="0.001" min="0"
                        value={l.qty_rejected_now}
                        onChange={(e) => updateLine(idx, { qty_rejected_now: e.target.value })}
                        className="tabular-nums"
                      />
                    </div>
                    <div className="md:col-span-3 flex flex-col gap-1">
                      <Label className="text-xs">Rejection reason {qRejected > 0 && <span className="text-rose-600">*</span>}</Label>
                      <Input
                        value={l.rejection_reason}
                        onChange={(e) => updateLine(idx, { rejection_reason: e.target.value })}
                        placeholder={qRejected > 0 ? 'Required' : 'optional'}
                      />
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">Batch/lot no.</Label>
                      <Input
                        value={l.batch_no}
                        onChange={(e) => updateLine(idx, { batch_no: e.target.value })}
                        className="font-mono"
                      />
                    </div>
                    <div className="md:col-span-3 flex flex-col gap-1">
                      <Label className="text-xs">Expiry date</Label>
                      <Input
                        type="date"
                        value={l.expiry_date}
                        onChange={(e) => updateLine(idx, { expiry_date: e.target.value })}
                      />
                    </div>
                    {(l.remarks || false) && (
                      <div className="md:col-span-12 flex flex-col gap-1">
                        <Label className="text-xs">Remarks</Label>
                        <Input
                          value={l.remarks}
                          onChange={(e) => updateLine(idx, { remarks: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card size="sm">
        <CardContent>
          <Label className="text-xs">Internal receipt notes</Label>
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
        <Button disabled={busy} onClick={() => save(true)}>Save & post</Button>
      </div>
    </div>
  )
}
