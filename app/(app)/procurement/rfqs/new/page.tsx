/**
 * /procurement/rfqs/new — new RFQ.
 *
 * Two paths:
 *   1. Pick source PR(s) — multi-PR consolidation; lines auto-fill
 *   2. Start blank — describe lines manually
 */
import Link from 'next/link'
import {
  listApprovedPrsForRfq,
  getPrLinesForRfq,
} from '@/lib/actions/rfqs'
import { listVendorsForPicker, listProjectsForPicker } from '@/lib/actions/purchase-orders'
import { NewRfqForm } from './form'
import { ChevronLeft } from 'lucide-react'

interface PageProps {
  searchParams: Promise<{ pr?: string }>  // ?pr=id1,id2 for multi-PR
}

export default async function NewRfqPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const prIds = (sp.pr ?? '').split(',').filter(Boolean)

  const [approvedPrs, vendors, projects, prefilledLines] = await Promise.all([
    listApprovedPrsForRfq(),
    listVendorsForPicker(),
    listProjectsForPicker(),
    prIds.length > 0 ? getPrLinesForRfq(prIds) : Promise.resolve([]),
  ])

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/procurement/rfqs" className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> RFQs
        </Link>
      </div>

      <div>
        <h1 className="text-lg font-semibold tracking-tight">New RFQ</h1>
        <p className="text-sm text-muted-foreground">
          Send a requirement to 2-5 vendors, collect quotes, pick L1 (or justify the override).
          Source from approved PRs to auto-fill lines, or describe items manually.
        </p>
      </div>

      <NewRfqForm
        approvedPrs={approvedPrs}
        vendors={vendors}
        projects={projects}
        prefilledLines={prefilledLines}
        initialPrIds={prIds}
      />
    </div>
  )
}
