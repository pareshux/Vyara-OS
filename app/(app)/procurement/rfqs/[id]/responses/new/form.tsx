'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertCircle, Save } from 'lucide-react'
import { recordVendorRfqResponse } from '@/lib/actions/rfqs'

interface Props {
  rfqId: string
  vendor: {
    id: string
    name: string
    code: string
    existing_quote_no: string | null
    existing_quote_date: string | null
    existing_quote_validity: string | null
    existing_payment_terms_days: number | null
    existing_delivery_terms: string | null
    existing_notes: string | null
  }
  lines: Array<{
    id: string
    line_no: number
    description: string
    unit: string
    quantity: number
    hsn_code: string | null
    existing_rate: number | null
    existing_discount: number | null
    existing_gst: number | null
    existing_delivery_days: number | null
    existing_notes: string | null
  }>
}

const GST_RATES = ['0', '5', '12', '18', '28']

function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function r2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100 }

export function ResponseForm({ rfqId, vendor, lines }: Props) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const [quoteNo, setQuoteNo] = useState(vendor.existing_quote_no ?? '')
  const [quoteDate, setQuoteDate] = useState(vendor.existing_quote_date ?? '')
  const [quoteValidity, setQuoteValidity] = useState(vendor.existing_quote_validity ?? '')
  const [paymentTermsDays, setPaymentTermsDays] = useState(vendor.existing_payment_terms_days?.toString() ?? '')
  const [deliveryTerms, setDeliveryTerms] = useState(vendor.existing_delivery_terms ?? '')
  const [headerNotes, setHeaderNotes] = useState(vendor.existing_notes ?? '')

  const [lineState, setLineState] = useState(() =>
    lines.map((l) => ({
      id: l.id,
      rate: l.existing_rate?.toString() ?? '',
      discount_pct: (l.existing_discount ?? 0).toString(),
      gst_rate_pct: (l.existing_gst ?? 18).toString(),
      delivery_days: l.existing_delivery_days?.toString() ?? '',
      notes: l.existing_notes ?? '',
    })),
  )

  function updateLine(idx: number, patch: Partial<typeof lineState[number]>) {
    setLineState((prev) => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  const totals = useMemo(() => {
    let gross = 0
    let totalWithTax = 0
    for (let i = 0; i < lines.length; i++) {
      const ls = lineState[i]
      const rate = Number(ls.rate) || 0
      const qty = lines[i].quantity
      const disc = Number(ls.discount_pct) || 0
      const gst = Number(ls.gst_rate_pct) || 0
      if (rate <= 0) continue
      const lineGross = qty * rate
      const taxable = r2(lineGross - lineGross * (disc / 100))
      const tax = r2(taxable * (gst / 100))
      gross += taxable
      totalWithTax += taxable + tax
    }
    return { taxable: r2(gross), total: r2(totalWithTax) }
  }, [lines, lineState])

  async function submit() {
    setErr(null)
    const responses: Array<{
      rfq_line_id: string
      rate: number
      discount_pct: number
      gst_rate_pct: number
      delivery_days: number | undefined
      notes: string | undefined
    }> = []
    for (let i = 0; i < lines.length; i++) {
      const ls = lineState[i]
      const rate = Number(ls.rate) || 0
      if (rate <= 0) continue
      responses.push({
        rfq_line_id: lines[i].id,
        rate,
        discount_pct: Number(ls.discount_pct) || 0,
        gst_rate_pct: Number(ls.gst_rate_pct) || 0,
        delivery_days: ls.delivery_days ? Number(ls.delivery_days) : undefined,
        notes: ls.notes.trim() || undefined,
      })
    }
    if (responses.length === 0) {
      setErr('Enter rate > 0 on at least one line')
      return
    }

    startTransition(async () => {
      const res = await recordVendorRfqResponse({
        rfq_id: rfqId,
        vendor_id: vendor.id,
        vendor_quote_no: quoteNo.trim() || undefined,
        vendor_quote_date: quoteDate || undefined,
        vendor_quote_validity: quoteValidity || undefined,
        payment_terms_days: paymentTermsDays ? Number(paymentTermsDays) : undefined,
        delivery_terms: deliveryTerms.trim() || undefined,
        notes: headerNotes.trim() || undefined,
        responses,
      })
      if (!res.ok) { setErr(res.error); toast.error(res.error); return }
      toast.success(`Response recorded · ${res.response_count} line${res.response_count === 1 ? '' : 's'}`)
      router.push(`/procurement/rfqs/${rfqId}`)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="grid md:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Vendor&apos;s quote no.</Label>
            <Input value={quoteNo} onChange={(e) => setQuoteNo(e.target.value)} className="font-mono" placeholder="VND/26/Q1/0023" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Quote date</Label>
            <Input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Validity</Label>
            <Input type="date" value={quoteValidity} onChange={(e) => setQuoteValidity(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Payment terms (days)</Label>
            <Input type="number" min="0" value={paymentTermsDays} onChange={(e) => setPaymentTermsDays(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label className="text-xs">Delivery terms</Label>
            <Input value={deliveryTerms} onChange={(e) => setDeliveryTerms(e.target.value)} placeholder="FOR site · ex-works · etc." />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="text-sm font-medium">Per-line rates</div>
          <div className="flex flex-col gap-2">
            {lines.map((l, idx) => {
              const ls = lineState[idx]
              const rate = Number(ls.rate) || 0
              const disc = Number(ls.discount_pct) || 0
              const gst = Number(ls.gst_rate_pct) || 0
              const taxable = r2(l.quantity * rate * (1 - disc / 100))
              const lineTotal = r2(taxable + taxable * (gst / 100))
              return (
                <div key={l.id} className="rounded-md border border-border p-3 flex flex-col gap-2">
                  <div className="text-xs">
                    <span className="font-medium">Line {l.line_no}</span> · {l.description}
                    <span className="text-muted-foreground"> · {l.quantity} {l.unit}{l.hsn_code ? ` · HSN ${l.hsn_code}` : ''}</span>
                  </div>
                  <div className="grid md:grid-cols-12 gap-2">
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">Rate (₹) *</Label>
                      <Input type="number" step="0.01" value={ls.rate} onChange={(e) => updateLine(idx, { rate: e.target.value })} className="tabular-nums" />
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">Disc %</Label>
                      <Input type="number" step="0.01" value={ls.discount_pct} onChange={(e) => updateLine(idx, { discount_pct: e.target.value })} className="tabular-nums" />
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">GST %</Label>
                      <Select value={ls.gst_rate_pct} onValueChange={(v) => updateLine(idx, { gst_rate_pct: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{GST_RATES.map((r) => <SelectItem key={r} value={r}>{r}%</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">Delivery (days)</Label>
                      <Input type="number" value={ls.delivery_days} onChange={(e) => updateLine(idx, { delivery_days: e.target.value })} className="tabular-nums" />
                    </div>
                    <div className="md:col-span-4 flex flex-col gap-1 justify-end text-xs tabular-nums">
                      {rate > 0 && (
                        <>
                          <div className="text-muted-foreground">Taxable ₹{formatINR(taxable)}</div>
                          <div className="font-medium">Total ₹{formatINR(lineTotal)}</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent className="flex flex-col gap-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Quote taxable subtotal</span>
            <span className="tabular-nums">₹{formatINR(totals.taxable)}</span>
          </div>
          <div className="flex items-center justify-between font-semibold">
            <span>Quote grand total (incl. GST)</span>
            <span className="tabular-nums">₹{formatINR(totals.total)}</span>
          </div>
        </CardContent>
      </Card>

      {err && (
        <div className="rounded-md border border-rose-300 bg-rose-50 text-rose-800 px-3 py-2 text-sm inline-flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          {err}
        </div>
      )}

      <div className="flex items-center justify-end">
        <Button onClick={submit} disabled={busy}>
          <Save className="size-4" /> Save response
        </Button>
      </div>
    </div>
  )
}
