'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PlusCircle, Gauge } from 'lucide-react'
import { setReimbursementRate } from '@/lib/actions/vehicle-rates'

interface Props {
  mode: 'create' | 'update'
  vehicleTypes: { id: string; label: string }[]
  fuelTypes: { id: string; label: string }[]
  fixedVehicleTypeId?: string
  fixedFuelTypeId?: string
  fixedTypeLabel?: string
  fixedFuelLabel?: string
  initialRate?: number
  initialNotes?: string
  trigger?: React.ReactNode
}

export function RateForm({
  mode,
  vehicleTypes,
  fuelTypes,
  fixedVehicleTypeId,
  fixedFuelTypeId,
  fixedTypeLabel,
  fixedFuelLabel,
  initialRate,
  initialNotes,
  trigger,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [vehicleTypeId, setVehicleTypeId] = useState<string>(fixedVehicleTypeId ?? '')
  const [fuelTypeId, setFuelTypeId] = useState<string>(fixedFuelTypeId ?? '')
  const [rate, setRate] = useState<string>(initialRate != null ? String(initialRate) : '')
  const [effectiveFrom, setEffectiveFrom] = useState<string>(
    new Date().toISOString().slice(0, 10),
  )
  const [notes, setNotes] = useState<string>(initialNotes ?? '')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function reset() {
    if (mode === 'create') {
      setVehicleTypeId(fixedVehicleTypeId ?? '')
      setFuelTypeId(fixedFuelTypeId ?? '')
      setRate('')
      setNotes('')
    }
    setEffectiveFrom(new Date().toISOString().slice(0, 10))
    setErr(null)
  }

  function submit() {
    setErr(null)
    if (!vehicleTypeId || !fuelTypeId) {
      setErr('Pick a vehicle type and fuel'); return
    }
    const n = Number(rate)
    if (!Number.isFinite(n) || n < 0) { setErr('Enter a non-negative rate'); return }
    startTransition(async () => {
      const res = await setReimbursementRate({
        vehicle_type_id: vehicleTypeId,
        fuel_type_id: fuelTypeId,
        rate_per_km: n,
        effective_from: effectiveFrom,
        notes: notes.trim() || undefined,
      })
      if ('error' in res) { setErr(res.error); toast.error(res.error) }
      else {
        toast.success('Rate saved')
        setOpen(false); reset(); router.refresh()
      }
    })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="sm">
              <PlusCircle className="size-4 mr-1.5" /> Set rate
            </Button>
          )}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gauge className="size-4 text-muted-foreground" />
              {mode === 'create' ? 'Set reimbursement rate' : `Update rate · ${fixedTypeLabel} + ${fixedFuelLabel}`}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {!fixedVehicleTypeId && (
              <div className="flex flex-col gap-1.5">
                <Label>Vehicle type</Label>
                <Select value={vehicleTypeId} onValueChange={setVehicleTypeId}>
                  <SelectTrigger><SelectValue placeholder="Pick a type" /></SelectTrigger>
                  <SelectContent>
                    {vehicleTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!fixedFuelTypeId && (
              <div className="flex flex-col gap-1.5">
                <Label>Fuel</Label>
                <Select value={fuelTypeId} onValueChange={setFuelTypeId}>
                  <SelectTrigger><SelectValue placeholder="Pick a fuel" /></SelectTrigger>
                  <SelectContent>
                    {fuelTypes.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rate">Rate (₹/km)</Label>
                <Input
                  id="rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="8.50"
                  className="tabular-nums"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="from">Effective from</Label>
                <Input
                  id="from"
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional — why this rate, what it covers" />
            </div>

            {mode === 'update' && (
              <p className="text-[10px] text-muted-foreground italic">
                Saving will close the current rate at {new Date(new Date(effectiveFrom).getTime() - 86_400_000).toISOString().slice(0, 10)} and start the new one at {effectiveFrom}.
              </p>
            )}

            {err && <p className="text-xs text-destructive">{err}</p>}

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
