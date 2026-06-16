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
import { updateWarehouse, deactivateWarehouse, type WarehouseType } from '@/lib/actions/warehouses'

const NONE = '__none__'

interface Props {
  warehouseId: string
  initial: {
    name: string
    type: WarehouseType
    city: string | null
    state: string | null
    address: string | null
    notes: string | null
    is_active: boolean
    manager_id: string | null
  }
  users: { id: string; full_name: string }[]
}

export function EditWarehouseButton({ warehouseId, initial, users }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(initial.name)
  const [type, setType] = useState<WarehouseType>(initial.type)
  const [city, setCity] = useState(initial.city ?? '')
  const [state, setState] = useState(initial.state ?? 'Gujarat')
  const [address, setAddress] = useState(initial.address ?? '')
  const [managerId, setManagerId] = useState<string>(initial.manager_id ?? NONE)
  const [notes, setNotes] = useState(initial.notes ?? '')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function submit() {
    setErr(null)
    if (!name.trim()) { setErr('Name is required'); return }
    startTransition(async () => {
      const res = await updateWarehouse(warehouseId, {
        name: name.trim(),
        type,
        city: city.trim(),
        state: state.trim() || 'Gujarat',
        address: address.trim(),
        manager_id: managerId === NONE ? null : managerId,
        notes: notes.trim(),
      })
      if ('error' in res) { setErr(res.error); toast.error(res.error) }
      else { toast.success('Warehouse updated'); setOpen(false); router.refresh() }
    })
  }

  function toggleActive() {
    const next = !initial.is_active
    startTransition(async () => {
      const res = next
        ? await updateWarehouse(warehouseId, { is_active: true })
        : await deactivateWarehouse(warehouseId)
      if ('error' in res) { toast.error(res.error) }
      else { toast.success(next ? 'Warehouse re-activated' : 'Warehouse deactivated'); router.refresh() }
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit warehouse</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground italic">
              Code is immutable (changing it would break stock ledger continuity). To rename a warehouse&apos;s identifier, create a new one and transfer stock.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Display name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as WarehouseType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="own_plant">Own plant</SelectItem>
                    <SelectItem value="samples">Samples</SelectItem>
                    <SelectItem value="transit">Transit</SelectItem>
                    <SelectItem value="dealer_consignment">Dealer consignment</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Manager</Label>
                <Select value={managerId} onValueChange={setManagerId}>
                  <SelectTrigger><SelectValue placeholder="(none)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {users.map((u) => (<SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="city">City</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="state">State</Label>
                <Input id="state" value={state} onChange={(e) => setState(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
