'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PlusCircle, Pencil } from 'lucide-react'
import { createVendor, updateVendor, type VendorType } from '@/lib/actions/vendors'

const TYPES: { value: VendorType; label: string }[] = [
  { value: 'supplier',   label: 'Supplier' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'service',    label: 'Service provider' },
  { value: 'other',      label: 'Other' },
]

interface Props {
  mode: 'create' | 'edit'
  initial?: {
    id: string
    code: string
    name: string
    vendor_type: VendorType
    gstin: string
    contact_name: string
    phone: string
    email: string
    notes: string
  }
}

export function VendorForm({ mode, initial }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [vendorType, setVendorType] = useState<VendorType>(initial?.vendor_type ?? 'supplier')
  const [gstin, setGstin] = useState(initial?.gstin ?? '')
  const [contactName, setContactName] = useState(initial?.contact_name ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function reset() {
    if (mode === 'create') {
      setCode(''); setName(''); setVendorType('supplier'); setGstin('')
      setContactName(''); setPhone(''); setEmail(''); setNotes('')
    }
    setErr(null)
  }

  function submit() {
    setErr(null)
    if (!code.trim() || !name.trim()) { setErr('Code and name are required'); return }
    startTransition(async () => {
      const res = mode === 'create'
        ? await createVendor({
            code, name, vendor_type: vendorType,
            gstin: gstin.trim() || undefined,
            contact_name: contactName.trim() || undefined,
            phone: phone.trim() || undefined,
            email: email.trim() || undefined,
            notes: notes.trim() || undefined,
          })
        : await updateVendor(initial!.id, {
            name,
            vendor_type: vendorType,
            gstin: gstin.trim() || null,
            contact_name: contactName.trim() || null,
            phone: phone.trim() || null,
            email: email.trim() || null,
            notes: notes.trim() || null,
          })
      if ('error' in res) { setErr(res.error); toast.error(res.error) }
      else {
        toast.success(mode === 'create' ? `${name} added` : `${name} updated`)
        setOpen(false); reset()
        router.refresh()
      }
    })
  }

  return (
    <>
      {mode === 'create' ? (
        <Button size="sm" onClick={() => setOpen(true)}>
          <PlusCircle className="size-4 mr-1.5" /> Add vendor
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)} className="h-7 px-2">
          <Pencil className="size-3 mr-1" /> Edit
        </Button>
      )}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{mode === 'create' ? 'Add vendor' : 'Edit vendor'}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="V-CEM-01"
                  className="font-mono uppercase"
                  disabled={mode === 'edit'}
                />
                {mode === 'edit' && <p className="text-[10px] text-muted-foreground italic">Code is immutable.</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Type</Label>
                <Select value={vendorType} onValueChange={(v) => setVendorType(v as VendorType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ambuja Cement (Surat depot)" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gstin">GSTIN</Label>
                <Input id="gstin" value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="24AAACA1234B1Z5" className="font-mono" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contact">Contact name</Label>
                <Input id="contact" value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+919XXXXXXXXX" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Capabilities, lead time, payment terms…" />
            </div>

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
