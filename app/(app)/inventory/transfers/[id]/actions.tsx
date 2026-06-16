'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { shipStockTransfer, completeStockTransfer, cancelStockTransfer } from '@/lib/actions/transfers'

export function TransferActions({ transferId, status }: { transferId: string; status: string }) {
  const router = useRouter()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, startTransition] = useTransition()

  function ship() {
    startTransition(async () => {
      const r = await shipStockTransfer(transferId)
      if ('error' in r) toast.error(r.error)
      else { toast.success('Shipped'); router.refresh() }
    })
  }
  function complete() {
    startTransition(async () => {
      const r = await completeStockTransfer(transferId)
      if ('error' in r) toast.error(r.error)
      else { toast.success('Received — stock updated at destination'); router.refresh() }
    })
  }
  function doCancel() {
    if (!reason.trim()) return
    startTransition(async () => {
      const r = await cancelStockTransfer(transferId, reason.trim())
      if ('error' in r) toast.error(r.error)
      else { toast.success('Cancelled'); setCancelOpen(false); setReason(''); router.refresh() }
    })
  }

  if (status === 'completed' || status === 'cancelled') {
    return <p className="text-xs text-muted-foreground italic">Transfer in terminal state.</p>
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {status === 'draft' && (
          <Button size="sm" onClick={ship} disabled={busy}>{busy ? 'Shipping…' : 'Ship — mark in transit'}</Button>
        )}
        {status === 'in_transit' && (
          <Button size="sm" onClick={complete} disabled={busy}>{busy ? 'Receiving…' : 'Receive — mark completed'}</Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setCancelOpen(true)} disabled={busy}>Cancel transfer</Button>
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel transfer</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              {status === 'in_transit'
                ? 'Stock will be restored to the source warehouse via a reversing movement (audit-trail preserved).'
                : 'No stock movement has occurred yet.'}
            </p>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for cancellation" />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setCancelOpen(false)} disabled={busy}>Back</Button>
              <Button variant="destructive" onClick={doCancel} disabled={busy || !reason.trim()}>
                {busy ? 'Cancelling…' : 'Cancel transfer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
