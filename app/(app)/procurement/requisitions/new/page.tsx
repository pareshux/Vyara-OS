/**
 * /procurement/requisitions/new — raise a new PR.
 */
import Link from 'next/link'
import {
  listProjectsForPrPicker,
  listProductsForPrPicker,
  listVendorsForPrPicker,
} from '@/lib/actions/purchase-requisitions'
import { NewPrForm } from './form'
import { ChevronLeft } from 'lucide-react'

export default async function NewPurchaseRequisitionPage() {
  const [projects, products, vendors] = await Promise.all([
    listProjectsForPrPicker(),
    listProductsForPrPicker(),
    listVendorsForPrPicker(),
  ])

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/procurement/requisitions" className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> Requisitions
        </Link>
      </div>

      <div>
        <h1 className="text-lg font-semibold tracking-tight">New purchase requisition</h1>
        <p className="text-sm text-muted-foreground">
          Capture what&apos;s needed, for which project, and by when. Approval routes by estimated value.
          A PO can be raised from an approved PR (P4β).
        </p>
      </div>

      <NewPrForm projects={projects} products={products} vendors={vendors} />
    </div>
  )
}
