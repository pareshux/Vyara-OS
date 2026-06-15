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
import { createInvoiceManual } from '@/lib/actions/invoices'

const NONE = '__none__'

interface Props {
  projects: { id: string; name: string }[]
  firms: { id: string; name: string }[]
  orders: { id: string; order_number: string; value: number; project_id: string; buyer_firm_id: string | null }[]
}

export function NewInvoiceForm({ projects, firms, orders }: Props) {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)
  const in30 = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10)
  }, [])

  const [orderId, setOrderId] = useState<string>(NONE)
  const [projectId, setProjectId] = useState<string>(NONE)
  const [buyerId, setBuyerId] = useState<string>(NONE)
  const [externalNum, setExternalNum] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(today)
  const [dueDate, setDueDate] = useState(in30)
  const [paymentTerms, setPaymentTerms] = useState(30)
  const [subtotal, setSubtotal] = useState(0)
  const [gstPct, setGstPct] = useState(18)
  const [retentionPct, setRetentionPct] = useState(0)
  const [isRunningBill, setIsRunningBill] = useState(false)
  const [billSeq, setBillSeq] = useState<number | ''>('')
  const [isFinalBill, setIsFinalBill] = useState(false)
  const [notes, setNotes] = useState('')

  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  // When an order is picked, prefill project/buyer/value
  useEffect(() => {
    if (orderId === NONE) return
    const o = orders.find((x) => x.id === orderId)
    if (!o) return
    setProjectId(o.project_id)
    setBuyerId(o.buyer_firm_id ?? NONE)
    if (subtotal === 0) {
      // Order value is total inc gst; reverse-derive subtotal at current gst_pct
      const base = Math.round((o.value / (1 + gstPct / 100)) * 100) / 100
      setSubtotal(base)
    }
  }, [orderId, orders, gstPct, subtotal])

  const gstAmount = useMemo(() => Math.round((subtotal * gstPct) / 100 * 100) / 100, [subtotal, gstPct])
  const total = useMemo(() => Math.round((subtotal + gstAmount) * 100) / 100, [subtotal, gstAmount])
  const retentionAmount = useMemo(() => Math.round((total * retentionPct) / 100 * 100) / 100, [total, retentionPct])
  const billedAmount = useMemo(() => Math.round((total - retentionAmount) * 100) / 100, [total, retentionAmount])

  function handleSubmit() {
    setErr(null)
    if (subtotal <= 0) { setErr('Subtotal must be greater than zero'); return }
    if (!invoiceDate || !dueDate) { setErr('Invoice date and due date are required'); return }
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
      })
      if ('error' in res) {
        setErr(res.error)
        toast.error(res.error)
      } else {
        toast.success(`Invoice ${res.invoice_number} created`)
        router.push(`/invoices/${res.id}`)
      }
    })
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5 col-span-2">
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

        <div className="flex flex-col gap-1.5 col-span-2">
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
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="terms">Payment terms (days)</Label>
          <Input id="terms" type="number" min={0} value={paymentTerms} onChange={(e) => setPaymentTerms(Number(e.target.value))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sub">Subtotal (excl. GST)</Label>
          <Input id="sub" type="number" min={0} step="0.01" value={subtotal} onChange={(e) => setSubtotal(Number(e.target.value))} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gst">GST %</Label>
          <Input id="gst" type="number" min={0} max={50} step="0.5" value={gstPct} onChange={(e) => setGstPct(Number(e.target.value))} />
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
          <div className="grid grid-cols-2 gap-3 mt-1">
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
        <div className="grid grid-cols-2 gap-2 text-sm">
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
