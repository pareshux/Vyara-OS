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
import { Pencil } from 'lucide-react'
import { requestAdjustment, AdjustmentType } from '@/lib/actions/adjustments'

export function AdjustButton({
  warehouseId,
  productId,
  skuCode,
  productName,
  currentAvailable,
  estimatedUnitPrice,
}: {
  warehouseId: string
  productId: string
  skuCode: string
  productName: string
  currentAvailable: number
  estimatedUnitPrice?: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<AdjustmentType>('damage')
  const [delta, setDelta] = useState<number>(0)
  const [reason, setReason] = useState('')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const estValue = estimatedUnitPrice ? Math.abs(delta) * estimatedUnitPrice : undefined

  function submit() {
    setErr(null)
    if (delta === 0) { setErr('Quantity delta cannot be zero'); return }
    if (delta < 0 && Math.abs(delta) > currentAvailable) {
      setErr(`Cannot remove ${Math.abs(delta)} — only ${currentAvailable} available`); return
    }
    if (!reason.trim()) { setErr('Reason is required'); return }
    startTransition(async () => {
      const res = await requestAdjustment({
        warehouse_id: warehouseId,
        product_id: productId,
        adjustment_type: type,
        quantity_delta: delta,
        reason,
        estimated_value: estValue,
      })
      if ('error' in res) { setErr(res.error); toast.error(res.error) }
      else {
        toast.success(res.status === 'pending' ? 'Adjustment requested — pending approval' : 'Adjustment applied')
        setOpen(false); setDelta(0); setReason('')
        router.refresh()
      }
    })
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} className="h-7 px-2">
        <Pencil className="size-3 mr-1" /> Adjust
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Adjust stock — <span className="font-mono text-sm">{skuCode}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              {productName} · current available <span className="tabular-nums font-medium text-foreground">{currentAvailable.toLocaleString('en-IN')}</span>
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as AdjustmentType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="damage">Damage</SelectItem>
                    <SelectItem value="count_diff">Count difference</SelectItem>
                    <SelectItem value="correction">Correction</SelectItem>
                    <SelectItem value="opening_balance">Opening balance</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="delta">Quantity delta (signed)</Label>
                <Input
                  id="delta"
                  type="number"
                  step="0.01"
                  value={delta}
                  onChange={(e) => setDelta(Number(e.target.value))}
                  placeholder="e.g. -50 to remove, +25 to add"
                />
              </div>
            </div>

            {estValue !== undefined && (
              <p className="text-xs text-muted-foreground">
                Estimated value: <span className="tabular-nums">₹{estValue.toLocaleString('en-IN')}</span>
                <span className="ml-1">(approval threshold ₹10,000 — above this, manager approval required)</span>
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reason">Reason</Label>
              <Textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What happened?" />
            </div>

            {err && <p className="text-xs text-destructive">{err}</p>}

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={submit} disabled={busy}>
                {busy ? 'Saving…' : delta > 0 ? `Add ${Math.abs(delta)}` : `Remove ${Math.abs(delta)}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
