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
import { updateDealer, setDealerActive } from '@/lib/actions/dealers'

const NONE = '__none__'

interface Props {
  dealerId: string
  initial: {
    tier_id: string | null
    territory_id: string | null
    credit_limit: number | null
    credit_period_days: number
    dormancy_threshold_days: number
    notes: string | null
    is_active: boolean
  }
  tiers: { id: string; label: string }[]
  territories: { id: string; label: string; level: number }[]
}

export function EditDealerButton({ dealerId, initial, tiers, territories }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tierId, setTierId] = useState<string>(initial.tier_id ?? NONE)
  const [territoryId, setTerritoryId] = useState<string>(initial.territory_id ?? NONE)
  const [creditLimit, setCreditLimit] = useState<number | ''>(initial.credit_limit ?? '')
  const [creditPeriodDays, setCreditPeriodDays] = useState<number>(initial.credit_period_days)
  const [dormancyDays, setDormancyDays] = useState<number>(initial.dormancy_threshold_days)
  const [notes, setNotes] = useState(initial.notes ?? '')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function submit() {
    setErr(null)
    startTransition(async () => {
      const res = await updateDealer(dealerId, {
        tier_id: tierId === NONE ? null : tierId,
        territory_id: territoryId === NONE ? null : territoryId,
        credit_limit: creditLimit === '' ? null : Number(creditLimit),
        credit_period_days: creditPeriodDays,
        dormancy_threshold_days: dormancyDays,
        notes: notes.trim() || null,
      })
      if ('error' in res) { setErr(res.error); toast.error(res.error) }
      else { toast.success('Dealer updated'); setOpen(false); router.refresh() }
    })
  }

  function toggleActive() {
    const next = !initial.is_active
    startTransition(async () => {
      const res = await setDealerActive(dealerId, next)
      if ('error' in res) toast.error(res.error)
      else { toast.success(next ? 'Dealer re-activated' : 'Dealer deactivated'); router.refresh() }
    })
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Pencil className="size-3.5 mr-1.5" /> Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={toggleActive} disabled={busy}>
          {initial.is_active ? 'Deactivate' : 'Re-activate'}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>Edit dealer</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground italic">
              Code, firm, and onboarded date are immutable. To change firm details, edit the firm in /contacts.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Tier</Label>
                <Select value={tierId} onValueChange={setTierId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {tiers.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Territory</Label>
                <Select value={territoryId} onValueChange={setTerritoryId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {territories.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {'  '.repeat(t.level)}{t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cl">Credit limit (₹)</Label>
                <Input
                  id="cl"
                  type="number"
                  min={0}
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cpd">Credit (days)</Label>
                <Input id="cpd" type="number" min={0} value={creditPeriodDays} onChange={(e) => setCreditPeriodDays(Number(e.target.value))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dtd">Dormancy (days)</Label>
                <Input id="dtd" type="number" min={1} value={dormancyDays} onChange={(e) => setDormancyDays(Number(e.target.value))} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {err && <p className="text-xs text-destructive">{err}</p>}

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
