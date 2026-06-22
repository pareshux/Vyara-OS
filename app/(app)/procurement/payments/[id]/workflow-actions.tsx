'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, Ban } from 'lucide-react'
import { postVendorPayment, cancelVendorPayment } from '@/lib/actions/vendor-payments'

export function PaymentWorkflowActions({ paymentId, status }: { paymentId: string; status: string }) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')

  function doPost() {
    startTransition(async () => {
      const res = await postVendorPayment(paymentId)
      if (!res.ok) { toast.error(res.error); return }
      toast.success(`Posted · ${res.bills_affected} bill${res.bills_affected === 1 ? '' : 's'} updated`)
      router.refresh()
    })
  }

  function doCancel() {
    if (!reason.trim()) { toast.error('Reason required'); return }
    startTransition(async () => {
      const res = await cancelVendorPayment(paymentId, reason.trim())
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Payment cancelled')
      setCancelOpen(false)
      router.refresh()
    })
  }

  if (status !== 'draft') return null

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={doPost} disabled={busy}>
        <CheckCircle2 className="size-4" /> Post payment
      </Button>
      <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)} disabled={busy}>
        <Ban className="size-4" /> Cancel
      </Button>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this payment?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Only draft payments can be cancelled. To reverse a posted payment, record a reverse allocation (v2 follow-on).
          </p>
          <Textarea
            rows={3}
            placeholder="Reason for cancellation"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={busy}>Keep</Button>
            <Button variant="destructive" onClick={doCancel} disabled={busy}>Confirm cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
