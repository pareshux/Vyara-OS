'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { advanceOrderStage } from '@/lib/actions/orders'
import { ArrowRight } from 'lucide-react'

interface Stage {
  id: string
  stage_key: string
  label: string
  color: string
  order_index: number
  is_terminal: boolean
}

interface Props {
  orderId: string
  currentStageId: string
  stages: Stage[]
}

export function OrderStageActions({ orderId, currentStageId, stages }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [targetStage, setTargetStage] = useState<Stage | null>(null)
  const [remark, setRemark] = useState('')
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const current = stages.find((s) => s.id === currentStageId)
  const sorted = [...stages].sort((a, b) => a.order_index - b.order_index)
  const idx = sorted.findIndex((s) => s.id === currentStageId)
  const next = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null
  const cancelStage = sorted.find((s) => s.stage_key === 'cancelled')

  function openDialog(stage: Stage) {
    setTargetStage(stage)
    setRemark('')
    setErr(null)
    setOpen(true)
  }

  function handleConfirm() {
    if (!targetStage) return
    setErr(null)
    startTransition(async () => {
      const result = await advanceOrderStage(orderId, targetStage.id, remark.trim() || undefined)
      if ('error' in result) {
        setErr(result.error)
      } else {
        setOpen(false)
        router.refresh()
      }
    })
  }

  if (!current) return null
  if (current.is_terminal) {
    return (
      <p className="text-xs text-muted-foreground italic">
        This order is in a terminal state ({current.label}). No further stage transitions.
      </p>
    )
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {next && (
          <Button size="sm" onClick={() => openDialog(next)}>
            Advance to {next.label}
            <ArrowRight className="size-3.5 ml-1" />
          </Button>
        )}
        {cancelStage && cancelStage.id !== currentStageId && (
          <Button size="sm" variant="outline" onClick={() => openDialog(cancelStage)}>
            Cancel order
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Move to {targetStage?.label}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Add a short remark (optional unless you&apos;re cancelling).
            </p>
            <Textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="What changed?"
              rows={3}
            />
            {err && <p className="text-xs text-destructive">{err}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
              <Button onClick={handleConfirm} disabled={isPending}>
                {isPending ? 'Updating…' : 'Confirm'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
