'use client'

import { useState, useTransition } from 'react'
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
import { createStockTransfer } from '@/lib/actions/transfers'

interface Props {
  warehouses: { id: string; code: string; name: string; type: string }[]
  products: { id: string; sku_code: string; name: string; unit: string }[]
}

type Line = { product_id: string; quantity: number; notes?: string }

export function NewTransferForm({ warehouses, products }: Props) {
  const router = useRouter()
  const [fromId, setFromId] = useState<string>('')
  const [toId, setToId] = useState<string>('')
  const [scheduledAt, setScheduledAt] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([{ product_id: '', quantity: 0 }])
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function addLine() { setLines((p) => [...p, { product_id: '', quantity: 0 }]) }
  function removeLine(i: number) { setLines((p) => p.filter((_, idx) => idx !== i)) }
  function updateLine(i: number, patch: Partial<Line>) {
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  function submit() {
    setErr(null)
    if (!fromId || !toId) { setErr('Pick source and destination warehouses'); return }
    if (fromId === toId) { setErr('Source and destination must differ'); return }
    const valid = lines.filter((l) => l.product_id && l.quantity > 0)
    if (valid.length === 0) { setErr('Add at least one line with a product and quantity'); return }

    startTransition(async () => {
      const res = await createStockTransfer({
        from_warehouse_id: fromId,
        to_warehouse_id: toId,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        notes: notes.trim() || undefined,
        lines: valid,
      })
      if ('error' in res) { setErr(res.error); toast.error(res.error) }
      else { toast.success(`${res.transfer_number} created (draft)`); router.push(`/inventory/transfers/${res.id}`) }
    })
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>From warehouse</Label>
          <Select value={fromId} onValueChange={setFromId}>
            <SelectTrigger><SelectValue placeholder="Pick source" /></SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>To warehouse</Label>
          <Select value={toId} onValueChange={setToId}>
            <SelectTrigger><SelectValue placeholder="Pick destination" /></SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sched">Scheduled at (optional)</Label>
        <Input id="sched" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Lines</Label>
        <div className="flex flex-col gap-2 rounded-lg border border-border p-2 bg-muted/30">
          {lines.map((line, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select value={line.product_id} onValueChange={(v) => updateLine(i, { product_id: v })}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Pick product" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.sku_code} — {p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={line.quantity}
                onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                placeholder="Qty"
                className="w-28 tabular-nums"
              />
              <Button type="button" size="sm" variant="ghost" onClick={() => removeLine(i)} disabled={lines.length === 1}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={addLine} className="self-start">
            <Plus className="size-3.5 mr-1.5" /> Add line
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {err && <p className="text-xs text-destructive">{err}</p>}

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save as draft'}</Button>
      </div>
    </form>
  )
}
