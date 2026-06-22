'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { CheckCircle2, Ban, RotateCcw } from 'lucide-react'
import { postVendorPayment, cancelVendorPayment, reverseVendorPayment } from '@/lib/actions/vendor-payments'

const REVERSAL_REASONS = [
  { value: 'cheque_bounce',        label: 'Cheque bounced' },
  { value: 'neft_failed',          label: 'NEFT/RTGS failed' },
  { value: 'vendor_refund',        label: 'Vendor refunded amount' },
  { value: 'accounting_correction', label: 'Accounting correction' },
  { value: 'other',                label: 'Other (specify)' },
]

export function PaymentWorkflowActions({ paymentId, status }: { paymentId: string; status: string }) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reverseOpen, setReverseOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [reversalCategory, setReversalCategory] = useState<string>('cheque_bounce')
  const [reversalNote, setReversalNote] = useState('')

  function doPost() {
    startTransition(async () => {
      const res = await postVendorPayment(paymentId)
      if (!res.ok) { toast.error(res.error); return }
      toast.success(`Posted · ${res.bills_affected} bill${res.bills_affected === 1 ? '' : 's'} updated`)
      router.refresh()
    })
  }

  function doCancel() {
    if (!cancelReason.trim()) { toast.error('Reason required'); return }
    startTransition(async () => {
      const res = await cancelVendorPayment(paymentId, cancelReason.trim())
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Payment cancelled')
      setCancelOpen(false)
      router.refresh()
    })
  }

  function doReverse() {
    const label = REVERSAL_REASONS.find((r) => r.value === reversalCategory)?.label ?? reversalCategory
    const fullReason = reversalNote.trim() ? `${label} — ${reversalNote.trim()}` : label
    startTransition(async () => {
      const res = await reverseVendorPayment(paymentId, fullReason)
      if (!res.ok) { toast.error(res.error); return }
      toast.success(`Reversed · ${res.bills_affected} bill${res.bills_affected === 1 ? '' : 's'} restored`)
      setReverseOpen(false)
      router.refresh()
    })
  }

  if (status === 'draft') {
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
              Only draft payments can be cancelled. To reverse a posted payment, use the Reverse flow on the posted payment.
            </p>
            <Textarea
              rows={3}
              placeholder="Reason for cancellation"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
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

  if (status === 'posted') {
    return (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setReverseOpen(true)} disabled={busy}>
          <RotateCcw className="size-4" /> Reverse payment
        </Button>

        <Dialog open={reverseOpen} onOpenChange={setReverseOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reverse this posted payment?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Reversal undoes the bill-side effects: bill amount_paid decreases by each allocation, status flips back to
              <span className="font-mono"> approved</span> or <span className="font-mono">partly_paid</span> based on remaining payments.
              The voucher stays on file with a <span className="font-mono">reversed</span> status for audit.
            </p>
            <div className="flex flex-col gap-2">
              <Label className="text-xs">Reason</Label>
              <Select value={reversalCategory} onValueChange={setReversalCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REVERSAL_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Label className="text-xs mt-2">Additional notes (optional)</Label>
              <Textarea
                rows={2}
                placeholder="e.g. Cheque CHQ-12345 bounced — bank statement attached"
                value={reversalNote}
                onChange={(e) => setReversalNote(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setReverseOpen(false)} disabled={busy}>Keep posted</Button>
              <Button variant="destructive" onClick={doReverse} disabled={busy}>Confirm reverse</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return null
}
