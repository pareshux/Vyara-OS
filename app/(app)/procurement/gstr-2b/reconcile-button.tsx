'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { RotateCw } from 'lucide-react'
import { runReconciliation } from '@/lib/actions/gstr-2b'

export function Gstr2bReconcileButton({ period }: { period: string }) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()

  function go() {
    startTransition(async () => {
      const res = await runReconciliation(period)
      if (!res.ok) { toast.error(res.error); return }
      toast.success(`Re-reconciled · ${res.matched} matched · ${res.updated_bills} bills updated`)
      router.refresh()
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={go} disabled={busy}>
      <RotateCw className="size-4" /> Re-reconcile
    </Button>
  )
}
