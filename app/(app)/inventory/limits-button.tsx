'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Settings2 } from 'lucide-react'
import { setStockLimits } from '@/lib/actions/stock'

interface Props {
  warehouseId: string
  productId: string
  skuCode: string
  productName: string
  unit: string
  currentMin: number | null
  currentMax: number | null
}

export function LimitsButton({ warehouseId, productId, skuCode, productName, unit, currentMin, currentMax }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [min, setMin] = useState<string>(currentMin != null ? String(currentMin) : '')
  const [max, setMax] = useState<string>(currentMax != null ? String(currentMax) : '')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function submit() {
    setErr(null)
    const minNum = min === '' ? null : Number(min)
    const maxNum = max === '' ? null : Number(max)
    if (minNum !== null && isNaN(minNum)) { setErr('Min must be a number'); return }
    if (maxNum !== null && isNaN(maxNum)) { setErr('Max must be a number'); return }
    if (minNum !== null && maxNum !== null && maxNum < minNum) { setErr('Max must be ≥ min'); return }
    startTransition(async () => {
      const res = await setStockLimits({
        warehouse_id: warehouseId,
        product_id: productId,
        min_level: minNum,
        max_level: maxNum,
      })
      if ('error' in res) { setErr(res.error); toast.error(res.error) }
      else { toast.success('Limits saved'); setOpen(false); router.refresh() }
    })
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} className="h-7 px-2" title="Set min / max levels">
        <Settings2 className="size-3 mr-1" /> Limits
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Stock limits — <span className="font-mono text-sm">{skuCode}</span></DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              {productName}. Min triggers the daily low-stock cron + creates a task; max is informational.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="min">Min level ({unit})</Label>
                <Input id="min" type="number" min={0} step="0.01" value={min} onChange={(e) => setMin(e.target.value)} placeholder="e.g. 500" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="max">Max level ({unit})</Label>
                <Input id="max" type="number" min={0} step="0.01" value={max} onChange={(e) => setMax(e.target.value)} placeholder="optional" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground italic">
              Leave a field blank to clear it.
            </p>
            {err && <p className="text-xs text-destructive">{err}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save limits'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
