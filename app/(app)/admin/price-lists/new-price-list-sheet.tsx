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
import { createPriceList, type Segment } from '@/lib/actions/price-lists'

const ANY = '__any__'

const SEGMENTS: { value: Exclude<Segment, null>; label: string }[] = [
  { value: 'architect', label: 'Architect' },
  { value: 'dealer', label: 'Dealer' },
  { value: 'tender', label: 'Tender' },
  { value: 'retail', label: 'Retail' },
  { value: 'government', label: 'Government' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'generic', label: 'Generic' },
]

export function NewPriceListSheet() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [segment, setSegment] = useState<string>(ANY)
  const [region, setRegion] = useState('')
  const [currency, setCurrency] = useState('INR')
  const today = new Date().toISOString().slice(0, 10)
  const [effectiveFrom, setEffectiveFrom] = useState(today)
  const [effectiveTo, setEffectiveTo] = useState('')
  const [makeDefault, setMakeDefault] = useState(false)
  const [notes, setNotes] = useState('')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function reset() {
    setCode(''); setLabel(''); setSegment(ANY); setRegion(''); setCurrency('INR')
    setEffectiveFrom(today); setEffectiveTo(''); setMakeDefault(false); setNotes('')
    setErr(null)
  }

  function submit() {
    setErr(null)
    if (!code.trim() || !label.trim()) { setErr('Code and label are required'); return }
    startTransition(async () => {
      const res = await createPriceList({
        code,
        label,
        segment: segment === ANY ? null : (segment as Segment),
        region: region.trim() || undefined,
        currency: currency.trim() || 'INR',
        effective_from: effectiveFrom,
        effective_to: effectiveTo || undefined,
        is_default: makeDefault,
        notes: notes.trim() || undefined,
      })
      if ('error' in res) { setErr(res.error); toast.error(res.error) }
      else {
        toast.success(`${label} created`)
        reset()
        setOpen(false)
        router.push(`/admin/price-lists/${res.id}`)
      }
    })
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PlusCircle className="size-4 mr-1.5" /> New price list
      </Button>
      <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
        <SheetContent side="right" className="sm:max-w-md flex flex-col">
          <SheetHeader><SheetTitle>New price list</SheetTitle></SheetHeader>
          <div className="flex-1 overflow-auto px-4 py-2 flex flex-col gap-3">
            <p className="text-xs text-muted-foreground italic">
              Add the header now. You&apos;ll add entries per product on the next page.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="code">Code</Label>
                <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="DEALER_2026" className="font-mono uppercase" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="currency">Currency</Label>
                <Input id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="font-mono uppercase" />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="label">Label</Label>
              <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Dealer pricing — 2026" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Segment</Label>
                <Select value={segment} onValueChange={setSegment}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>Any segment</SelectItem>
                    {SEGMENTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="region">Region</Label>
                <Input id="region" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="(optional)" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="from">Effective from</Label>
                <Input id="from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="to">Effective to</Label>
                <Input id="to" type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} placeholder="(open-ended)" />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
              <span>Make this the tenant default (will unset the current default)</span>
            </label>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {err && <p className="text-xs text-destructive">{err}</p>}
          </div>
          <SheetFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{busy ? 'Creating…' : 'Create'}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}
