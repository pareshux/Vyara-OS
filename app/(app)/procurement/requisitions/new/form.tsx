'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertCircle, Plus, Trash2, ClipboardList } from 'lucide-react'
import { createPurchaseRequisition, type PrLineInput } from '@/lib/actions/purchase-requisitions'

interface Props {
  projects: Array<{ id: string; name: string }>
  products: Array<{ id: string; sku_code: string; name: string; unit: string }>
  vendors: Array<{ id: string; name: string; code: string }>
}

type LineDraft = {
  key: string
  product_id: string | null
  description: string
  hsn_code: string
  unit: string
  quantity: string
  estimated_rate: string
  preferred_vendor_id: string | null
  specifications: string
}

const UNITS = ['nos', 'kgs', 'mtr', 'rmt', 'sqft', 'sqm', 'ltr', 'set', 'box', 'roll', 'pkt', 'bags']

function newLine(): LineDraft {
  return {
    key: Math.random().toString(36).slice(2),
    product_id: null,
    description: '',
    hsn_code: '',
    unit: 'nos',
    quantity: '',
    estimated_rate: '',
    preferred_vendor_id: null,
    specifications: '',
  }
}

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function formatMoneyShort(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} cr`
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)} L`
  if (n >= 1_000)       return `₹${(n / 1_000).toFixed(1)} k`
  return `₹${n.toFixed(0)}`
}

export function NewPrForm({ projects, products, vendors }: Props) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  // Header
  const [projectId, setProjectId] = useState<string>('')
  const [costCenter, setCostCenter] = useState('')
  const [requiredBy, setRequiredBy] = useState<string>('')
  const [justification, setJustification] = useState('')
  const [notes, setNotes] = useState('')

  // Lines
  const [lines, setLines] = useState<LineDraft[]>([newLine()])

  function updateLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }
  function pickProduct(idx: number, productId: string) {
    if (productId === '__none__') {
      updateLine(idx, { product_id: null })
      return
    }
    const p = products.find((x) => x.id === productId)
    if (!p) return
    updateLine(idx, {
      product_id: p.id,
      description: p.name,
      unit: p.unit,
    })
  }
  function pickVendor(idx: number, vendorId: string) {
    updateLine(idx, { preferred_vendor_id: vendorId === '__none__' ? null : vendorId })
  }
  function removeLine(key: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)))
  }

  const totals = useMemo(() => {
    let estimated = 0
    let validLineCount = 0
    for (const l of lines) {
      const q = Number(l.quantity) || 0
      const r = Number(l.estimated_rate) || 0
      if (q > 0 && r >= 0) {
        estimated += q * r
        validLineCount++
      }
    }
    return { estimated: r2(estimated), validLineCount }
  }, [lines])

  async function save(submit: boolean) {
    setErr(null)

    const payload: PrLineInput[] = []
    for (const l of lines) {
      const q = Number(l.quantity) || 0
      const r = Number(l.estimated_rate) || 0
      if (q === 0 && !l.description.trim()) continue   // skip empty rows silently
      if (!l.description.trim()) {
        setErr(`Line: description is required`)
        return
      }
      if (q <= 0) {
        setErr(`${l.description}: quantity must be > 0`)
        return
      }
      if (r < 0) {
        setErr(`${l.description}: estimated rate cannot be negative`)
        return
      }
      payload.push({
        product_id: l.product_id,
        description: l.description.trim(),
        hsn_code: l.hsn_code.trim() || null,
        unit: l.unit || 'nos',
        quantity: q,
        estimated_rate: r,
        preferred_vendor_id: l.preferred_vendor_id,
        specifications: l.specifications.trim() || undefined,
      })
    }
    if (payload.length === 0) {
      setErr('At least one line with description + quantity is required')
      return
    }

    startTransition(async () => {
      const res = await createPurchaseRequisition({
        project_id: projectId || null,
        cost_center: costCenter.trim() || undefined,
        required_by_date: requiredBy || null,
        justification: justification.trim() || undefined,
        notes: notes.trim() || undefined,
        lines: payload,
        submit_immediately: submit,
      })
      if (!res.ok) { setErr(res.error); toast.error(res.error); return }
      const msg = submit
        ? res.status === 'approved'
          ? `${res.pr_number} auto-approved (under threshold)`
          : `${res.pr_number} submitted for approval`
        : `${res.pr_number} saved as draft`
      toast.success(msg)
      router.push(`/procurement/requisitions/${res.id}`)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Project (optional)</Label>
            <Select value={projectId || '__none__'} onValueChange={(v) => setProjectId(v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No project</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Cost center</Label>
            <Input value={costCenter} onChange={(e) => setCostCenter(e.target.value)} placeholder="e.g. EPC-Adani / Plant-1 / R&D" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Required by</Label>
            <Input type="date" value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Justification</Label>
            <Textarea rows={2} value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Why this is needed (visible to approver)" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium inline-flex items-center gap-1.5">
              <ClipboardList className="size-3.5" /> Items requested
            </div>
            <Button size="sm" variant="outline" onClick={() => setLines((prev) => [...prev, newLine()])}>
              <Plus className="size-3.5" /> Add item
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            {lines.map((l, idx) => {
              const q = Number(l.quantity) || 0
              const r = Number(l.estimated_rate) || 0
              const lineEst = r2(q * r)
              return (
                <div key={l.key} className="rounded-md border border-border p-3 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-muted-foreground">Item {idx + 1}</div>
                    {lines.length > 1 && (
                      <button type="button" className="text-muted-foreground hover:text-rose-600" onClick={() => removeLine(l.key)}>
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid md:grid-cols-12 gap-2">
                    <div className="md:col-span-4 flex flex-col gap-1">
                      <Label className="text-xs">Product (optional)</Label>
                      <Select value={l.product_id ?? '__none__'} onValueChange={(v) => pickProduct(idx, v)}>
                        <SelectTrigger><SelectValue placeholder="Ad-hoc — no product link" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Ad-hoc (no product link)</SelectItem>
                          {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.sku_code} · {p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-8 flex flex-col gap-1">
                      <Label className="text-xs">Description *</Label>
                      <Input value={l.description} onChange={(e) => updateLine(idx, { description: e.target.value })} placeholder="What's needed" />
                    </div>

                    <div className="md:col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">HSN/SAC</Label>
                      <Input value={l.hsn_code} onChange={(e) => updateLine(idx, { hsn_code: e.target.value })} className="font-mono" />
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">Unit</Label>
                      <Select value={l.unit} onValueChange={(v) => updateLine(idx, { unit: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">Qty *</Label>
                      <Input type="number" step="0.001" value={l.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} className="tabular-nums" />
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">Est. rate (₹)</Label>
                      <Input type="number" step="0.01" value={l.estimated_rate} onChange={(e) => updateLine(idx, { estimated_rate: e.target.value })} className="tabular-nums" />
                    </div>
                    <div className="md:col-span-4 flex flex-col gap-1">
                      <Label className="text-xs">Preferred vendor</Label>
                      <Select value={l.preferred_vendor_id ?? '__none__'} onValueChange={(v) => pickVendor(idx, v)}>
                        <SelectTrigger><SelectValue placeholder="No preference" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No preference</SelectItem>
                          {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.code} · {v.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="md:col-span-12 flex flex-col gap-1">
                      <Label className="text-xs">Specifications (optional)</Label>
                      <Input value={l.specifications} onChange={(e) => updateLine(idx, { specifications: e.target.value })} placeholder="e.g. ASTM grade, finish, brand preference, drawing ref" />
                    </div>
                  </div>

                  {lineEst > 0 && (
                    <div className="text-[11px] text-muted-foreground tabular-nums text-right">
                      Estimated value: ₹{formatINR(lineEst)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent className="flex flex-col gap-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Total estimated value</span>
            <span className="font-semibold tabular-nums">{formatMoneyShort(totals.estimated)} <span className="text-muted-foreground text-xs">(₹{formatINR(totals.estimated)})</span></span>
          </div>
          {totals.estimated > 50000 && (
            <div className="text-[11px] text-muted-foreground border-t border-border pt-1.5">
              Above ₹50k auto-approve threshold — submit will route to{' '}
              {totals.estimated <= 500000 ? 'Manager' : totals.estimated <= 2500000 ? 'Manager + Director' : 'Director'} approval.
            </div>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent>
          <Label className="text-xs">Internal notes (not on approval / vendor copy)</Label>
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
