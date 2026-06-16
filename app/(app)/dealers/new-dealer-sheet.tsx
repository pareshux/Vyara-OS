'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PlusCircle } from 'lucide-react'
import { createDealerFromFirm } from '@/lib/actions/dealers'

const NONE = '__none__'

interface Props {
  eligibleFirms: { id: string; name: string; type: string; city: string | null }[]
  tiers: { id: string; label: string }[]
  territories: { id: string; label: string; level: number }[]
}

export function NewDealerSheet({ eligibleFirms, tiers, territories }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [firmId, setFirmId] = useState<string>('')
  const [tierId, setTierId] = useState<string>(NONE)
  const [territoryId, setTerritoryId] = useState<string>(NONE)
  const [creditLimit, setCreditLimit] = useState<number | ''>('')
  const [creditPeriodDays, setCreditPeriodDays] = useState<number>(30)
  const [dormancyDays, setDormancyDays] = useState<number>(90)
  const [notes, setNotes] = useState('')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function reset() {
    setFirmId(''); setTierId(NONE); setTerritoryId(NONE); setCreditLimit('')
    setCreditPeriodDays(30); setDormancyDays(90); setNotes(''); setErr(null)
  }

  function submit() {
    setErr(null)
    if (!firmId) { setErr('Pick a firm to convert into a dealer'); return }
    startTransition(async () => {
      const res = await createDealerFromFirm({
        firm_id: firmId,
        tier_id: tierId === NONE ? null : tierId,
        territory_id: territoryId === NONE ? null : territoryId,
        credit_limit: creditLimit === '' ? undefined : Number(creditLimit),
        credit_period_days: creditPeriodDays,
        dormancy_threshold_days: dormancyDays,
        notes: notes.trim() || undefined,
      })
      if ('error' in res) { setErr(res.error); toast.error(res.error) }
      else {
        toast.success(`Dealer ${res.dealer_code} created`)
        reset()
        setOpen(false)
        router.push(`/dealers/${res.id}`)
      }
    })
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PlusCircle className="size-4 mr-1.5" />
        New dealer
      </Button>

      <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
        <SheetContent side="right" className="sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle>New dealer</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-auto px-4 py-2 flex flex-col gap-3">
            <p className="text-xs text-muted-foreground italic">
              Converts an existing firm into a dealer. If the firm doesn&apos;t exist yet, create it via <a href="/contacts" className="text-primary hover:underline">/contacts</a> first.
            </p>

            <div className="flex flex-col gap-1.5">
              <Label>Firm *</Label>
              <Select value={firmId} onValueChange={setFirmId}>
                <SelectTrigger>
                  <SelectValue placeholder={eligibleFirms.length === 0 ? '(no eligible firms — all already dealers)' : 'Pick a firm'} />
                </SelectTrigger>
                <SelectContent>
                  {eligibleFirms.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name} <span className="text-xs text-muted-foreground ml-1">· {f.type}{f.city ? ` · ${f.city}` : ''}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
                {tiers.length === 0 && (
                  <p className="text-[10px] text-muted-foreground italic">Add tiers in <a href="/admin/dealer-tiers" className="text-primary hover:underline">Settings</a>.</p>
                )}
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
                {territories.length === 0 && (
                  <p className="text-[10px] text-muted-foreground italic">Add territories in <a href="/admin/territories" className="text-primary hover:underline">Settings</a>.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cl">Credit limit (₹)</Label>
                <Input
                  id="cl"
                  type="number"
                  min={0}
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 500000"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cpd">Credit period (days)</Label>
                <Input
                  id="cpd"
                  type="number"
                  min={0}
                  value={creditPeriodDays}
                  onChange={(e) => setCreditPeriodDays(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dtd">Dormancy threshold (days)</Label>
              <Input
                id="dtd"
                type="number"
                min={1}
                value={dormancyDays}
                onChange={(e) => setDormancyDays(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">Dealer is flagged as dormant if no orders in this many days.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {err && <p className="text-xs text-destructive">{err}</p>}
          </div>

          <SheetFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy || !firmId}>
              {busy ? 'Creating…' : 'Create dealer'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}
