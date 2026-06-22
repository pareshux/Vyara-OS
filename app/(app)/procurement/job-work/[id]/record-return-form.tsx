'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Save } from 'lucide-react'
import { recordJobWorkReturn } from '@/lib/actions/job-work'

export function RecordReturnForm({ id, qtyPending, unit }: { id: string; qtyPending: number; unit: string }) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [received, setReceived] = useState('')
  const [scrap, setScrap] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))

  function save() {
    const rcv = parseFloat(received)
    const scr = scrap ? parseFloat(scrap) : 0
    if (!(rcv >= 0)) { toast.error('Received qty must be a number'); return }
    if (rcv + scr > qtyPending + 0.001) { toast.error(`Received + scrap exceeds pending qty (${qtyPending} ${unit})`); return }
    if (rcv === 0 && scr === 0) { toast.error('Enter received or scrap qty'); return }
    startTransition(async () => {
      const res = await recordJobWorkReturn({
        id,
        qty_received_back: rcv,
        qty_scrap: scr,
        received_back_at: date,
      })
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Return recorded')
      setReceived(''); setScrap('')
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Qty received ({unit})</Label>
          <Input
            type="number"
            min={0}
            step="0.001"
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            className="mt-1 tabular-nums"
            placeholder={qtyPending.toString()}
          />
        </div>
        <div>
          <Label className="text-xs">Scrap ({unit})</Label>
          <Input
            type="number"
            min={0}
            step="0.001"
            value={scrap}
            onChange={(e) => setScrap(e.target.value)}
            className="mt-1 tabular-nums"
            placeholder="0"
          />
        </div>
        <div>
          <Label className="text-xs">Return date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">Pending: <span className="tabular-nums font-medium">{qtyPending.toLocaleString('en-IN')} {unit}</span></p>
        <Button size="sm" onClick={save} disabled={busy} className="gap-1.5"><Save className="size-3.5" /> Record return</Button>
      </div>
    </div>
  )
}
