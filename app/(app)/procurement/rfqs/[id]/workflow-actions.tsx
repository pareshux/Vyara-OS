'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Send, Ban } from 'lucide-react'
import { sendRfq, cancelRfq } from '@/lib/actions/rfqs'

export function RfqWorkflowActions({ rfqId, status }: { rfqId: string; status: string }) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')

  function doSend() {
    startTransition(async () => {
      const res = await sendRfq(rfqId)
      if (!res.ok) { toast.error(res.error); return }
      toast.success('RFQ sent to invited vendors')
      router.refresh()
    })
  }

  function doCancel() {
    if (!reason.trim()) { toast.error('Reason required'); return }
    startTransition(async () => {
      const res = await cancelRfq(rfqId, reason.trim())
      if (!res.ok) { toast.error(res.error); return }
      toast.success('RFQ cancelled')
      setCancelOpen(false)
      router.refresh()
    })
  }

  const canSend = status === 'draft'
  const canCancel = !['cs_finalised', 'po_raised', 'cancelled'].includes(status)

  if (!canSend && !canCancel) return null

  return (
    <div className="flex items-center gap-2">
      {canSend && (
        <Button size="sm" onClick={doSend} disabled={busy}>
          <Send className="size-4" /> Send RFQ
        </Button>
      )}
      {canCancel && (
        <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)} disabled={busy}>
          <Ban className="size-4" /> Cancel
        </Button>
      )}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this RFQ?</DialogTitle>
          </DialogHeader>
          <Textarea rows={3} placeholder="Reason for cancellation" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={busy}>Keep</Button>
            <Button variant="destructive" onClick={doCancel} disabled={busy}>Confirm cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
