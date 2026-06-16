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
import { createTerritory, updateTerritory } from '@/lib/actions/territories'

const ROOT = '__root__'

interface Props {
  mode: 'create' | 'edit'
  initial?: {
    id: string
    label: string
    sort_order: number
    notes: string
  }
  parentOptions?: { id: string; label: string; level: number }[]
}

export function TerritoryForm({ mode, initial, parentOptions }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [label, setLabel] = useState(initial?.label ?? '')
  const [parentId, setParentId] = useState<string>(ROOT)
  const [sortOrder, setSortOrder] = useState<number>(initial?.sort_order ?? 0)
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function reset() {
    if (mode === 'create') {
      setCode(''); setLabel(''); setParentId(ROOT); setSortOrder(0); setNotes('')
    }
    setErr(null)
  }

  function submit() {
    setErr(null)
    if (mode === 'create' && !code.trim()) { setErr('Code is required'); return }
    if (!label.trim()) { setErr('Label is required'); return }
    startTransition(async () => {
      const res = mode === 'create'
        ? await createTerritory({
            code, label,
            parent_id: parentId === ROOT ? null : parentId,
            sort_order: sortOrder,
            notes: notes.trim() || undefined,
          })
        : await updateTerritory(initial!.id, { label, sort_order: sortOrder, notes: notes.trim() || null })
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
          <PlusCircle className="size-4 mr-1.5" /> Add territory
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)} className="h-7 px-2">
          <Pencil className="size-3 mr-1" /> Edit
        </Button>
      )}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{mode === 'create' ? 'Add territory' : 'Edit territory'}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            {mode === 'create' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="code">Code</Label>
                  <Input
                    id="code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="SUR-N"
                    className="font-mono uppercase"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="label">Label</Label>
                  <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Surat North" />
                </div>
              </div>
            )}
            {mode === 'edit' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="label">Label</Label>
                <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} />
                <p className="text-[10px] text-muted-foreground italic">Code + parent are immutable in this step.</p>
              </div>
            )}

            {mode === 'create' && (
              <div className="flex flex-col gap-1.5">
                <Label>Parent</Label>
                <Select value={parentId} onValueChange={setParentId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ROOT}>None (root)</SelectItem>
                    {(parentOptions ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {'  '.repeat(p.level)}{p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sort">Sort order</Label>
              <Input id="sort" type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
