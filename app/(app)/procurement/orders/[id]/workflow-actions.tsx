'use client'

/**
 * Workflow buttons on the PO detail header.
 *
 * Visibility rules (also enforced server-side):
 *   - draft            → [Submit for approval] [Cancel]
 *   - pending_approval → (Approve / Reject lives on the ApprovalCard) [Cancel]
 *   - approved         → [Send to vendor] [Cancel]
 *   - sent             → [Cancel] (until 'partly_received' lands in P1β,
 *                                  cancellation is still allowed)
 *   - partly_received  → no actions yet (Phase 1β)
 *   - received/cancelled/closed → nothing
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Send, CheckCircle2, Ban } from 'lucide-react'
import { submitPurchaseOrder, sendPurchaseOrder, cancelPurchaseOrder } from '@/lib/actions/purchase-orders'

interface Props {
  poId: string
  status: string
  hasApprovalRequest: boolean
}

export function POWorkflowActions({ poId, status }: Props) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  function doSubmit() {
    startTransition(async () => {
      const res = await submitPurchaseOrder(poId)
      if (!res.ok) { toast.error(res.error); return }
      if (res.status === 'approved') toast.success('Auto-approved (under threshold)')
      else                            toast.success('Submitted for approval')
      router.refresh()
    })
  }

  function doSend() {
    startTransition(async () => {
      const res = await sendPurchaseOrder(poId)
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Marked as sent to vendor')
      router.refresh()
    })
  }

  function doCancel() {
    if (!cancelReason.trim()) { toast.error('Reason is required'); return }
    startTransition(async () => {
      const res = await cancelPurchaseOrder(poId, cancelReason.trim())
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Purchase order cancelled')
      setCancelOpen(false)
      router.refresh()
    })
  }

  const canCancel = !['received', 'cancelled', 'closed'].includes(status)
  const canSubmit = status === 'draft'
  const canSend = status === 'approved'

  if (!canCancel && !canSubmit && !canSend) return null

  return (
    <div className="flex items-center gap-2">
      {canSubmit && (
        <Button size="sm" onClick={doSubmit} disabled={busy}>
          <CheckCircle2 className="size-4" /> Submit for approval
        </Button>
      )}
      {canSend && (
        <Button size="sm" onClick={doSend} disabled={busy}>
          <Send className="size-4" /> Send to vendor
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
            <DialogTitle>Cancel this purchase order?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Cancellation is recorded with a reason for the audit log. The PO can&apos;t be reopened
            after this — create a new one if needed.
          </p>
          <Textarea
            rows={3}
            placeholder="Reason for cancellation"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={busy}>Keep PO</Button>
            <Button variant="destructive" onClick={doCancel} disabled={busy}>
              Confirm cancellation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
