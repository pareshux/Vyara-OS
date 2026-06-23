'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createInvoiceManual, getInvoiceDefaults, type InvoiceDefaults } from '@/lib/actions/invoices'
import { logInvoicePhotoDecision } from '@/lib/actions/invoice-photo'

const NONE = '__none__'

export type InvoiceAIPrefill = {
  external_invoice_number: string | null
  invoice_date: string | null
  project_id: string | null
  buyer_firm_id: string | null
  sales_order_id: string | null
  subtotal: number | null
  gst_pct: number | null
  retention_pct: number | null
  is_running_bill: boolean
  running_bill_seq: number | null
  is_final_bill: boolean
  notes: string | null
  // Audit trail
  extraction_id: string
  avg_confidence: number | null
  original_values: Record<string, unknown>
}

interface Props {
  projects: { id: string; name: string }[]
  firms: { id: string; name: string }[]
  orders: { id: string; order_number: string; value: number; project_id: string; buyer_firm_id: string | null }[]
  initialDefaults: InvoiceDefaults
  aiPrefill?: InvoiceAIPrefill | null
}

function addDays(iso: string, days: number) {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function NewInvoiceForm({ projects, firms, orders, initialDefaults, aiPrefill }: Props) {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)

  // Snapshot-source state for the FK + microcopy. `null` if user has
  // overridden away from the suggested value.
  const [taxSource, setTaxSource] = useState<InvoiceDefaults['tax']>(initialDefaults.tax)
  const [ptSource, setPtSource] = useState<InvoiceDefaults['paymentTerm']>(initialDefaults.paymentTerm)

  const initialGst = initialDefaults.tax?.rate_pct ?? 18
  const initialDays = initialDefaults.paymentTerm?.days ?? 30
  const initialInvoiceDate = aiPrefill?.invoice_date ?? today

  const [orderId, setOrderId] = useState<string>(aiPrefill?.sales_order_id ?? NONE)
  const [projectId, setProjectId] = useState<string>(aiPrefill?.project_id ?? NONE)
  const [buyerId, setBuyerId] = useState<string>(aiPrefill?.buyer_firm_id ?? NONE)
  const [externalNum, setExternalNum] = useState(aiPrefill?.external_invoice_number ?? '')
  const [invoiceDate, setInvoiceDate] = useState(initialInvoiceDate)
  const [dueDate, setDueDate] = useState(addDays(initialInvoiceDate, initialDays))
  const [paymentTerms, setPaymentTerms] = useState(initialDays)
  const [subtotal, setSubtotal] = useState(aiPrefill?.subtotal ?? 0)
  const [gstPct, setGstPct] = useState(aiPrefill?.gst_pct ?? initialGst)
  const [retentionPct, setRetentionPct] = useState(aiPrefill?.retention_pct ?? 0)
  const [isRunningBill, setIsRunningBill] = useState(aiPrefill?.is_running_bill ?? false)
  const [billSeq, setBillSeq] = useState<number | ''>(aiPrefill?.running_bill_seq ?? '')
  const [isFinalBill, setIsFinalBill] = useState(aiPrefill?.is_final_bill ?? false)
  const [notes, setNotes] = useState(aiPrefill?.notes ?? '')

  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  // When an order is picked, prefill project/buyer/value.
  // sales_order.value is the pre-tax subtotal (snapshot of quotation.total
  // = sum of quantity × unit_price; no GST added). Use it as-is. For
  // running-account bills the user will typically lower this to the
  // partial-billing amount for the period.
  useEffect(() => {
    if (orderId === NONE) return
    const o = orders.find((x) => x.id === orderId)
    if (!o) return
    setProjectId(o.project_id)
    setBuyerId(o.buyer_firm_id ?? NONE)
    if (subtotal === 0) {
      setSubtotal(Math.round(Number(o.value) * 100) / 100)
    }
  }, [orderId, orders, subtotal])

  // When buyer firm changes, re-resolve payment-term (firm may have its own).
  // Only overrides the form if the current value still matches the previous source,
  // i.e. the user hasn't deviated manually — otherwise we'd clobber their edit.
  useEffect(() => {
    if (buyerId === NONE) return
    let cancelled = false
    void getInvoiceDefaults({ buyer_firm_id: buyerId }).then((res) => {
      if (cancelled || !('defaults' in res)) return
      const nextPt = res.defaults.paymentTerm
      if (!nextPt) return
      // Only adopt if user hasn't edited away from the prior suggestion
      if (ptSource && paymentTerms === ptSource.days) {
        setPaymentTerms(nextPt.days)
        setDueDate(addDays(invoiceDate, nextPt.days))
      }
      setPtSource(nextPt)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyerId])

  // Recompute due_date whenever invoice_date OR payment_terms changes.
  // The user can still hand-edit due_date afterwards — this is just the default.
  useEffect(() => {
    if (!invoiceDate || !(paymentTerms >= 0)) return
    setDueDate(addDays(invoiceDate, paymentTerms))
  }, [invoiceDate, paymentTerms])

  const gstAmount = useMemo(() => Math.round((subtotal * gstPct) / 100 * 100) / 100, [subtotal, gstPct])
  const total = useMemo(() => Math.round((subtotal + gstAmount) * 100) / 100, [subtotal, gstAmount])
  const retentionAmount = useMemo(() => Math.round((total * retentionPct) / 100 * 100) / 100, [total, retentionPct])
  const billedAmount = useMemo(() => Math.round((total - retentionAmount) * 100) / 100, [total, retentionAmount])

  // Did the user keep the suggested values? If yes, snapshot the FK.
  const useTaxFk = taxSource && Math.abs(gstPct - taxSource.rate_pct) < 0.005
  const usePtFk = ptSource && paymentTerms === ptSource.days

  function handleSubmit() {
    setErr(null)
    if (subtotal <= 0) { setErr('Subtotal must be greater than zero'); return }
    if (!invoiceDate || !dueDate) { setErr('Invoice date and due date are required'); return }
    if (isRunningBill && (typeof billSeq !== 'number' || billSeq <= 0)) {
      setErr('Running bill sequence is required (1, 2, 3 …)')
      return
    }
    startTransition(async () => {
      const res = await createInvoiceManual({
        project_id: projectId === NONE ? undefined : projectId,
        sales_order_id: orderId === NONE ? undefined : orderId,
        buyer_firm_id: buyerId === NONE ? undefined : buyerId,
        invoice_date: invoiceDate,
        due_date: dueDate,
        payment_terms_days: paymentTerms,
        external_invoice_number: externalNum.trim() || undefined,
        subtotal,
        gst_pct: gstPct,
        retention_pct: retentionPct,
        is_running_bill: isRunningBill,
        running_bill_seq: typeof billSeq === 'number' ? billSeq : undefined,
        is_final_bill: isFinalBill,
        notes: notes.trim() || undefined,
        tax_rate_id: useTaxFk ? taxSource!.id : null,
        payment_term_id: usePtFk ? ptSource!.id : null,
      })
      if ('error' in res) {
        setErr(res.error)
        toast.error(res.error)
      } else {
        // If this submission was AI-prefilled, log the decision (accepted/edited)
        // before navigating away. Non-blocking — we don't surface failures.
        if (aiPrefill) {
          const final_values = {
            external_invoice_number: externalNum,
            invoice_date: invoiceDate,
            project_id: projectId === NONE ? null : projectId,
            buyer_firm_id: buyerId === NONE ? null : buyerId,
            sales_order_id: orderId === NONE ? null : orderId,
            subtotal,
            gst_pct: gstPct,
            retention_pct: retentionPct,
            is_running_bill: isRunningBill,
            running_bill_seq: typeof billSeq === 'number' ? billSeq : null,
            is_final_bill: isFinalBill,
            notes,
          }
          const edited = wasInvoiceEdited(aiPrefill, final_values)
          void logInvoicePhotoDecision({
            extraction_id: aiPrefill.extraction_id,
            decision: edited ? 'edited' : 'accepted',
            original_values: aiPrefill.original_values,
            final_values,
            avg_confidence: aiPrefill.avg_confidence,
            target_invoice_id: res.id,
          })
        }
        toast.success(`Invoice ${res.invoice_number} created`)
        router.push(`/invoices/${res.id}`)
      }
    })
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5 col-span-1 sm:col-span-2">
          <Label>Linked sales order (optional)</Label>
          <Select value={orderId} onValueChange={setOrderId}>
            <SelectTrigger><SelectValue placeholder="Direct billing — no order" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— Direct billing —</SelectItem>
              {orders.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.order_number} — ₹{Number(o.value).toLocaleString('en-IN')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Project</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger><SelectValue placeholder="Pick a project" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>—</SelectItem>
              {projects.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Buyer (firm)</Label>
          <Select value={buyerId} onValueChange={setBuyerId}>
            <SelectTrigger><SelectValue placeholder="Pick a buyer" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>—</SelectItem>
              {firms.map((f) => (<SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5 col-span-1 sm:col-span-2">
          <Label htmlFor="ext">External / Tally invoice number (optional)</Label>
          <Input id="ext" value={externalNum} onChange={(e) => setExternalNum(e.target.value)} placeholder="e.g. INV-2026-0042" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="idate">Invoice date</Label>
          <Input id="idate" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="due">Due date</Label>
          <Input id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          {usePtFk && ptSource && (
            <p className="text-[10px] text-muted-foreground tabular-nums">
              Auto from <span className="font-mono text-foreground">{ptSource.code}</span> · invoice_date + {ptSource.days}d
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="terms">Payment terms (days)</Label>
          <Input id="terms" type="number" min={0} value={paymentTerms} onChange={(e) => setPaymentTerms(Number(e.target.value))} />
          {ptSource && (
            <p className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-1 flex-wrap">
              <span>
                From <span className="font-mono text-foreground">{ptSource.code}</span> · {ptSource.days}d
                {ptSource.source === 'firm' && <span className="text-emerald-700"> · buyer override</span>}
              </span>
              {!usePtFk && (
                <span className="text-amber-700">· manual</span>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sub">Subtotal (excl. GST)</Label>
          <Input id="sub" type="number" min={0} step="0.01" value={subtotal} onChange={(e) => setSubtotal(Number(e.target.value))} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gst">GST %</Label>
          <Input id="gst" type="number" min={0} max={50} step="0.5" value={gstPct} onChange={(e) => setGstPct(Number(e.target.value))} />
          {taxSource && (
            <p className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-1 flex-wrap">
              <span>
                From <span className="font-mono text-foreground">{taxSource.code}</span> · {taxSource.rate_pct.toFixed(2)}%
              </span>
              {!useTaxFk && (
                <span className="text-amber-700">· manual</span>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ret">Retention %</Label>
          <Input id="ret" type="number" min={0} max={20} step="0.5" value={retentionPct} onChange={(e) => setRetentionPct(Number(e.target.value))} />
        </div>
      </div>

      {/* Running-bill toggle */}
      <div className="flex flex-col gap-2 rounded-lg border border-border p-3 bg-muted/30">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isRunningBill} onChange={(e) => setIsRunningBill(e.target.checked)} />
          <span>This is a running-account bill (partial billing across a project)</span>
        </label>
        {isRunningBill && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="seq">Bill sequence (RA-Bill #)</Label>
              <Input id="seq" type="number" min={1} value={billSeq} onChange={(e) => {
                const v = e.target.value
                setBillSeq(v === '' ? '' : Number(v))
              }} />
            </div>
            <label className="flex items-center gap-2 text-sm mt-6">
              <input type="checkbox" checked={isFinalBill} onChange={(e) => setIsFinalBill(e.target.checked)} />
              <span>This is the final bill</span>
            </label>
          </div>
        )}
      </div>

      {/* Live totals */}
      <div className="rounded-lg border border-border p-3 bg-card">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Computed</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">GST amount</span><span className="tabular-nums font-medium">₹{gstAmount.toLocaleString('en-IN')}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="tabular-nums font-medium">₹{total.toLocaleString('en-IN')}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Retention held</span><span className="tabular-nums font-medium">₹{retentionAmount.toLocaleString('en-IN')}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Billed (due now)</span><span className="tabular-nums font-semibold text-primary">₹{billedAmount.toLocaleString('en-IN')}</span></div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {err && <p className="text-xs text-destructive">{err}</p>}

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create invoice'}</Button>
      </div>
    </form>
  )
}

// True if the user changed any field that the AI also produced. Determines
// whether the decision is logged as 'accepted' vs 'edited'.
function wasInvoiceEdited(
  ai: InvoiceAIPrefill,
  final: Record<string, unknown>
): boolean {
  const compare: (keyof InvoiceAIPrefill)[] = [
    'external_invoice_number',
    'invoice_date',
    'project_id',
    'buyer_firm_id',
    'sales_order_id',
    'subtotal',
    'gst_pct',
    'retention_pct',
    'is_running_bill',
    'running_bill_seq',
    'is_final_bill',
  ]
  for (const k of compare) {
    if (ai[k] == null) continue
    if (ai[k] !== final[k]) return true
  }
  return false
}
