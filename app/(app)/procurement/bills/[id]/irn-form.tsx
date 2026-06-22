'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Save, FileCheck2 } from 'lucide-react'
import { updateBillIrn } from '@/lib/actions/gstr-2b'

export function IrnForm({ billId, existingIrn, existingValidatedAt }: {
  billId: string
  existingIrn: string | null
  existingValidatedAt: string | null
}) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [irn, setIrn] = useState(existingIrn ?? '')
  const [editing, setEditing] = useState(!existingIrn)

  function save() {
    if (!irn.trim()) { toast.error('IRN cannot be blank'); return }
    startTransition(async () => {
      const res = await updateBillIrn(billId, irn.trim())
      if (!res.ok) { toast.error(res.error); return }
      toast.success('IRN saved')
      setEditing(false)
      router.refresh()
    })
  }

  if (!editing && existingIrn) {
    return (
      <div className="flex items-center gap-2">
        <FileCheck2 className="size-3.5 text-emerald-600" />
        <span className="text-xs">IRN <span className="font-mono">{existingIrn}</span></span>
        {existingValidatedAt && (
          <span className="text-[10px] text-muted-foreground">recorded {new Date(existingValidatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
        )}
        <button type="button" onClick={() => setEditing(true)} className="text-[10px] text-primary hover:underline">edit</button>
      </div>
    )
  }

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1 flex flex-col gap-1">
        <Label className="text-xs">E-invoice IRN (64-char hex from vendor&apos;s invoice)</Label>
        <Input value={irn} onChange={(e) => setIrn(e.target.value)} className="font-mono text-xs" placeholder="e.g. a1b2c3d4e5f6..." />
      </div>
      <Button size="sm" onClick={save} disabled={busy}>
        <Save className="size-3.5" /> Save IRN
      </Button>
    </div>
  )
}
