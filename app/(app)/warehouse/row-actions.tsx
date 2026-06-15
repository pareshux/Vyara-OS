'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { advanceDispatchStage } from '@/lib/actions/dispatches'
import { Truck, CheckCircle2, Upload } from 'lucide-react'

export function WarehouseRowActions({
  dispatchId,
  stageKey,
}: {
  dispatchId: string
  stageKey: 'scheduled' | 'in_transit' | 'delivered'
}) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()

  function move(stage: 'in_transit' | 'delivered') {
    startTransition(async () => {
      const res = await advanceDispatchStage(dispatchId, stage)
      if ('error' in res) toast.error(res.error)
      else {
        toast.success(`Marked ${stage.replace('_', ' ')}`)
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:gap-2 shrink-0">
      {stageKey === 'scheduled' && (
        <Button size="default" onClick={() => move('in_transit')} disabled={busy} className="h-12 min-w-[140px]">
          <Truck className="size-4 mr-1.5" />
          {busy ? 'Updating…' : 'Mark dispatched'}
        </Button>
      )}
      {stageKey === 'in_transit' && (
        <Button size="default" onClick={() => move('delivered')} disabled={busy} className="h-12 min-w-[140px]">
          <CheckCircle2 className="size-4 mr-1.5" />
          {busy ? 'Updating…' : 'Mark delivered'}
        </Button>
      )}
      {stageKey === 'delivered' && (
        <Button size="default" variant="default" asChild className="h-12 min-w-[140px]">
          <Link href={`/dispatches/${dispatchId}`}>
            <Upload className="size-4 mr-1.5" />
            Upload POD
          </Link>
        </Button>
      )}
      <Button size="default" variant="outline" asChild className="h-12">
        <Link href={`/dispatches/${dispatchId}`}>Open</Link>
      </Button>
    </div>
  )
}
