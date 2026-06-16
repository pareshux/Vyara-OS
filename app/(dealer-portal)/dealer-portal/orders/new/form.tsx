'use client'

import { useState, useTransition, useMemo } from 'react'
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
import { placeDealerOrder } from '@/lib/actions/dealer-orders'

interface Props {
  products: { id: string; sku_code: string; name: string; unit: string; mrp: number | null; category: string }[]
}

type Line = { product_id: string; quantity: number }

export function NewDealerOrderForm({ products }: Props) {
  const router = useRouter()
  const [siteRef, setSiteRef] = useState('')
  const [expectedDelivery, setExpectedDelivery] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([{ product_id: '', quantity: 0 }])
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const productsById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products])

  const totalValue = useMemo(
    () => lines.reduce((s, l) => {
      const p = productsById[l.product_id]
      const price = p?.mrp ? Number(p.mrp) : 0
      return s + (l.quantity || 0) * price
    }, 0),
    [lines, productsById]
  )

  function addLine() { setLines((p) => [...p, { product_id: '', quantity: 0 }]) }
  function removeLine(i: number) { setLines((p) => p.filter((_, idx) => idx !== i)) }
  function updateLine(i: number, patch: Partial<Line>) {
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  function submit() {
    setErr(null)
    const valid = lines.filter((l) => l.product_id && l.quantity > 0)
    if (valid.length === 0) { setErr('Add at least one product with quantity'); return }
    startTransition(async () => {
      const res = await placeDealerOrder({
        site_ref: siteRef.trim() || undefined,
        expected_delivery_at: expectedDelivery || undefined,
        notes: notes.trim() || undefined,
        lines: valid,
      })
      if ('error' in res) { setErr(res.error); toast.error(res.error) }
      else {
        toast.success(`Order ${res.order_number} placed`)
        router.push(`/dealer-portal/orders/${res.id}`)
      }
    })
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ref">Site / PO ref (optional)</Label>
          <Input
            id="ref"
            value={siteRef}
            onChange={(e) => setSiteRef(e.target.value)}
            placeholder="e.g. PO-2026-042"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="eta">Expected delivery (optional)</Label>
          <Input
            id="eta"
            type="date"
            value={expectedDelivery}
            onChange={(e) => setExpectedDelivery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Products</Label>
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-2">
          {lines.map((line, i) => {
            const p = productsById[line.product_id]
            const lineTotal = (line.quantity || 0) * (p?.mrp ? Number(p.mrp) : 0)
            return (
              <div key={i} className="flex flex-col gap-2 rounded-md bg-card border border-border p-2">
                <div className="flex items-center gap-2">
                  <Select value={line.product_id} onValueChange={(v) => updateLine(i, { product_id: v })}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Pick a product" /></SelectTrigger>
                    <SelectContent>
                      {products.map((pp) => (
                        <SelectItem key={pp.id} value={pp.id}>
                          <span className="font-mono text-xs text-muted-foreground mr-1">{pp.sku_code}</span> {pp.name}
                          {pp.mrp && <span className="text-xs text-muted-foreground ml-1">· ₹{Number(pp.mrp).toLocaleString('en-IN')}/{pp.unit}</span>}
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
                    <Label className="text-xs text-muted-foreground">Quantity {p && `(${p.unit})`}</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.quantity}
                      onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                      className="tabular-nums h-8"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Price</Label>
                    <div className="h-8 flex items-center px-2 text-sm tabular-nums text-muted-foreground">
                      {p?.mrp ? `₹${Number(p.mrp).toLocaleString('en-IN')}` : '—'}
                    </div>
                  </div>
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
            <Plus className="size-3.5 mr-1.5" /> Add product
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-3 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Estimated total</span>
        <span className="tabular-nums text-lg font-semibold text-primary">₹{totalValue.toLocaleString('en-IN')}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything Vyara should know — delivery timing, packaging, etc."
        />
      </div>

      {err && <p className="text-xs text-destructive">{err}</p>}

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Placing…' : 'Place order'}</Button>
      </div>
    </form>
  )
}
