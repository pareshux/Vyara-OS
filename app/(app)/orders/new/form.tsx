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
import { Trash2, Plus } from 'lucide-react'
import { createOrderManual } from '@/lib/actions/orders'

const NONE = '__none__'

interface Props {
  projects: { id: string; name: string; buyer_firm_id: string | null }[]
  firms: { id: string; name: string }[]
  products: { id: string; sku_code: string; name: string; unit: string; mrp: number | null; base_price: number | null }[]
  userRole: string
}

type Line = { product_id: string; quantity: number; unit_price: number; notes?: string }

export function NewOrderForm({ projects, firms, products, userRole }: Props) {
  const router = useRouter()
  const isSalesEngineer = userRole === 'sales_engineer'

  const [projectId, setProjectId] = useState<string>('')
  const [buyerId, setBuyerId] = useState<string>(NONE)
  const [expectedDelivery, setExpectedDelivery] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([{ product_id: '', quantity: 0, unit_price: 0 }])
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  // When a project is picked, auto-fill the buyer firm if it has one
  useEffect(() => {
    if (!projectId) return
    const p = projects.find((x) => x.id === projectId)
    if (p?.buyer_firm_id && buyerId === NONE) {
      setBuyerId(p.buyer_firm_id)
    }
  }, [projectId, projects, buyerId])

  const productsById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products])

  const totalValue = useMemo(
    () => lines.reduce((sum, l) => sum + (l.quantity || 0) * (l.unit_price || 0), 0),
    [lines]
  )

  function addLine() { setLines((p) => [...p, { product_id: '', quantity: 0, unit_price: 0 }]) }
  function removeLine(i: number) { setLines((p) => p.filter((_, idx) => idx !== i)) }
  function updateLine(i: number, patch: Partial<Line>) {
    setLines((p) =>
      p.map((l, idx) => {
        if (idx !== i) return l
        const next = { ...l, ...patch }
        // When product changes, auto-populate unit_price from MRP (if not already set)
        if (patch.product_id && patch.product_id !== l.product_id) {
          const prod = productsById[patch.product_id]
          if (prod?.mrp && next.unit_price === 0) {
            next.unit_price = Number(prod.mrp)
          }
        }
        return next
      })
    )
  }

  function submit() {
    setErr(null)
    if (!projectId) { setErr('Pick a project'); return }
    const valid = lines.filter((l) => l.product_id && l.quantity > 0 && l.unit_price >= 0)
    if (valid.length === 0) { setErr('Add at least one line with product + quantity'); return }

    const payloadLines = valid.map((l) => {
      const p = productsById[l.product_id]
      return {
        product_id: l.product_id,
        product_name: p.name,
        sku_code: p.sku_code,
        unit: p.unit,
        quantity: l.quantity,
        unit_price: l.unit_price,
      }
    })

    startTransition(async () => {
      const res = await createOrderManual({
        project_id: projectId,
        buyer_firm_id: buyerId === NONE ? undefined : buyerId,
        expected_delivery_at: expectedDelivery || undefined,
        notes: notes.trim() || undefined,
        lines: payloadLines,
      })
      if ('error' in res) { setErr(res.error); toast.error(res.error) }
      else {
        toast.success(`Order ${res.order_number} created`)
        router.push(`/orders/${res.id}`)
      }
    })
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Project *</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger><SelectValue placeholder="Pick a project" /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Buyer firm</Label>
          <Select value={buyerId} onValueChange={setBuyerId}>
            <SelectTrigger><SelectValue placeholder="(auto-filled from project)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>—</SelectItem>
              {firms.map((f) => (<SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="eta">Expected delivery (optional)</Label>
        <Input id="eta" type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Line items</Label>
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-2">
          {lines.map((line, i) => {
            const lineTotal = (line.quantity || 0) * (line.unit_price || 0)
            return (
              <div key={i} className="flex flex-col gap-2 rounded-md bg-card border border-border p-2">
                <div className="flex items-center gap-2">
                  <Select value={line.product_id} onValueChange={(v) => updateLine(i, { product_id: v })}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Pick a product" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="font-mono text-xs text-muted-foreground mr-1">{p.sku_code}</span> {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeLine(i)} disabled={lines.length === 1}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Quantity</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.quantity}
                      onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                      className="tabular-nums h-8"
                    />
                  </div>
                  {!isSalesEngineer && (
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Unit price (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.unit_price}
                        onChange={(e) => updateLine(i, { unit_price: Number(e.target.value) })}
                        className="tabular-nums h-8"
                      />
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Line total</Label>
                    <div className="h-8 flex items-center px-2 text-sm tabular-nums font-medium">
                      ₹{lineTotal.toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          <Button type="button" size="sm" variant="outline" onClick={addLine} className="self-start">
            <Plus className="size-3.5 mr-1.5" /> Add line
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-3 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Order total</span>
        <span className="tabular-nums text-lg font-semibold text-primary">₹{totalValue.toLocaleString('en-IN')}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {err && <p className="text-xs text-destructive">{err}</p>}

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create order'}</Button>
      </div>
    </form>
  )
}
