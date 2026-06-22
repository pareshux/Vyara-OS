/**
 * /procurement/returns — RTV list across all GRNs.
 */
import Link from 'next/link'
import { listReturnsToVendor, type RtvSummary } from '@/lib/actions/return-to-vendor'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, Undo2 } from 'lucide-react'

const FILTERS = [
  { value: 'all',       label: 'All' },
  { value: 'draft',     label: 'Drafts' },
  { value: 'posted',    label: 'Posted' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

const STATUS_TINT: Record<string, string> = {
  draft:     'bg-muted text-muted-foreground border-border',
  posted:    'bg-rose-50 text-rose-800 border-rose-200',
  cancelled: 'bg-muted text-muted-foreground border-border',
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
}

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function RtvListPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const requested = sp.status as (typeof FILTERS)[number]['value'] | undefined
  const status = FILTERS.find((f) => f.value === requested)?.value ?? 'all'
  const rtvs = await listReturnsToVendor({ status: status === 'all' ? 'all' : status, limit: 500 })

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-6xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/procurement" className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> Procurement
        </Link>
      </div>

      <div>
        <h1 className="text-lg font-semibold tracking-tight">Returns to vendor</h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          {rtvs.length} record{rtvs.length === 1 ? '' : 's'} · returns are created from a posted GRN
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = status === f.value
          const href = f.value === 'all' ? '/procurement/returns' : `/procurement/returns?status=${f.value}`
          return (
            <Link
              key={f.value}
              href={href}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted/40'
              }`}
            >
              {f.label}
            </Link>
          )
        })}
      </div>

      {rtvs.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground inline-flex flex-col items-center gap-2">
          <Undo2 className="size-5 text-muted-foreground/60" />
          {status === 'all'
            ? 'No returns yet. They\'re created from a posted GRN via Return to Vendor.'
            : <>No RTVs with this status. <Link href="/procurement/returns" className="text-primary hover:underline">Clear filter</Link></>}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rtvs.map((r) => <RtvRow key={r.id} rtv={r} />)}
        </div>
      )}
    </div>
  )
}

function RtvRow({ rtv }: { rtv: RtvSummary }) {
  return (
    <Link
      href={`/procurement/returns/${rtv.id}`}
      className="flex items-center gap-4 rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-muted/30 transition-colors"
    >
      <div className="flex flex-col gap-0.5 w-44 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs">{rtv.rtv_number}</span>
          <Badge variant="outline" className={`${STATUS_TINT[rtv.status] ?? STATUS_TINT.draft} text-[10px] font-medium`}>
            {rtv.status}
          </Badge>
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums">{formatDate(rtv.rtv_date)}</div>
      </div>

      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{rtv.vendor_name ?? '—'}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {rtv.grn_number && <>against <span className="font-mono">{rtv.grn_number}</span> · </>}
          {rtv.po_number && <>PO <span className="font-mono">{rtv.po_number}</span> · </>}
          {rtv.line_count} line{rtv.line_count === 1 ? '' : 's'}
        </div>
      </div>

      <div className="text-[11px] text-muted-foreground tabular-nums w-28 text-right">
        {rtv.qty_returned_total > 0 && <span>{rtv.qty_returned_total} returned</span>}
      </div>

      {rtv.vendor_credit_note_no && (
        <div className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
          credit note ✓
        </div>
      )}

      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
    </Link>
  )
}
