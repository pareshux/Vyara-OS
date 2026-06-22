/**
 * /procurement/orders — full PO list with status filter.
 */
import Link from 'next/link'
import { listPurchaseOrders, type POSummary } from '@/lib/actions/purchase-orders'
import { Badge } from '@/components/ui/badge'
import { ShoppingCart, ChevronRight, ChevronLeft } from 'lucide-react'

function formatMoneyShort(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} cr`
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)} L`
  if (n >= 1_000)       return `₹${(n / 1_000).toFixed(1)} k`
  return `₹${n.toFixed(0)}`
}

const FILTERS = [
  { value: 'all',              label: 'All' },
  { value: 'draft',            label: 'Drafts' },
  { value: 'pending_approval', label: 'Awaiting approval' },
  { value: 'approved',         label: 'Approved' },
  { value: 'sent',             label: 'Sent' },
  { value: 'partly_received',  label: 'Partly received' },
  { value: 'received',         label: 'Received' },
  { value: 'cancelled',        label: 'Cancelled' },
] as const

type FilterValue = (typeof FILTERS)[number]['value']

const STATUS_TINT: Record<string, string> = {
  draft:            'bg-muted text-muted-foreground border-border',
  pending_approval: 'bg-amber-50 text-amber-800 border-amber-200',
  approved:         'bg-sky-50 text-sky-800 border-sky-200',
  sent:             'bg-indigo-50 text-indigo-800 border-indigo-200',
  partly_received:  'bg-violet-50 text-violet-800 border-violet-200',
  received:         'bg-emerald-50 text-emerald-800 border-emerald-200',
  cancelled:        'bg-rose-50 text-rose-800 border-rose-200',
  closed:           'bg-muted text-muted-foreground border-border',
}

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function PurchaseOrdersPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const requested = sp.status as FilterValue | undefined
  const status: FilterValue = FILTERS.find((f) => f.value === requested)?.value ?? 'all'

  const pos = await listPurchaseOrders({
    status: status === 'all' ? 'all' : status,
    limit: 500,
  })

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-6xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/procurement" className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> Procurement
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Purchase orders</h1>
          <p className="text-sm text-muted-foreground tabular-nums">{pos.length} record{pos.length === 1 ? '' : 's'}</p>
        </div>
        <Link
          href="/procurement/orders/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <ShoppingCart className="size-4" /> New PO
        </Link>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = status === f.value
          const href = f.value === 'all' ? '/procurement/orders' : `/procurement/orders?status=${f.value}`
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
      {pos.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          {status === 'all' ? (
            <>No purchase orders yet. <Link href="/procurement/orders/new" className="text-primary hover:underline">Create the first one →</Link></>
          ) : (
            <>No POs with this status. <Link href="/procurement/orders" className="text-primary hover:underline">Clear filter</Link></>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {pos.map((po) => (
            <PoRow key={po.id} po={po} />
          ))}
        </div>
      )}
    </div>
  )
}

function PoRow({ po }: { po: POSummary }) {
  return (
    <Link
      href={`/procurement/orders/${po.id}`}
      className="flex items-center gap-4 rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-muted/30 transition-colors"
    >
      {/* PO number + status */}
      <div className="flex flex-col gap-0.5 w-44 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs">{po.po_number}</span>
          <Badge variant="outline" className={`${STATUS_TINT[po.status] ?? STATUS_TINT.draft} text-[10px] font-medium`}>
            {po.status.replace(/_/g, ' ')}
          </Badge>
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {new Date(po.po_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
        </div>
      </div>

      {/* Vendor + project */}
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{po.vendor_name}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {po.project_name ? `Project: ${po.project_name} · ` : ''}{po.warehouse_name} · {po.line_count} line{po.line_count === 1 ? '' : 's'}
        </div>
      </div>

      {/* Receive % chip */}
      {po.qty_ordered_total > 0 && po.receive_pct > 0 && (
        <div className="text-[11px] text-muted-foreground tabular-nums w-16 text-right">
          {po.receive_pct}% rcvd
        </div>
      )}

      {/* Value */}
      <div className="text-sm tabular-nums w-24 text-right font-medium">
        {formatMoneyShort(po.total)}
      </div>

      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
    </Link>
  )
}
