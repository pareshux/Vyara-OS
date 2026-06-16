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
import { createWarehouse, WarehouseType } from '@/lib/actions/warehouses'

const NONE = '__none__'

export function WarehousesClient({ users }: { users: { id: string; full_name: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<WarehouseType>('own_plant')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [managerId, setManagerId] = useState<string>(NONE)
  const [notes, setNotes] = useState('')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function reset() {
    setCode(''); setName(''); setType('own_plant'); setCity(''); setAddress(''); setManagerId(NONE); setNotes(''); setErr(null)
  }

  function submit() {
    setErr(null)
    if (!code.trim() || !name.trim()) { setErr('Code and name are required'); return }
    startTransition(async () => {
      const res = await createWarehouse({
        code,
        name,
        type,
        city: city.trim() || undefined,
        address: address.trim() || undefined,
        manager_id: managerId !== NONE ? managerId : undefined,
        notes: notes.trim() || undefined,
      })
      if ('error' in res) { setErr(res.error); toast.error(res.error) }
      else {
        toast.success(`${name} added`)
        reset()
        setOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PlusCircle className="size-4 mr-1.5" />
        Add warehouse
      </Button>

      <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
        <SheetContent side="right" className="sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle>Add warehouse</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-auto px-4 py-2 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="SURAT-PLANT-2"
                  className="font-mono uppercase"
                />
              </div>
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
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Display name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Surat Plant 2" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Surat" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Manager</Label>
              <Select value={managerId} onValueChange={setManagerId}>
                <SelectTrigger><SelectValue placeholder="(none)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {err && <p className="text-xs text-destructive">{err}</p>}
          </div>

          <SheetFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{busy ? 'Adding…' : 'Add warehouse'}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}
