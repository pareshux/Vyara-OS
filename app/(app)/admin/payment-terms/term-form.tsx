'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PlusCircle, Pencil } from 'lucide-react'
import { createPaymentTerm, updatePaymentTerm } from '@/lib/actions/masters'

interface Props {
  mode: 'create' | 'edit'
  initial?: {
    id: string
    code: string
    label: string
    days: number
    sort_order: number
    description: string
    is_default: boolean
  }
}

export function PaymentTermForm({ mode, initial }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState(initial?.code ?? '')
  const [label, setLabel] = useState(initial?.label ?? '')
  const [days, setDays] = useState<number>(initial?.days ?? 30)
  const [sortOrder, setSortOrder] = useState<number>(initial?.sort_order ?? 0)
  const [description, setDescription] = useState(initial?.description ?? '')
  const [makeDefault, setMakeDefault] = useState<boolean>(initial?.is_default ?? false)
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function reset() {
    if (mode === 'create') {
      setCode(''); setLabel(''); setDays(30); setSortOrder(0); setDescription(''); setMakeDefault(false)
    }
    setErr(null)
  }

  function submit() {
    setErr(null)
    if (!code.trim() || !label.trim()) { setErr('Code and label are required'); return }
    startTransition(async () => {
      const res = mode === 'create'
        ? await createPaymentTerm({ code, label, days, sort_order: sortOrder, description, is_default: makeDefault })
        : await updatePaymentTerm(initial!.id, { label, days, sort_order: sortOrder, description: description.trim() || null })
      if ('error' in res) { setErr(res.error); toast.error(res.error) }
      else {
        toast.success(mode === 'create' ? `${label} added` : `${label} updated`)
        setOpen(false); reset()
        router.refresh()
      }
    })
  }

  return (
    <>
      {mode === 'create' ? (
        <Button size="sm" onClick={() => setOpen(true)}>
          <PlusCircle className="size-4 mr-1.5" /> Add term
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)} className="h-7 px-2">
          <Pencil className="size-3 mr-1" /> Edit
        </Button>
      )}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? 'Add payment term' : 'Edit payment term'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. NET_60"
                  className="font-mono uppercase"
                  disabled={mode === 'edit'}
                />
                {mode === 'edit' && <p className="text-[10px] text-muted-foreground italic">Code is immutable.</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="days">Days</Label>
                <Input id="days" type="number" min={0} value={days} onChange={(e) => setDays(Number(e.target.value))} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="label">Label</Label>
              <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Net 60" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sort">Sort order</Label>
              <Input id="sort" type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="When does this term apply?" />
            </div>
            {mode === 'create' && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
                <span>Make this the tenant default (will unset the current default)</span>
              </label>
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
