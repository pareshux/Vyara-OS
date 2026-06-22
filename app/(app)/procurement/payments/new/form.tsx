'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertCircle, Banknote, Calculator } from 'lucide-react'
import { createVendorPayment, type PaymentMode, type PaymentAllocationInput, type BillForPayment } from '@/lib/actions/vendor-payments'
import { suggestTds, type TdsSection } from '@/lib/procurement/tds-engine'

interface Props {
  vendor: {
    id: string
    name: string
    code: string
    vendor_type: string
    msme_status: string | null
    pan: string | null
  }
  bills: BillForPayment[]
  preselectedBillId: string | null
}

type BillDraft = {
  bill: BillForPayment
  selected: boolean
  allocation: string  // string for input control
}

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'neft',          label: 'NEFT' },
  { value: 'rtgs',          label: 'RTGS' },
  { value: 'cheque',        label: 'Cheque' },
  { value: 'upi',           label: 'UPI' },
  { value: 'cash',          label: 'Cash' },
  { value: 'bg_adjustment', label: 'BG adjustment' },
  { value: 'on_account',    label: 'On account' },
]

const TDS_SECTIONS: { value: TdsSection; label: string }[] = [
  { value: '194Q', label: '§194Q — Goods purchase' },
  { value: '194C', label: '§194C — Works contractor' },
  { value: '194J', label: '§194J — Professional / technical' },
  { value: '194I', label: '§194I — Rent' },
]

function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function r2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100 }

export function NewVendorPaymentForm({ vendor, bills, preselectedBillId }: Props) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const suggestion = useMemo(() => suggestTds(vendor), [vendor])

  // Header
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('neft')
  const [bankAccount, setBankAccount] = useState('')
  const [referenceNo, setReferenceNo] = useState('')
  const [tdsSection, setTdsSection] = useState<TdsSection | ''>(suggestion.section ?? '')
  const [tdsPct, setTdsPct] = useState<string>(String(suggestion.pct))
  const [notes, setNotes] = useState('')

  // Bills
  const [drafts, setDrafts] = useState<BillDraft[]>(
    bills.map((b) => ({
      bill: b,
      // Pre-select either the explicitly requested bill or none
      selected: preselectedBillId === b.id,
      // Default allocation to full outstanding
      allocation: preselectedBillId === b.id ? String(b.amount_outstanding) : '0',
    })),
  )

  function toggleBill(idx: number) {
    setDrafts((prev) => prev.map((d, i) => {
      if (i !== idx) return d
      const nextSelected = !d.selected
      return {
        ...d,
        selected: nextSelected,
        allocation: nextSelected
          ? (Number(d.allocation) || 0) === 0 ? String(d.bill.amount_outstanding) : d.allocation
          : '0',
      }
    }))
  }

  function updateAllocation(idx: number, value: string) {
    setDrafts((prev) => prev.map((d, i) => i === idx ? { ...d, allocation: value } : d))
  }

  function setMax(idx: number) {
    setDrafts((prev) => prev.map((d, i) => i === idx ? { ...d, selected: true, allocation: String(d.bill.amount_outstanding) } : d))
  }

  // Live totals
  const totals = useMemo(() => {
    let gross = 0
    let billCount = 0
    for (const d of drafts) {
      if (!d.selected) continue
      const amt = Number(d.allocation) || 0
      if (amt > 0) {
        gross += amt
        billCount++
      }
    }
    gross = r2(gross)
    const pct = Number(tdsPct) || 0
    const tds = r2(gross * (pct / 100))
    const net = r2(gross - tds)
    return { gross, tds, net, billCount, pct }
  }, [drafts, tdsPct])

  async function save(post: boolean) {
    setErr(null)

    const allocations: PaymentAllocationInput[] = []
    for (const d of drafts) {
      if (!d.selected) continue
      const amt = Number(d.allocation) || 0
      if (amt <= 0) {
        setErr(`${d.bill.bill_number}: allocation must be > 0`)
        return
      }
      if (amt > d.bill.amount_outstanding + 0.01) {
        setErr(`${d.bill.bill_number}: allocation ${amt} exceeds outstanding ${d.bill.amount_outstanding}`)
        return
      }
      allocations.push({ bill_id: d.bill.id, allocated_amount: r2(amt) })
    }
    if (allocations.length === 0) {
      setErr('Select at least one bill and set its allocation > 0')
      return
    }

    const pct = Number(tdsPct) || 0
    if (pct > 0 && !tdsSection) {
      setErr('TDS section is required when rate > 0')
      return
    }

    startTransition(async () => {
      const res = await createVendorPayment({
        vendor_id: vendor.id,
        payment_date: paymentDate,
        payment_mode: paymentMode,
        bank_account_used: bankAccount.trim() || undefined,
        reference_no: referenceNo.trim() || undefined,
        tds_section: (tdsSection || null) as TdsSection | null,
        tds_pct: pct,
        notes: notes.trim() || undefined,
        allocations,
        post_immediately: post,
      })
      if (!res.ok) { setErr(res.error); toast.error(res.error); return }
      toast.success(post ? `${res.payment_number} posted · ${allocations.length} bill${allocations.length === 1 ? '' : 's'} updated` : `${res.payment_number} saved as draft`)
      router.push(`/procurement/payments/${res.id}`)
    })
  }

  const isMsme = vendor.msme_status && vendor.msme_status !== 'not_msme'

  return (
    <div className="flex flex-col gap-4">
      {/* Vendor card + TDS suggestion */}
      <Card>
        <CardContent className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{vendor.name}</div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
              <span className="font-mono">{vendor.code}</span>
              <span>· {vendor.vendor_type}</span>
              {isMsme && (
                <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-[10px]">
                  MSME · {vendor.msme_status}
                </Badge>
              )}
              {vendor.pan ? (
                <span>· PAN <span className="font-mono">{vendor.pan}</span></span>
              ) : (
                <span className="text-rose-700">· no PAN on file</span>
              )}
            </div>
          </div>
          <div className="text-right text-[11px] text-muted-foreground max-w-xs">
            <div className="font-medium text-foreground inline-flex items-center gap-1"><Calculator className="size-3" /> TDS suggestion</div>
            <div className="mt-0.5">{suggestion.reason}</div>
          </div>
        </CardContent>
      </Card>

      {/* Payment header */}
      <Card>
        <CardContent className="grid md:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Payment date</Label>
            <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Mode *</Label>
            <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as PaymentMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Reference no. (UTR / cheque / UPI ref)</Label>
            <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} className="font-mono" placeholder="N026123456789012" />
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-3">
            <Label className="text-xs">Bank account used (which bank we paid from)</Label>
            <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="HDFC Bank · Curr A/c 50100012345678 (Vyara)" />
          </div>
        </CardContent>
      </Card>

      {/* Bills to settle */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium inline-flex items-center gap-1.5">
              <Banknote className="size-3.5" /> Bills to settle
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {totals.billCount} selected · gross ₹{formatINR(totals.gross)}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            {drafts.map((d, idx) => {
              const overdue = d.bill.days_overdue > 0
              const msmeBreach = d.bill.msme_flag === 'breach'
              const msmeWarn = d.bill.msme_flag === 'warning'
              return (
                <div
                  key={d.bill.id}
                  className={`rounded-md border bg-card px-3 py-2.5 flex items-center gap-3 ${
                    msmeBreach ? 'border-rose-300' : msmeWarn ? 'border-amber-300' : 'border-border'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={d.selected}
                    onChange={() => toggleBill(idx)}
                    className="size-4 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs">{d.bill.bill_number}</span>
                      <span className="text-[11px] text-muted-foreground">vendor inv <span className="font-mono">{d.bill.vendor_invoice_no}</span></span>
                      {msmeBreach && <Badge variant="outline" className="bg-rose-50 text-rose-800 border-rose-200 text-[10px]">MSME breach</Badge>}
                      {msmeWarn && <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-[10px]">MSME warning</Badge>}
                      {overdue && !msmeBreach && (
                        <Badge variant="outline" className="bg-rose-50 text-rose-800 border-rose-200 text-[10px]">
                          {d.bill.days_overdue}d overdue
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                      total ₹{formatINR(d.bill.total)} · paid ₹{formatINR(d.bill.amount_paid)} · outstanding ₹{formatINR(d.bill.amount_outstanding)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number" step="0.01" min="0" max={d.bill.amount_outstanding}
                      value={d.allocation}
                      onChange={(e) => updateAllocation(idx, e.target.value)}
                      disabled={!d.selected}
                      className="w-32 tabular-nums"
                    />
                    <Button
                      type="button" size="sm" variant="outline"
                      onClick={() => setMax(idx)}
                      className="text-[10px] h-9 px-2"
                    >
                      max
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* TDS */}
      <Card>
        <CardContent className="grid md:grid-cols-3 gap-3">
          <div className="md:col-span-3 text-sm font-medium inline-flex items-center gap-1.5">
            <Calculator className="size-3.5" /> TDS (auto-suggested · override if needed)
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Section</Label>
            <Select value={tdsSection || '__none__'} onValueChange={(v) => setTdsSection(v === '__none__' ? '' : (v as TdsSection))}>
              <SelectTrigger><SelectValue placeholder="No TDS" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No TDS</SelectItem>
                {TDS_SECTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Rate (%)</Label>
            <Input
              type="number" step="0.01" min="0" max="50"
              value={tdsPct}
              onChange={(e) => setTdsPct(e.target.value)}
              disabled={!tdsSection}
              className="tabular-nums"
            />
          </div>
          <div className="flex flex-col gap-1 justify-end text-xs tabular-nums">
            <div className="text-muted-foreground">Gross ₹{formatINR(totals.gross)}</div>
            <div className="text-rose-700">− TDS ₹{formatINR(totals.tds)}</div>
            <div className="font-semibold text-foreground border-t pt-0.5">Net ₹{formatINR(totals.net)}</div>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent>
          <Label className="text-xs">Internal notes</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" placeholder="e.g. partial against credit note #CN-12 / approved by CFO over WhatsApp" />
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
        <Button disabled={busy} onClick={() => save(true)}>Save & post payment</Button>
      </div>
    </div>
  )
}
