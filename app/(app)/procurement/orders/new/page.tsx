/**
 * /procurement/orders/new — create a new purchase order.
 *
 * Server-fetches the picker data (vendors, warehouses, projects,
 * products) once, then hands it to the client form. Form is heavy
 * client-side because the line totals + GST split need to update
 * live as the user types.
 */
import Link from 'next/link'
import {
  listVendorsForPicker,
  listWarehousesForPicker,
  listProductsForPicker,
  listProjectsForPicker,
} from '@/lib/actions/purchase-orders'
import { NewPurchaseOrderForm } from './form'
import { ChevronLeft } from 'lucide-react'

export default async function NewPurchaseOrderPage() {
  const [vendors, warehouses, products, projects] = await Promise.all([
    listVendorsForPicker(),
    listWarehousesForPicker(),
    listProductsForPicker(),
    listProjectsForPicker(),
  ])

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/procurement/orders" className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> Purchase orders
        </Link>
      </div>

      <div>
        <h1 className="text-lg font-semibold tracking-tight">New purchase order</h1>
        <p className="text-sm text-muted-foreground">
          Saves as a draft. Submit for approval when ready.
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
        />
      )}
    </div>
  )
}
