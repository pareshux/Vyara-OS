/**
 * /procurement/grns — Goods Receipt Notes list across all POs.
 */
import Link from 'next/link'
import { listGoodsReceiptNotes, type GrnSummary } from '@/lib/actions/goods-receipt-notes'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, PackageOpen } from 'lucide-react'

const FILTERS = [
  { value: 'all',       label: 'All' },
  { value: 'draft',     label: 'Drafts' },
  { value: 'posted',    label: 'Posted' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

const STATUS_TINT: Record<string, string> = {
  draft:     'bg-muted text-muted-foreground border-border',
  posted:    'bg-emerald-50 text-emerald-800 border-emerald-200',
  cancelled: 'bg-rose-50 text-rose-800 border-rose-200',
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
}

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function GrnListPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const requested = sp.status as (typeof FILTERS)[number]['value'] | undefined
  const status = FILTERS.find((f) => f.value === requested)?.value ?? 'all'
  const grns = await listGoodsReceiptNotes({ status: status === 'all' ? 'all' : status, limit: 500 })

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-6xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/procurement" className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> Procurement
        </Link>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Goods receipts</h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          {grns.length} record{grns.length === 1 ? '' : 's'} · receipts are created from a PO&apos;s Receive button
        </p>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = status === f.value
          const href = f.value === 'all' ? '/procurement/grns' : `/procurement/grns?status=${f.value}`
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

      {/* List */}
      {grns.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground inline-flex flex-col items-center gap-2">
          <PackageOpen className="size-5 text-muted-foreground/60" />
          {status === 'all'
            ? 'No goods receipts yet. They\'re created from a sent or partly-received PO.'
            : <>No GRNs with this status. <Link href="/procurement/grns" className="text-primary hover:underline">Clear filter</Link></>}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {grns.map((g) => <GrnRow key={g.id} grn={g} />)}
        </div>
      )}
    </div>
  )
}

function GrnRow({ grn }: { grn: GrnSummary }) {
  return (
    <Link
      href={`/procurement/grns/${grn.id}`}
      className="flex items-center gap-4 rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-muted/30 transition-colors"
    >
      <div className="flex flex-col gap-0.5 w-44 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs">{grn.grn_number}</span>
          <Badge variant="outline" className={`${STATUS_TINT[grn.status] ?? STATUS_TINT.draft} text-[10px] font-medium`}>
            {grn.status}
          </Badge>
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {formatDate(grn.grn_date)}
        </div>
      </div>

      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{grn.vendor_name ?? '—'}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {grn.po_number && <>against <span className="font-mono">{grn.po_number}</span> · </>}
          {grn.warehouse_name ?? '—'} · {grn.line_count} line{grn.line_count === 1 ? '' : 's'}
        </div>
      </div>

      <div className="text-[11px] text-muted-foreground tabular-nums w-32 text-right">
        {grn.qty_accepted_total > 0 && <span>{grn.qty_accepted_total} accepted</span>}
        {grn.qty_rejected_total > 0 && <span className="ml-2 text-rose-700">{grn.qty_rejected_total} rejected</span>}
      </div>

      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
    </Link>
  )
}
