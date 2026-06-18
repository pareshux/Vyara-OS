'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CheckCircle2 } from 'lucide-react'
import { completeVisit, listVisitMasters } from '@/lib/actions/field-visits'

const NONE_VALUE = '__none__'

export function CompleteVisitButton({
  visitId,
  initialContactId,
}: {
  visitId: string
  initialContactId: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [purposes, setPurposes] = useState<Array<{ id: string; label: string }>>([])
  const [outcomes, setOutcomes] = useState<Array<{ id: string; label: string; requires_followup: boolean }>>([])
  const [purposeId, setPurposeId] = useState<string>(NONE_VALUE)
  const [outcomeId, setOutcomeId] = useState<string>(NONE_VALUE)
  const [notes, setNotes] = useState<string>('')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    listVisitMasters().then((r) => {
      if ('error' in r) return
      setPurposes(r.purposes)
      setOutcomes(r.outcomes)
    })
  }, [open])

  function submit() {
    setErr(null)
    startTransition(async () => {
      const r = await completeVisit(visitId, {
        visit_purpose_id: purposeId === NONE_VALUE ? null : purposeId,
        visit_outcome_id: outcomeId === NONE_VALUE ? null : outcomeId,
        contact_id: initialContactId,
        notes_text: notes.trim() || null,
      })
      if ('error' in r) { setErr(r.error); toast.error(r.error); return }
      toast.success('Visit completed'); setOpen(false); router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CheckCircle2 className="size-3.5 mr-1.5" /> Complete
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Complete visit</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Purpose</Label>
              <Select value={purposeId} onValueChange={setPurposeId}>
                <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>
                    <span className="italic text-muted-foreground">Not set</span>
                  </SelectItem>
                  {purposes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Outcome</Label>
              <Select value={outcomeId} onValueChange={setOutcomeId}>
                <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>
                    <span className="italic text-muted-foreground">Not set</span>
                  </SelectItem>
                  {outcomes.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes" className="text-xs">What happened?</Label>
            <Textarea
              id="notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Who you met, what they said, next steps…"
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground italic">
              Voice-first note input + AI structured-fill comes in Step 5.
            </p>
          </div>

          {err && <p className="text-xs text-destructive">{err}</p>}

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? 'Saving…' : 'Mark complete'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
