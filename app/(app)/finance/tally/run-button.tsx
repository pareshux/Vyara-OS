'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { runTallyReconciliation } from '@/lib/actions/tally'
import { RefreshCw } from 'lucide-react'

export function TallyRunButton() {
  const router = useRouter()
  const [busy, startTransition] = useTransition()

  function run() {
    startTransition(async () => {
      const r = await runTallyReconciliation()
      if ('error' in r) {
        toast.error(r.error)
      } else if (r.deferred) {
        toast.info('Run logged — Tally deferred (no creds)')
      } else {
        toast.success(`Reconciled · ${r.drift_detected} drift detected`)
      }
      router.refresh()
    })
  }

  return (
    <Button onClick={run} disabled={busy} size="sm">
      <RefreshCw className={`size-4 mr-1.5 ${busy ? 'animate-spin' : ''}`} />
      {busy ? 'Running…' : 'Run reconciliation'}
    </Button>
  )
}
