'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PlusCircle, Pencil, Trash2 } from 'lucide-react'
import { upsertPriceListEntry, deletePriceListEntry } from '@/lib/actions/price-lists'

interface Entry {
  id: string
  product_id: string
  sku_code: string
  product_name: string
  unit: string
  mrp: number | null
  unit_price: number
  min_qty: number
  valid_from: string | null
  valid_to: string | null
  notes: string | null
}

interface Props {
  priceListId: string
  entries: Entry[]
  products: { id: string; sku_code: string; name: string; unit: string; mrp: number | null }[]
}

export function EntriesEditor({ priceListId, entries, products }: Props) {
  const [editingOpen, setEditingOpen] = useState(false)
  const [editing, setEditing] = useState<Entry | null>(null)

  function openAdd() {
    setEditing(null)
    setEditingOpen(true)
  }
  function openEdit(e: Entry) {
    setEditing(e)
    setEditingOpen(true)
  }

  // Group entries by product for cleaner display when tiered pricing exists
  const grouped = new Map<string, Entry[]>()
  for (const e of entries) {
    const list = grouped.get(e.product_id) ?? []
    list.push(e)
    grouped.set(e.product_id, list)
  }
  const groupedArr = Array.from(grouped.entries())
    .map(([pid, list]) => ({ pid, list: list.sort((a, b) => a.min_qty - b.min_qty) }))
    .sort((a, b) => (a.list[0]?.sku_code ?? '').localeCompare(b.list[0]?.sku_code ?? ''))

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm font-medium text-foreground">No entries yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Add per-product prices below.</p>
            <Button size="sm" onClick={openAdd} className="mt-3">
              <PlusCircle className="size-4 mr-1.5" /> Add entry
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
              <span className="text-xs text-muted-foreground">
                {entries.length} entries · {groupedArr.length} products
              </span>
              <Button size="sm" variant="outline" onClick={openAdd}>
                <PlusCircle className="size-3.5 mr-1.5" /> Add entry
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">SKU</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Min qty</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Unit price</th>
                  <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground sm:table-cell">vs MRP</th>
                  <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">Valid</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groupedArr.map(({ list }) => list.map((e, i) => {
                  const deltaPct = e.mrp != null && e.mrp > 0 ? ((e.unit_price - e.mrp) / e.mrp) * 100 : null
                  return (
                    <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{i === 0 ? e.sku_code : ''}</td>
                      <td className="px-3 py-2">{i === 0 ? e.product_name : <span className="text-muted-foreground/40">↳ tier</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(e.min_qty).toLocaleString('en-IN')}{e.unit && <span className="text-xs text-muted-foreground ml-1">{e.unit}</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        ₹{Number(e.unit_price).toLocaleString('en-IN')}
                      </td>
                      <td className="hidden px-3 py-2 text-right tabular-nums text-xs sm:table-cell">
                        {deltaPct == null ? (
                          <span className="text-muted-foreground/50">—</span>
                        ) : (
                          <span className={deltaPct > 0 ? 'text-emerald-700' : deltaPct < 0 ? 'text-destructive' : 'text-muted-foreground'}>
                            {deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td className="hidden px-3 py-2 text-xs text-muted-foreground md:table-cell tabular-nums">
                        {e.valid_from || e.valid_to ? (
                          <>
                            {e.valid_from ? new Date(e.valid_from).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                            {' – '}
                            {e.valid_to ? new Date(e.valid_to).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                          </>
                        ) : (
                          <span className="italic">always</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(e)} className="h-7 px-2">
                            <Pencil className="size-3 mr-1" /> Edit
                          </Button>
                          <DeleteButton entryId={e.id} priceListId={priceListId} />
                        </div>
                      </td>
                    </tr>
                  )
                }))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <EntryDialog
        open={editingOpen}
        onOpenChange={setEditingOpen}
        priceListId={priceListId}
        existing={editing}
        products={products}
      />
    </>
  )
}

function DeleteButton({ entryId, priceListId }: { entryId: string; priceListId: string }) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()

  function doDelete() {
    if (!confirm('Delete this price entry? This cannot be undone.')) return
    startTransition(async () => {
      const r = await deletePriceListEntry(entryId, priceListId)
      if ('error' in r) toast.error(r.error)
      else { toast.success('Entry deleted'); router.refresh() }
    })
  }

  return (
    <Button size="sm" variant="ghost" onClick={doDelete} disabled={busy} className="h-7 px-2 text-destructive hover:text-destructive">
      <Trash2 className="size-3" />
    </Button>
  )
}

function EntryDialog({
  open, onOpenChange, priceListId, existing, products,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  priceListId: string
  existing: Entry | null
  products: { id: string; sku_code: string; name: string; unit: string; mrp: number | null }[]
}) {
  const router = useRouter()
  const [productId, setProductId] = useState<string>(existing?.product_id ?? '')
  const [unitPrice, setUnitPrice] = useState<number>(existing?.unit_price ?? 0)
  const [minQty, setMinQty] = useState<number>(existing?.min_qty ?? 0)
  const [validFrom, setValidFrom] = useState<string>(existing?.valid_from ?? '')
  const [validTo, setValidTo] = useState<string>(existing?.valid_to ?? '')
  const [notes, setNotes] = useState<string>(existing?.notes ?? '')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  // Reset state when dialog opens with new context
  useState(() => {
    if (open) {
      setProductId(existing?.product_id ?? '')
      setUnitPrice(existing?.unit_price ?? 0)
      setMinQty(existing?.min_qty ?? 0)
      setValidFrom(existing?.valid_from ?? '')
      setValidTo(existing?.valid_to ?? '')
      setNotes(existing?.notes ?? '')
    }
  })

  const product = products.find((p) => p.id === productId)

  function submit() {
    setErr(null)
    if (!productId) { setErr('Pick a product'); return }
    if (unitPrice < 0) { setErr('Price must be non-negative'); return }
    startTransition(async () => {
      const res = await upsertPriceListEntry({
        id: existing?.id,
        price_list_id: priceListId,
        product_id: productId,
        unit_price: unitPrice,
        min_qty: minQty,
        valid_from: validFrom || null,
        valid_to: validTo || null,
        notes: notes.trim() || undefined,
      })
      if ('error' in res) { setErr(res.error); toast.error(res.error) }
      else {
        toast.success(existing ? 'Entry updated' : 'Entry added')
        onOpenChange(false)
        router.refresh()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{existing ? 'Edit entry' : 'Add entry'}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Product</Label>
            {existing ? (
              <p className="text-sm py-1.5">
                <span className="font-mono text-xs text-muted-foreground mr-1">{existing.sku_code}</span>
                {existing.product_name}
              </p>
            ) : (
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder="Pick a product" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="font-mono text-xs text-muted-foreground mr-1">{p.sku_code}</span>
                      {p.name}
                      {p.mrp && <span className="text-xs text-muted-foreground ml-1">(MRP ₹{Number(p.mrp).toLocaleString('en-IN')})</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qty">Min qty</Label>
              <Input id="qty" type="number" min={0} step="0.01" value={minQty} onChange={(e) => setMinQty(Number(e.target.value))} />
              <p className="text-[10px] text-muted-foreground">0 = applies to all orders. Higher tiers override at qty &gt; this.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="price">Unit price (₹)</Label>
              <Input id="price" type="number" min={0} step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value))} />
              {product?.mrp && unitPrice > 0 && (
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  vs MRP ₹{Number(product.mrp).toLocaleString('en-IN')}:{' '}
                  <span className={unitPrice > Number(product.mrp) ? 'text-emerald-700' : unitPrice < Number(product.mrp) ? 'text-destructive' : ''}>
                    {(((unitPrice - Number(product.mrp)) / Number(product.mrp)) * 100).toFixed(1)}%
                  </span>
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vf">Valid from</Label>
              <Input id="vf" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vt">Valid to</Label>
              <Input id="vt" type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
