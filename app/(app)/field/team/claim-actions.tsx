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
import { CheckCircle2, XCircle } from 'lucide-react'
import { approveClaim, rejectClaim } from '@/lib/actions/field-attendance'

export function ApproveClaimButton({ attendanceId, repName }: { attendanceId: string; repName: string }) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()

  function approve() {
    startTransition(async () => {
      const r = await approveClaim(attendanceId)
      if ('error' in r) toast.error(r.error)
      else { toast.success(`Claim approved · ${repName}`); router.refresh() }
    })
  }

  return (
    <Button size="sm" onClick={approve} disabled={busy} className="h-8">
      <CheckCircle2 className="size-3.5 mr-1.5" /> {busy ? 'Approving…' : 'Approve'}
    </Button>
  )
}

export function RejectClaimButton({ attendanceId, repName }: { attendanceId: string; repName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function submit() {
    setErr(null)
    if (!reason.trim()) { setErr('Please give a reason'); return }
    startTransition(async () => {
      const r = await rejectClaim(attendanceId, reason)
      if ('error' in r) { setErr(r.error); toast.error(r.error); return }
      toast.success(`Claim rejected · ${repName}`)
      setOpen(false); router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8">
          <XCircle className="size-3.5 mr-1.5" /> Reject
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reject {repName}'s claim?</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            The rep sees this reason when they next open /field. They can re-submit after editing.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason" className="text-xs">Reason</Label>
            <Textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. odometer reading looks off; please verify"
              autoFocus
            />
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Back</Button>
            <Button variant="destructive" onClick={submit} disabled={busy}>
              {busy ? 'Sending…' : 'Send rejection'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
