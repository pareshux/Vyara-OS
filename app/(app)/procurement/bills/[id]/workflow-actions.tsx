'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, Ban } from 'lucide-react'
import { submitVendorBill, cancelVendorBill } from '@/lib/actions/vendor-bills'

interface Props {
  billId: string
  status: string
  matchStatus: string
}

export function BillWorkflowActions({ billId, status, matchStatus }: Props) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  function doSubmit() {
    // For mismatched bills, ask for explicit confirmation before submit
    if (matchStatus === 'mismatched') {
      setConfirmOpen(true)
      return
    }
    actuallySubmit()
  }

  function actuallySubmit() {
    setConfirmOpen(false)
    startTransition(async () => {
      const res = await submitVendorBill(billId)
      if (!res.ok) { toast.error(res.error); return }
      if (res.status === 'approved') toast.success('Auto-approved (under threshold)')
      else                            toast.success('Submitted for approval')
      router.refresh()
    })
  }

  function doCancel() {
    if (!reason.trim()) { toast.error('Reason required'); return }
    startTransition(async () => {
      const res = await cancelVendorBill(billId, reason.trim())
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Vendor bill cancelled')
      setCancelOpen(false)
      router.refresh()
    })
  }

  if (status !== 'draft') return null

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={doSubmit} disabled={busy}>
        <CheckCircle2 className="size-4" /> Submit for approval
      </Button>
      <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)} disabled={busy}>
        <Ban className="size-4" /> Cancel
      </Button>

      {/* Mismatch confirm */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit a mismatched bill?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The 3-way match flagged hard issues (over-billing, rate or GST drift) on one or more lines.
            The approver will see the diagnostics on the bill detail. Continue?
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>Review first</Button>
            <Button onClick={actuallySubmit} disabled={busy}>Submit anyway</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this vendor bill?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Only draft bills can be cancelled. For approved bills, raise an RTV + record the vendor&apos;s credit note instead.
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
