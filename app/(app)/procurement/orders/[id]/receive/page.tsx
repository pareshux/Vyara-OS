/**
 * /procurement/orders/[id]/receive — create a Goods Receipt Note
 * against a specific PO.
 *
 * Server-rendered shell: validates the PO is in a receivable state
 * (approved/sent/partly_received) and hands the picker data + line
 * snapshot to the client form.
 */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getPoForReceive } from '@/lib/actions/goods-receipt-notes'
import { Card, CardContent } from '@/components/ui/card'
import { ReceiveForm } from './form'
import { ChevronLeft, AlertCircle } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ReceiveAgainstPoPage({ params }: PageProps) {
  const { id } = await params
  const po = await getPoForReceive(id)
  if (!po) notFound()

  const receivable = ['approved', 'sent', 'partly_received'].includes(po.status)
  if (!receivable) {
    // Shouldn't happen via the "Receive goods" CTA (it's gated), but
    // catch direct URL access.
    redirect(`/procurement/orders/${id}`)
  }

  const allFulfilled = po.lines.every((l) => l.qty_pending <= 0)

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href={`/procurement/orders/${id}`} className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> {po.po_number}
        </Link>
      </div>

      <div>
        <h1 className="text-lg font-semibold tracking-tight">Receive goods · {po.po_number}</h1>
        <p className="text-sm text-muted-foreground">
          From <span className="font-medium text-foreground">{po.vendor_name}</span> · into <span className="font-medium text-foreground">{po.warehouse_name}</span>.
          Posting writes stock for product-linked lines and advances the PO to <span className="font-mono">partly_received</span> or <span className="font-mono">received</span>.
        </p>
      </div>

      {allFulfilled ? (
        <Card>
          <CardContent className="flex items-start gap-2 text-sm">
            <AlertCircle className="size-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-foreground">All lines fulfilled</div>
              <div className="text-muted-foreground">
                Every line on this PO has been fully received. To receive over and above the ordered qty
                (vendor over-shipped), use a separate PO. RTV for posted GRNs lands in P1γ.
              </div>
              <div className="mt-2">
                <Link href={`/procurement/orders/${id}`} className="text-primary hover:underline text-sm">← Back to {po.po_number}</Link>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ReceiveForm po={po} />
      )}
    </div>
  )
}
