'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PlusCircle, Pencil } from 'lucide-react'
import { createFuelType, updateFuelType } from '@/lib/actions/fuel-types'

interface Props {
  mode: 'create' | 'edit'
  initial?: { id: string; code: string; label: string; sort_order: number }
}

export function FuelTypeForm({ mode, initial }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState(initial?.code ?? '')
  const [label, setLabel] = useState(initial?.label ?? '')
  const [sortOrder, setSortOrder] = useState<number>(initial?.sort_order ?? 0)
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function reset() {
    if (mode === 'create') { setCode(''); setLabel(''); setSortOrder(0) }
    setErr(null)
  }

  function submit() {
    setErr(null)
    if (!code.trim() || !label.trim()) { setErr('Code and label are required'); return }
    startTransition(async () => {
      const res = mode === 'create'
        ? await createFuelType({ code, label, sort_order: sortOrder })
        : await updateFuelType(initial!.id, { label, sort_order: sortOrder })
      if ('error' in res) { setErr(res.error); toast.error(res.error) }
      else {
        toast.success(mode === 'create' ? `${label} added` : `${label} updated`)
        setOpen(false); reset(); router.refresh()
      }
    })
  }

  return (
    <>
      {mode === 'create' ? (
        <Button size="sm" onClick={() => setOpen(true)}>
          <PlusCircle className="size-4 mr-1.5" /> Add fuel
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)} className="h-7 px-2">
          <Pencil className="size-3 mr-1" /> Edit
        </Button>
      )}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{mode === 'create' ? 'Add fuel type' : 'Edit fuel type'}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="DIESEL"
                  className="font-mono uppercase"
                  disabled={mode === 'edit'}
                />
                {mode === 'edit' && <p className="text-[10px] text-muted-foreground italic">Code is immutable.</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="label">Label</Label>
                <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Diesel" />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sort">Sort order</Label>
              <Input id="sort" type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
              <p className="text-[10px] text-muted-foreground italic">Lower numbers appear first in dropdowns.</p>
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
