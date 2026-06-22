'use client'

/**
 * NewPurchaseOrderForm — create a PO with N line items.
 *
 * Client-side because the line totals + IGST/CGST+SGST split must
 * update live. Validation is duplicated server-side in
 * createPurchaseOrder; we mirror the friendliest checks here so the
 * user sees errors before submitting.
 *
 * IGST vs CGST+SGST chip: derived from the selected vendor's GSTIN
 * state code (first 2 chars) vs the warehouse state (mapped through
 * the same table as the server action). If either side is missing
 * we default to IGST (interstate) — matches the server defensive default.
 */
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
import { Plus, Trash2, AlertCircle } from 'lucide-react'
import { createPurchaseOrder, submitPurchaseOrder } from '@/lib/actions/purchase-orders'

type VendorPick = { id: string; name: string; code: string; gstin: string | null; payment_terms_days: number | null; msme_status: string | null }
type WarehousePick = { id: string; name: string; code: string; state: string | null }
type ProductPick = { id: string; sku_code: string; name: string; unit: string }
type ProjectPick = { id: string; name: string }

interface Props {
  vendors: VendorPick[]
  warehouses: WarehousePick[]
  products: ProductPick[]
  projects: ProjectPick[]
}

type LineDraft = {
  key: string  // local ID for React key + remove
  product_id: string | null
  description: string
  hsn_code: string
  unit: string
  quantity: string
  rate: string
  discount_pct: string
  gst_rate_pct: string
}

const STATE_CODES: Record<string, string> = {
  'jammu and kashmir': '01', 'himachal pradesh': '02', 'punjab': '03',
  'chandigarh': '04', 'uttarakhand': '05', 'haryana': '06', 'delhi': '07',
  'rajasthan': '08', 'uttar pradesh': '09', 'bihar': '10', 'sikkim': '11',
  'arunachal pradesh': '12', 'nagaland': '13', 'manipur': '14',
  'mizoram': '15', 'tripura': '16', 'meghalaya': '17', 'assam': '18',
  'west bengal': '19', 'jharkhand': '20', 'odisha': '21',
  'chhattisgarh': '22', 'madhya pradesh': '23', 'gujarat': '24',
  'daman and diu': '25', 'dadra and nagar haveli': '26',
  'maharashtra': '27', 'karnataka': '29', 'goa': '30', 'lakshadweep': '31',
  'kerala': '32', 'tamil nadu': '33', 'puducherry': '34',
  'andaman and nicobar islands': '35', 'telangana': '36',
  'andhra pradesh': '37', 'ladakh': '38',
}

const GST_RATES = ['0', '5', '12', '18', '28']
const UNITS = ['nos', 'kgs', 'mtr', 'sqft', 'sqm', 'ltr', 'set', 'box', 'roll', 'pkt']

function newLine(): LineDraft {
  return {
    key: Math.random().toString(36).slice(2),
    product_id: null,
    description: '',
    hsn_code: '',
    unit: 'nos',
    quantity: '',
    rate: '',
    discount_pct: '0',
    gst_rate_pct: '18',
  }
}

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export function NewPurchaseOrderForm({ vendors, warehouses, products, projects }: Props) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  // Header state
  const [vendorId, setVendorId] = useState<string>('')
  const [warehouseId, setWarehouseId] = useState<string>(warehouses[0]?.id ?? '')
  const [projectId, setProjectId] = useState<string>('')
  const [poDate, setPoDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [expectedDelivery, setExpectedDelivery] = useState<string>('')
  const [paymentTermsDays, setPaymentTermsDays] = useState<string>('30')

  // Terms
  const [deliveryTerms, setDeliveryTerms] = useState<string>('')
  const [warrantyTerms, setWarrantyTerms] = useState<string>('')
  const [liquidatedDamagesTerms, setLdTerms] = useState<string>('')
  const [retentionPct, setRetentionPct] = useState<string>('')
  const [otherTerms, setOtherTerms] = useState<string>('')
  const [notes, setNotes] = useState<string>('')

  // Lines
  const [lines, setLines] = useState<LineDraft[]>([newLine()])

  const vendor = useMemo(() => vendors.find((v) => v.id === vendorId), [vendors, vendorId])
  const warehouse = useMemo(() => warehouses.find((w) => w.id === warehouseId), [warehouses, warehouseId])

  // Auto-fill payment terms when vendor changes.
  function pickVendor(id: string) {
    setVendorId(id)
    const v = vendors.find((x) => x.id === id)
    if (v?.payment_terms_days != null) setPaymentTermsDays(String(v.payment_terms_days))
  }

  // GST routing — interstate vs intra.
  const interstate = useMemo(() => {
    if (!vendor?.gstin) return true
    if (!warehouse?.state) return true
    const vendorCode = vendor.gstin.substring(0, 2)
    const whCode = STATE_CODES[warehouse.state.trim().toLowerCase()]
    if (!whCode) return true
    return vendorCode !== whCode
  }, [vendor, warehouse])

  // Live totals
  const totals = useMemo(() => {
    let sub = 0
    let dis = 0
    let tax = 0
    for (const l of lines) {
      const q = Number(l.quantity) || 0
      const r = Number(l.rate) || 0
      const d = Number(l.discount_pct) || 0
      const g = Number(l.gst_rate_pct) || 0
      const gross = q * r
      const disc = r2(gross * (d / 100))
      const taxable = r2(gross - disc)
      const t = r2(taxable * (g / 100))
      sub += taxable
      dis += disc
      tax += t
    }
    sub = r2(sub)
    dis = r2(dis)
    tax = r2(tax)
    return { subtotal: sub, discount: dis, tax, total: r2(sub + tax) }
  }, [lines])

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)))
  }

  function pickProductForLine(key: string, productId: string) {
    if (productId === '__none__') {
      updateLine(key, { product_id: null })
      return
    }
    const p = products.find((x) => x.id === productId)
    if (!p) return
    updateLine(key, {
      product_id: p.id,
      description: p.name,
      unit: p.unit,
    })
  }

  async function save(submitAfter: boolean) {
    setErr(null)
    if (!vendorId)    { setErr('Vendor is required');    return }
    if (!warehouseId) { setErr('Warehouse is required'); return }
    if (lines.length === 0) { setErr('At least one line item is required'); return }
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      if (!l.description.trim()) { setErr(`Line ${i + 1}: description is required`); return }
      const q = Number(l.quantity)
      if (!Number.isFinite(q) || q <= 0) { setErr(`Line ${i + 1}: quantity must be > 0`); return }
      const r = Number(l.rate)
      if (!Number.isFinite(r) || r < 0) { setErr(`Line ${i + 1}: rate must be ≥ 0`); return }
    }

    startTransition(async () => {
      const res = await createPurchaseOrder({
        vendor_id: vendorId,
        ship_to_warehouse_id: warehouseId,
        project_id: projectId || null,
        po_date: poDate,
        expected_delivery_at: expectedDelivery || null,
        payment_terms_days: Number(paymentTermsDays) || 30,
        delivery_terms: deliveryTerms.trim() || undefined,
        warranty_terms: warrantyTerms.trim() || undefined,
        liquidated_damages_terms: liquidatedDamagesTerms.trim() || undefined,
        retention_pct: retentionPct ? Number(retentionPct) : null,
        other_terms: otherTerms.trim() || undefined,
        notes: notes.trim() || undefined,
        lines: lines.map((l) => ({
          product_id: l.product_id,
          description: l.description.trim(),
          hsn_code: l.hsn_code.trim() || null,
          unit: l.unit || 'nos',
          quantity: Number(l.quantity),
          rate: Number(l.rate),
          discount_pct: Number(l.discount_pct) || 0,
          gst_rate_pct: Number(l.gst_rate_pct) || 0,
        })),
      })

      if (!res.ok) {
        setErr(res.error)
        toast.error(res.error)
        return
      }

      if (submitAfter) {
        const sub = await submitPurchaseOrder(res.id)
        if (!sub.ok) {
          toast.warning(`Draft saved as ${res.po_number}, but submit failed: ${sub.error}`)
        } else {
          toast.success(
            sub.status === 'approved'
              ? `${res.po_number} auto-approved (under threshold)`
              : `${res.po_number} submitted for approval`,
          )
        }
      } else {
        toast.success(`Draft saved as ${res.po_number}`)
      }
      router.push(`/procurement/orders/${res.id}`)
    })
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header card */}
      <Card>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Vendor *</Label>
            <Select value={vendorId} onValueChange={pickVendor}>
              <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.code} · {v.name}{v.msme_status && v.msme_status !== 'not_msme' ? ` (MSME ${v.msme_status})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {vendor && (
              <div className="text-[11px] text-muted-foreground">
                {vendor.gstin ? `GSTIN ${vendor.gstin}` : 'No GSTIN on file'}{vendor.payment_terms_days != null && ` · default ${vendor.payment_terms_days}d terms`}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Ship-to warehouse *</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.code} · {w.name}{w.state ? ` · ${w.state}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {vendor && warehouse && (
              <div>
                <Badge variant="outline" className={interstate ? 'bg-amber-50 text-amber-800 border-amber-200 text-[11px]' : 'bg-sky-50 text-sky-800 border-sky-200 text-[11px]'}>
                  {interstate ? 'Inter-state · IGST' : 'Intra-state · CGST + SGST'}
                </Badge>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Project (optional)</Label>
            <Select value={projectId} onValueChange={(v) => setProjectId(v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No project</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">PO date</Label>
              <Input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Expected delivery</Label>
              <Input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Payment terms (days)</Label>
              <Input type="number" min="0" max="365" value={paymentTermsDays} onChange={(e) => setPaymentTermsDays(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Line items</div>
            <Button size="sm" variant="outline" onClick={() => setLines((prev) => [...prev, newLine()])}>
              <Plus className="size-3.5" /> Add line
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            {lines.map((l, idx) => {
              const q = Number(l.quantity) || 0
              const r = Number(l.rate) || 0
              const d = Number(l.discount_pct) || 0
              const g = Number(l.gst_rate_pct) || 0
              const gross = q * r
              const disc = r2(gross * (d / 100))
              const taxable = r2(gross - disc)
              const tax = r2(taxable * (g / 100))
              const lineTotal = r2(taxable + tax)
              return (
                <div key={l.key} className="rounded-md border border-border p-3 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-muted-foreground">Line {idx + 1}</div>
                    {lines.length > 1 && (
                      <button type="button" className="text-muted-foreground hover:text-rose-600 transition-colors" onClick={() => removeLine(l.key)}>
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid md:grid-cols-12 gap-2">
                    {/* Product (optional) + description */}
                    <div className="md:col-span-5 flex flex-col gap-1">
                      <Label className="text-xs">Product (optional)</Label>
                      <Select value={l.product_id ?? '__none__'} onValueChange={(v) => pickProductForLine(l.key, v)}>
                        <SelectTrigger><SelectValue placeholder="Ad-hoc — no product link" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Ad-hoc (no product link)</SelectItem>
                          {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.sku_code} · {p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="md:col-span-7 flex flex-col gap-1">
                      <Label className="text-xs">Description *</Label>
                      <Input value={l.description} onChange={(e) => updateLine(l.key, { description: e.target.value })} placeholder="What you're buying" />
                    </div>

                    {/* Numbers row */}
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">HSN/SAC</Label>
                      <Input value={l.hsn_code} onChange={(e) => updateLine(l.key, { hsn_code: e.target.value })} className="font-mono" />
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">Unit</Label>
                      <Select value={l.unit} onValueChange={(v) => updateLine(l.key, { unit: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">Qty *</Label>
                      <Input type="number" step="0.001" value={l.quantity} onChange={(e) => updateLine(l.key, { quantity: e.target.value })} className="tabular-nums" />
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">Rate (₹) *</Label>
                      <Input type="number" step="0.01" value={l.rate} onChange={(e) => updateLine(l.key, { rate: e.target.value })} className="tabular-nums" />
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">Disc %</Label>
                      <Input type="number" step="0.01" min="0" max="100" value={l.discount_pct} onChange={(e) => updateLine(l.key, { discount_pct: e.target.value })} className="tabular-nums" />
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">GST %</Label>
                      <Select value={l.gst_rate_pct} onValueChange={(v) => updateLine(l.key, { gst_rate_pct: v })}>
                        <SelectTrigger className="tabular-nums"><SelectValue /></SelectTrigger>
                        <SelectContent>{GST_RATES.map((rate) => <SelectItem key={rate} value={rate}>{rate}%</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Inline line total */}
                  <div className="flex justify-end gap-4 text-[11px] text-muted-foreground tabular-nums">
                    <span>Taxable ₹{formatINR(taxable)}</span>
                    <span>{interstate ? `IGST ₹${formatINR(tax)}` : `CGST ₹${formatINR(r2(tax / 2))} + SGST ₹${formatINR(r2(tax - r2(tax / 2)))}`}</span>
                    <span className="font-medium text-foreground">₹{formatINR(lineTotal)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Totals */}
      <Card size="sm">
        <CardContent className="flex flex-col gap-1.5 text-sm">
          <Row label="Subtotal (taxable)" value={`₹${formatINR(totals.subtotal)}`} />
          {totals.discount > 0 && <Row label="Discount" value={`− ₹${formatINR(totals.discount)}`} />}
          <Row label={interstate ? 'IGST' : 'CGST + SGST'} value={`₹${formatINR(totals.tax)}`} />
          <div className="border-t border-border my-1" />
          <Row label="Grand total" value={`₹${formatINR(totals.total)}`} bold />
        </CardContent>
      </Card>

      {/* Terms */}
      <Card>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Delivery terms</Label>
            <Input value={deliveryTerms} onChange={(e) => setDeliveryTerms(e.target.value)} placeholder="FOR site / ex-works / DDP …" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Warranty</Label>
            <Input value={warrantyTerms} onChange={(e) => setWarrantyTerms(e.target.value)} placeholder="12 months from commissioning" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Liquidated damages</Label>
            <Input value={liquidatedDamagesTerms} onChange={(e) => setLdTerms(e.target.value)} placeholder="0.5% per week, max 5%" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Retention (%)</Label>
            <Input type="number" step="0.01" min="0" max="100" value={retentionPct} onChange={(e) => setRetentionPct(e.target.value)} />
          </div>
          <div className="md:col-span-2 flex flex-col gap-1.5">
            <Label className="text-xs">Other terms</Label>
            <Textarea rows={2} value={otherTerms} onChange={(e) => setOtherTerms(e.target.value)} />
          </div>
          <div className="md:col-span-2 flex flex-col gap-1.5">
            <Label className="text-xs">Internal notes (not on PDF)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
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
