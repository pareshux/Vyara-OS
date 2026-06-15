'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { updateInvoiceStatus } from '@/lib/actions/invoices'

export function InvoiceActions({ invoiceId, status }: { invoiceId: string; status: string }) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()

  function fire(s: 'sent' | 'paid' | 'cancelled' | 'written_off') {
    startTransition(async () => {
      const res = await updateInvoiceStatus(invoiceId, s)
      if ('error' in res) toast.error(res.error)
      else {
        toast.success(`Invoice marked ${s.replace('_', ' ')}`)
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'draft' && (
        <Button size="sm" onClick={() => fire('sent')} disabled={busy}>Mark as sent</Button>
      )}
      {(status === 'sent' || status === 'partial_paid') && (
        <Button size="sm" variant="outline" onClick={() => fire('paid')} disabled={busy}>Mark fully paid</Button>
      )}
      {status !== 'cancelled' && status !== 'written_off' && status !== 'paid' && (
        <Button size="sm" variant="ghost" onClick={() => fire('cancelled')} disabled={busy}>Cancel</Button>
      )}
      {status !== 'written_off' && status !== 'paid' && (
        <Button size="sm" variant="ghost" onClick={() => fire('written_off')} disabled={busy}>Write off</Button>
      )}
    </div>
  )
}
