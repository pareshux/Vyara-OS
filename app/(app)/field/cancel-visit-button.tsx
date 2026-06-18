'use client'

import { useState, useTransition } from 'react'
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
import { XCircle } from 'lucide-react'
import { cancelVisit } from '@/lib/actions/field-visits'

export function CancelVisitButton({ visitId }: { visitId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function submit() {
    setErr(null)
    if (!reason.trim()) { setErr('Tell us why'); return }
    startTransition(async () => {
      const r = await cancelVisit(visitId, reason)
      if ('error' in r) { setErr(r.error); toast.error(r.error); return }
      toast.success('Visit cancelled'); setOpen(false); router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <XCircle className="size-3.5 mr-1.5" /> Cancel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancel this visit?</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            The visit will be removed from today's list. The reason stays on the audit log.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason" className="text-xs">Reason</Label>
            <Textarea
              id="reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. they cancelled at the gate"
              autoFocus
            />
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Back</Button>
            <Button variant="destructive" onClick={submit} disabled={busy}>
              {busy ? 'Cancelling…' : 'Cancel visit'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
