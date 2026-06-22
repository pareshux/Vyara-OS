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
import { createVendor, updateVendor, type VendorType, type MsmeStatus } from '@/lib/actions/vendors'

const TYPES: { value: VendorType; label: string }[] = [
  { value: 'supplier',   label: 'Supplier' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'service',    label: 'Service provider' },
  { value: 'other',      label: 'Other' },
]

const MSME: { value: MsmeStatus; label: string }[] = [
  { value: 'not_msme', label: 'Not MSME' },
  { value: 'micro',    label: 'Micro' },
  { value: 'small',    label: 'Small' },
  { value: 'medium',   label: 'Medium' },
]

interface Props {
  mode: 'create' | 'edit'
  initial?: {
    id: string
    code: string
    name: string
    vendor_type: VendorType
    gstin: string
    pan?: string
    msme_status?: MsmeStatus | ''
    msme_udyam_no?: string
    bank_account_no?: string
    bank_ifsc?: string
    bank_name?: string
    payment_terms_days?: number
    address?: string
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
  const [pan, setPan] = useState(initial?.pan ?? '')
  const [msmeStatus, setMsmeStatus] = useState<MsmeStatus | ''>((initial?.msme_status as MsmeStatus | '' | undefined) ?? '')
  const [udyamNo, setUdyamNo] = useState(initial?.msme_udyam_no ?? '')
  const [bankAccount, setBankAccount] = useState(initial?.bank_account_no ?? '')
  const [bankIfsc, setBankIfsc] = useState(initial?.bank_ifsc ?? '')
  const [bankName, setBankName] = useState(initial?.bank_name ?? '')
  const [paymentTermsDays, setPaymentTermsDays] = useState<string>(
    initial?.payment_terms_days != null ? String(initial.payment_terms_days) : '30',
  )
  const [address, setAddress] = useState(initial?.address ?? '')
  const [contactName, setContactName] = useState(initial?.contact_name ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function reset() {
    if (mode === 'create') {
      setCode(''); setName(''); setVendorType('supplier'); setGstin('')
      setPan(''); setMsmeStatus(''); setUdyamNo('')
      setBankAccount(''); setBankIfsc(''); setBankName('')
      setPaymentTermsDays('30'); setAddress('')
      setContactName(''); setPhone(''); setEmail(''); setNotes('')
    }
    setErr(null)
  }

  function submit() {
    setErr(null)
    if (!code.trim() || !name.trim()) { setErr('Code and name are required'); return }
    const termsNum = paymentTermsDays ? Number(paymentTermsDays) : 30
    startTransition(async () => {
      const res = mode === 'create'
        ? await createVendor({
            code, name, vendor_type: vendorType,
            gstin: gstin.trim() || undefined,
            pan: pan.trim() || undefined,
            msme_status: (msmeStatus || undefined) as MsmeStatus | undefined,
            msme_udyam_no: udyamNo.trim() || undefined,
            bank_account_no: bankAccount.trim() || undefined,
            bank_ifsc: bankIfsc.trim() || undefined,
            bank_name: bankName.trim() || undefined,
            payment_terms_days: termsNum,
            address: address.trim() || undefined,
            contact_name: contactName.trim() || undefined,
            phone: phone.trim() || undefined,
            email: email.trim() || undefined,
            notes: notes.trim() || undefined,
          })
        : await updateVendor(initial!.id, {
            name,
            vendor_type: vendorType,
            gstin: gstin.trim() || null,
            pan: pan.trim() || null,
            msme_status: (msmeStatus || null) as MsmeStatus | null,
            msme_udyam_no: udyamNo.trim() || null,
            bank_account_no: bankAccount.trim() || null,
            bank_ifsc: bankIfsc.trim() || null,
            bank_name: bankName.trim() || null,
            payment_terms_days: termsNum,
            address: address.trim() || null,
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
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

            {/* ─── KYC: tax + statutory ─── */}
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80 mt-1">Tax + statutory</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gstin">GSTIN</Label>
                <Input id="gstin" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="24AAACA1234B1Z5" className="font-mono" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pan">PAN</Label>
                <Input id="pan" value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} placeholder="AAACA1234B" className="font-mono" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>MSME status</Label>
                <Select value={msmeStatus || '__none__'} onValueChange={(v) => setMsmeStatus(v === '__none__' ? '' : (v as MsmeStatus))}>
                  <SelectTrigger><SelectValue placeholder="Not declared" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Not declared</SelectItem>
                    {MSME.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="udyam">UDYAM no.</Label>
                <Input id="udyam" value={udyamNo} onChange={(e) => setUdyamNo(e.target.value.toUpperCase())} placeholder="UDYAM-GJ-XX-NNNNNN" className="font-mono" />
              </div>
            </div>

            {/* ─── Bank ─── */}
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80 mt-1">Bank</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bankAcc">Account number</Label>
                <Input id="bankAcc" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className="font-mono" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ifsc">IFSC</Label>
                <Input id="ifsc" value={bankIfsc} onChange={(e) => setBankIfsc(e.target.value.toUpperCase())} placeholder="HDFC0001234" className="font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bankName">Bank name</Label>
                <Input id="bankName" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="HDFC Bank — Surat" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="terms">Default payment terms (days)</Label>
                <Input id="terms" type="number" min="0" max="365" value={paymentTermsDays} onChange={(e) => setPaymentTermsDays(e.target.value)} />
              </div>
            </div>

            {/* ─── Contact ─── */}
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80 mt-1">Contact</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contact">Contact name</Label>
                <Input id="contact" value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+919XXXXXXXXX" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="address">Address</Label>
                <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="GIDC, Vapi, Gujarat" />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Capabilities, lead time, special pricing…" />
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
