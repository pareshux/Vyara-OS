'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { PlusCircle, Pencil } from 'lucide-react'
import { createDealerTier, updateDealerTier } from '@/lib/actions/dealer-tiers'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

interface Props {
  mode: 'create' | 'edit'
  initial?: {
    id: string
    code: string
    label: string
    color: string
    bg_color: string
    sort_order: number
    notes: string
  }
}

export function DealerTierForm({ mode, initial }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState(initial?.code ?? '')
  const [label, setLabel] = useState(initial?.label ?? '')
  const [color, setColor] = useState(initial?.color ?? '#6B7280')
  const [bgColor, setBgColor] = useState(initial?.bg_color ?? '#F3F4F6')
  const [sortOrder, setSortOrder] = useState<number>(initial?.sort_order ?? 0)
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function reset() {
    if (mode === 'create') {
      setCode(''); setLabel(''); setColor('#6B7280'); setBgColor('#F3F4F6')
      setSortOrder(0); setNotes('')
    }
    setErr(null)
  }

  function submit() {
    setErr(null)
    if (!code.trim() || !label.trim()) { setErr('Code and label are required'); return }
    if (!HEX_RE.test(color) || !HEX_RE.test(bgColor)) { setErr('Colors must be 6-digit hex (e.g. #C2410C)'); return }
    startTransition(async () => {
      const res = mode === 'create'
        ? await createDealerTier({ code, label, color, bg_color: bgColor, sort_order: sortOrder, notes: notes.trim() || undefined })
        : await updateDealerTier(initial!.id, { label, color, bg_color: bgColor, sort_order: sortOrder, notes: notes.trim() || null })
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
          <PlusCircle className="size-4 mr-1.5" /> Add tier
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)} className="h-7 px-2">
          <Pencil className="size-3 mr-1" /> Edit
        </Button>
      )}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{mode === 'create' ? 'Add dealer tier' : 'Edit dealer tier'}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="GOLD"
                  className="font-mono uppercase"
                  disabled={mode === 'edit'}
                />
                {mode === 'edit' && <p className="text-[10px] text-muted-foreground italic">Code is immutable.</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="label">Label</Label>
                <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Gold" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="color">Text color</Label>
                <div className="flex gap-2 items-center">
                  <Input id="color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 p-1" />
                  <Input value={color} onChange={(e) => setColor(e.target.value)} className="font-mono" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bg">Background</Label>
                <div className="flex gap-2 items-center">
                  <Input id="bg" type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="h-9 w-12 p-1" />
                  <Input value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="font-mono" />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Preview</Label>
              <div>
                <Badge variant="outline" className="border-0 text-xs capitalize" style={{ backgroundColor: bgColor, color }}>
                  {label || 'Tier label'}
                </Badge>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sort">Sort order</Label>
              <Input id="sort" type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
              <p className="text-[10px] text-muted-foreground italic">Higher = more senior tier (Platinum &gt; Gold &gt; Silver…).</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="When does a dealer qualify for this tier?" />
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
