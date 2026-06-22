'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { recordVendorCreditNote } from '@/lib/actions/return-to-vendor'

export function RecordCreditNoteForm({ rtvId }: { rtvId: string }) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [no, setNo] = useState('')
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10))

  function submit() {
    if (!no.trim()) { toast.error('Credit note number required'); return }
    if (!date) { toast.error('Credit note date required'); return }
    startTransition(async () => {
      const res = await recordVendorCreditNote(rtvId, { credit_note_no: no.trim(), credit_note_date: date })
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Credit note recorded')
      router.refresh()
    })
  }

  return (
    <div className="grid md:grid-cols-3 gap-3 items-end">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Vendor credit note no.</Label>
        <Input value={no} onChange={(e) => setNo(e.target.value)} placeholder="CN-2026-001" className="font-mono" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Credit note date</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <Button onClick={submit} disabled={busy}>Record credit note</Button>
    </div>
  )
}
