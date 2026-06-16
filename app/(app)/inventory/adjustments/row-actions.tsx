'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { approveAdjustment, rejectAdjustment } from '@/lib/actions/adjustments'
import { Check, X } from 'lucide-react'

export function AdjustmentRowActions({ adjustmentId }: { adjustmentId: string }) {
  const router = useRouter()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, startTransition] = useTransition()

  function doApprove() {
    startTransition(async () => {
      const r = await approveAdjustment(adjustmentId)
      if ('error' in r) toast.error(r.error)
      else { toast.success('Adjustment approved'); router.refresh() }
    })
  }
  function doReject() {
    if (!reason.trim()) return
    startTransition(async () => {
      const r = await rejectAdjustment(adjustmentId, reason.trim())
      if ('error' in r) toast.error(r.error)
      else { toast.success('Adjustment rejected'); setRejectOpen(false); setReason(''); router.refresh() }
    })
  }

  return (
    <>
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="outline" onClick={doApprove} disabled={busy} className="h-7 px-2">
          <Check className="size-3.5 mr-1" /> Approve
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRejectOpen(true)} disabled={busy} className="h-7 px-2 text-destructive hover:text-destructive">
          <X className="size-3.5 mr-1" /> Reject
        </Button>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject adjustment</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you rejecting this adjustment?"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setRejectOpen(false)} disabled={busy}>Cancel</Button>
              <Button variant="destructive" onClick={doReject} disabled={busy || !reason.trim()}>
                {busy ? 'Rejecting…' : 'Reject'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
