/**
 * /procurement/orders/new — create a new purchase order.
 *
 * Server-fetches the picker data (vendors, warehouses, projects,
 * products) once, then hands it to the client form. Form is heavy
 * client-side because the line totals + GST split need to update
 * live as the user types.
 *
 * Supports ?from_pr=<id> for "Raise PO from this PR" — the lines
 * pre-fill from the PR (description / hsn / unit / qty / estimated
 * rate), and the action sets PR.linked_po_id + status=po_raised on
 * successful save.
 */
import Link from 'next/link'
import {
  listVendorsForPicker,
  listWarehousesForPicker,
  listProductsForPicker,
  listProjectsForPicker,
  getPrForPoPrefill,
  getRfqForPoPrefill,
} from '@/lib/actions/purchase-orders'
import { NewPurchaseOrderForm } from './form'
import { ChevronLeft } from 'lucide-react'

interface PageProps {
  searchParams: Promise<{ from_pr?: string; from_rfq?: string; vendor?: string }>
}

export default async function NewPurchaseOrderPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const [vendors, warehouses, products, projects, prPrefill, rfqPrefill] = await Promise.all([
    listVendorsForPicker(),
    listWarehousesForPicker(),
    listProductsForPicker(),
    listProjectsForPicker(),
    sp.from_pr ? getPrForPoPrefill(sp.from_pr) : Promise.resolve(null),
    sp.from_rfq && sp.vendor ? getRfqForPoPrefill(sp.from_rfq, sp.vendor) : Promise.resolve(null),
  ])

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/procurement/orders" className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> Purchase orders
        </Link>
      </div>

      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          New purchase order
          {prPrefill && <span className="ml-2 text-sm text-muted-foreground font-mono">· from {prPrefill.pr_number}</span>}
          {rfqPrefill && <span className="ml-2 text-sm text-muted-foreground font-mono">· from {rfqPrefill.rfq_number}</span>}
        </h1>
        <p className="text-sm text-muted-foreground">
          {prPrefill
            ? <>Lines pre-filled from the requisition. On save, the PR flips to <span className="font-mono">po_raised</span> with this PO linked back.</>
            : rfqPrefill
              ? <>Lines pre-filled from the CS — vendor selections + rates locked. On save, the RFQ flips to <span className="font-mono">po_raised</span>.</>
              : 'Saves as a draft. Submit for approval when ready.'}
        </p>
      </div>

      {vendors.length === 0 || warehouses.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
          {vendors.length === 0 && (
            <p>
              No active vendors. <Link href="/admin/vendors" className="text-primary hover:underline">Add a vendor →</Link>
            </p>
          )}
          {warehouses.length === 0 && (
            <p>
              No active warehouses. <Link href="/warehouses" className="text-primary hover:underline">Add a warehouse →</Link>
            </p>
          )}
        </div>
      ) : (
        <NewPurchaseOrderForm
          vendors={vendors}
          warehouses={warehouses}
          products={products}
          projects={projects}
          prPrefill={prPrefill}
          rfqPrefill={rfqPrefill}
        />
      )}
    </div>
  )
}
