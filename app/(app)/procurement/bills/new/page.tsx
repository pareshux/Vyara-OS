/**
 * /procurement/bills/new — book a new vendor bill.
 *
 * Two paths:
 *   1. ?po=<id> — pre-bound to a PO. Lines are seeded from the PO's
 *      remaining billable qty/rate/HSN. This is the canonical
 *      3-way-match path (PO → GRN → bill).
 *   2. No po param — picker UI lets the user choose a PO with
 *      billable headroom. (Direct bills without a PO can be added
 *      later — for v1 every bill goes through a PO so the match
 *      engine has something to compare against.)
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPoForBilling, listPosForBilling } from '@/lib/actions/vendor-bills'
import { Card, CardContent } from '@/components/ui/card'
import { NewVendorBillForm } from './form'
import { ChevronLeft, AlertCircle, Receipt } from 'lucide-react'

interface PageProps {
  searchParams: Promise<{ po?: string }>
}

export default async function NewVendorBillPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const poId = sp.po

  if (!poId) {
    // Picker mode
    const eligible = await listPosForBilling()
    return (
      <div className="p-4 md:p-6 flex flex-col gap-5 max-w-4xl">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/procurement/bills" className="hover:text-foreground inline-flex items-center gap-0.5">
            <ChevronLeft className="size-3.5" /> Vendor bills
          </Link>
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">New vendor bill</h1>
          <p className="text-sm text-muted-foreground">Pick the PO this invoice is against.</p>
        </div>

        {eligible.length === 0 ? (
          <Card>
            <CardContent className="flex items-start gap-2 text-sm">
              <AlertCircle className="size-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-foreground">No POs with billable qty</div>
                <div className="text-muted-foreground">
                  Vendor bills are booked against POs that are <span className="font-mono">partly_received</span> or <span className="font-mono">received</span> with qty that hasn&apos;t been billed yet.
                  Receive goods first, then come back here.
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-1.5">
            {eligible.map((po) => (
              <Link
                key={po.id}
                href={`/procurement/bills/new?po=${po.id}`}
                className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 hover:bg-muted/30 transition-colors"
              >
                <Receipt className="size-4 text-muted-foreground shrink-0" />
                <span className="font-mono text-xs">{po.po_number}</span>
                <span className="text-sm flex-1">{po.vendor_name}</span>
                <span className="text-[11px] text-muted-foreground">{po.status.replace(/_/g, ' ')}</span>
                <span className="text-[11px] text-emerald-700 tabular-nums">{po.billable_qty_total} billable</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Pre-bound mode
  const po = await getPoForBilling(poId)
  if (!po) notFound()
  const anyBillable = po.lines.some((l) => l.qty_billable > 0)

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href={`/procurement/orders/${po.id}`} className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> {po.po_number}
        </Link>
      </div>

      <div>
        <h1 className="text-lg font-semibold tracking-tight">Book vendor bill · against {po.po_number}</h1>
        <p className="text-sm text-muted-foreground">
          From <span className="font-medium text-foreground">{po.vendor_name}</span>.
          Lines are pre-filled from the PO&apos;s billable headroom. The 3-way match runs automatically — over-billing,
          rate creep, or HSN drift gets flagged before submit.
        </p>
      </div>

      {!anyBillable ? (
        <Card>
          <CardContent className="flex items-start gap-2 text-sm">
            <AlertCircle className="size-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-foreground">No billable qty</div>
              <div className="text-muted-foreground">Every line on this PO has been fully billed already.</div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <NewVendorBillForm po={po} />
      )}
    </div>
  )
}
