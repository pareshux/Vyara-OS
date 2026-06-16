'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, ExternalLink, XCircle } from 'lucide-react'
import { advanceOrderStage } from '@/lib/actions/orders'

interface Props {
  orderId: string
  orderNumber: string
  isTerminal: boolean
  cancelStageId: string | null
}

export function OrderRowActions({ orderId, orderNumber, isTerminal, cancelStageId }: Props) {
  const router = useRouter()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, startTransition] = useTransition()

  function doCancel() {
    if (!cancelStageId) { toast.error('No cancel stage configured'); return }
    if (!reason.trim()) return
    startTransition(async () => {
      const res = await advanceOrderStage(orderId, cancelStageId, reason.trim())
      if ('error' in res) toast.error(res.error)
      else {
        toast.success(`${orderNumber} cancelled`)
        setCancelOpen(false)
        setReason('')
        router.refresh()
      }
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 px-2">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/orders/${orderId}`}>
              <ExternalLink className="size-3.5 mr-2" /> Open
            </Link>
          </DropdownMenuItem>
          {!isTerminal && cancelStageId && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setCancelOpen(true)} className="text-destructive focus:text-destructive">
                <XCircle className="size-3.5 mr-2" /> Cancel order
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel order {orderNumber}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              Cancellation moves the order to a terminal state and releases any active stock reservations back to available.
            </p>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for cancellation (required)" />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setCancelOpen(false)} disabled={busy}>Back</Button>
              <Button variant="destructive" onClick={doCancel} disabled={busy || !reason.trim()}>
                {busy ? 'Cancelling…' : 'Cancel order'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
