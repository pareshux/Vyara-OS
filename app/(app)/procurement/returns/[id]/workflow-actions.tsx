'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, Ban } from 'lucide-react'
import { postReturnToVendor, cancelReturnToVendor } from '@/lib/actions/return-to-vendor'

export function RtvWorkflowActions({ rtvId, status }: { rtvId: string; status: string }) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')

  function doPost() {
    startTransition(async () => {
      const res = await postReturnToVendor(rtvId)
      if (!res.ok) { toast.error(res.error); return }
      toast.success(`Posted — PO now ${res.po_status.replace(/_/g, ' ')}, stock reversed`)
      router.refresh()
    })
  }

  function doCancel() {
    if (!reason.trim()) { toast.error('Reason required'); return }
    startTransition(async () => {
      const res = await cancelReturnToVendor(rtvId, reason.trim())
      if (!res.ok) { toast.error(res.error); return }
      toast.success('RTV cancelled')
      setCancelOpen(false)
      router.refresh()
    })
  }

  if (status !== 'draft') return null

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={doPost} disabled={busy}>
        <CheckCircle2 className="size-4" /> Post return
      </Button>
      <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)} disabled={busy}>
        <Ban className="size-4" /> Cancel
      </Button>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this RTV?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Only draft RTVs can be cancelled. Once posted, reverse via a fresh GRN if needed.
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
