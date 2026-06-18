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
import { PlusCircle, Pencil } from 'lucide-react'
import { createVehicle, updateVehicle, setVehicleAssignment } from '@/lib/actions/vehicles'

const UNASSIGNED_VALUE = '__unassigned__'

interface Props {
  mode: 'create' | 'edit'
  vehicleTypes: { id: string; label: string }[]
  fuelTypes: { id: string; label: string }[]
  users: { id: string; label: string; role: string }[]
  initial?: {
    id: string
    vehicle_number: string
    vehicle_type_id: string
    fuel_type_id: string
    ownership: 'company' | 'personal'
    assigned_user_id: string | null
    custom_rate_per_km: number | null
    make_model: string
    notes: string
  }
  trigger?: React.ReactNode
}

export function VehicleForm({ mode, vehicleTypes, fuelTypes, users, initial, trigger }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [vehicleNumber, setVehicleNumber] = useState(initial?.vehicle_number ?? '')
  const [typeId, setTypeId] = useState(initial?.vehicle_type_id ?? '')
  const [fuelId, setFuelId] = useState(initial?.fuel_type_id ?? '')
  const [ownership, setOwnership] = useState<'company' | 'personal'>(initial?.ownership ?? 'personal')
  const [assigneeId, setAssigneeId] = useState<string>(initial?.assigned_user_id ?? UNASSIGNED_VALUE)
  const [customRate, setCustomRate] = useState<string>(
    initial?.custom_rate_per_km != null ? String(initial.custom_rate_per_km) : '',
  )
  const [makeModel, setMakeModel] = useState(initial?.make_model ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function reset() {
    if (mode === 'create') {
      setVehicleNumber('')
      setTypeId('')
      setFuelId('')
      setOwnership('personal')
      setAssigneeId(UNASSIGNED_VALUE)
      setCustomRate('')
      setMakeModel('')
      setNotes('')
    }
    setErr(null)
  }

  function submit() {
    setErr(null)
    if (!vehicleNumber.trim()) { setErr('Vehicle number is required'); return }
    if (!typeId || !fuelId) { setErr('Pick a vehicle type and fuel'); return }
    let customRateValue: number | null = null
    if (customRate.trim() !== '') {
      const n = Number(customRate)
      if (!Number.isFinite(n) || n < 0) { setErr('Custom rate must be ≥ 0'); return }
      customRateValue = n
    }
    const assigneeValue = assigneeId === UNASSIGNED_VALUE ? null : assigneeId

    startTransition(async () => {
      if (mode === 'create') {
        const r = await createVehicle({
          vehicle_number: vehicleNumber,
          vehicle_type_id: typeId,
          fuel_type_id: fuelId,
          ownership,
          assigned_user_id: assigneeValue,
          custom_rate_per_km: customRateValue,
          make_model: makeModel.trim() || null,
          notes: notes.trim() || null,
        })
        if ('error' in r) { setErr(r.error); toast.error(r.error); return }
        toast.success('Vehicle added'); setOpen(false); reset(); router.refresh()
      } else {
        const r = await updateVehicle(initial!.id, {
          vehicle_number: vehicleNumber,
          vehicle_type_id: typeId,
          fuel_type_id: fuelId,
          ownership,
          custom_rate_per_km: customRateValue,
          make_model: makeModel.trim() || null,
          notes: notes.trim() || null,
        })
        if ('error' in r) { setErr(r.error); toast.error(r.error); return }
        // Handle assignment change separately so the history row is written.
        if (assigneeValue !== (initial!.assigned_user_id ?? null)) {
          const a = await setVehicleAssignment({
            vehicle_id: initial!.id,
            user_id: assigneeValue,
            reason: 'Updated from vehicle edit dialog',
          })
          if ('error' in a) { setErr(a.error); toast.error(a.error); return }
        }
        toast.success('Vehicle updated'); setOpen(false); reset(); router.refresh()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        {trigger ?? (
          mode === 'create' ? (
            <Button size="sm">
              <PlusCircle className="size-4 mr-1.5" /> Add vehicle
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="h-7 px-2">
              <Pencil className="size-3 mr-1" /> Edit
            </Button>
          )
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add vehicle' : 'Edit vehicle'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="number">Vehicle number</Label>
            <Input
              id="number"
              value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value)}
              placeholder="GJ-05-AB-1234"
              className="font-mono uppercase"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Vehicle type</Label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                <SelectContent>
                  {vehicleTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Fuel</Label>
              <Select value={fuelId} onValueChange={setFuelId}>
                <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                <SelectContent>
                  {fuelTypes.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Ownership</Label>
              <Select value={ownership} onValueChange={(v) => setOwnership(v as 'company' | 'personal')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rate">Custom ₹/km</Label>
              <Input
                id="rate"
                type="number"
                step="0.01"
                min="0"
                value={customRate}
                onChange={(e) => setCustomRate(e.target.value)}
                placeholder="Optional — overrides matrix"
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Assigned to</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED_VALUE}>
                  <span className="italic text-muted-foreground">Unassigned</span>
                </SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.label} <span className="text-muted-foreground ml-1 text-[10px] uppercase">{u.role}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mode === 'edit' && assigneeId !== (initial!.assigned_user_id ?? UNASSIGNED_VALUE) && (
              <p className="text-[10px] text-muted-foreground italic">
                Saving will close the prior assignment and open a new one in the history log.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model">Make / model</Label>
            <Input
              id="model"
              value={makeModel}
              onChange={(e) => setMakeModel(e.target.value)}
              placeholder="Honda Activa 6G"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the manager should know" />
          </div>

          {err && <p className="text-xs text-destructive">{err}</p>}

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
