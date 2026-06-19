'use client'

/**
 * DecideButtons — Approve / Reject pair used on every approval surface
 * (queue list, inline card). Captures an optional comment via a
 * lightweight dialog so the reason lands in the audit trail.
 */
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
  DialogFooter,
} from '@/components/ui/dialog'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { decideApproval } from '@/lib/actions/approvals'

export function DecideButtons({
  requestId,
  size = 'sm',
  onDecided,
}: {
  requestId: string
  size?: 'sm' | 'default'
  onDecided?: (status: 'approved' | 'rejected') => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState<null | 'approved' | 'rejected'>(null)
  const [comment, setComment] = useState('')
  const [busy, startTransition] = useTransition()

  function submit() {
    if (!open) return
    const action = open
    startTransition(async () => {
      const r = await decideApproval(requestId, action, comment.trim() || null)
      if (!r.ok) { toast.error(r.error); return }
      toast.success(action === 'approved' ? 'Approved' : 'Rejected')
      setOpen(null)
      setComment('')
      onDecided?.(action)
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size={size}
          variant="default"
          onClick={() => setOpen('approved')}
          disabled={busy}
        >
          <CheckCircle2 className="size-3.5 mr-1.5" />
          Approve
        </Button>
        <Button
          type="button"
          size={size}
          variant="outline"
          onClick={() => setOpen('rejected')}
          disabled={busy}
        >
          <XCircle className="size-3.5 mr-1.5" />
          Reject
        </Button>
      </div>

      <Dialog open={open !== null} onOpenChange={(v) => { if (!v) { setOpen(null); setComment('') } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {open === 'approved' ? 'Approve this request?' : 'Reject this request?'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="comment" className="text-xs">
              Comment {open === 'rejected' ? '(recommended)' : '(optional)'}
            </Label>
            <Textarea
              id="comment"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={open === 'rejected' ? 'Why is this being rejected?' : 'Any notes for the requester'}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={open === 'rejected' ? 'destructive' : 'default'}
              onClick={submit}
              disabled={busy}
            >
              {busy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
              {busy ? 'Saving…' : open === 'rejected' ? 'Reject' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
