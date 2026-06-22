/**
 * /procurement/rfqs — RFQ list.
 */
import Link from 'next/link'
import { listRfqs, type RfqSummary } from '@/lib/actions/rfqs'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, Send } from 'lucide-react'

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
}

const STATUS_FILTERS = [
  { value: 'all',              label: 'All' },
  { value: 'draft',            label: 'Drafts' },
  { value: 'sent',             label: 'Sent · awaiting quotes' },
  { value: 'quotes_collected', label: 'Quotes received' },
  { value: 'cs_finalised',     label: 'CS finalised' },
  { value: 'po_raised',        label: 'PO raised' },
  { value: 'cancelled',        label: 'Cancelled' },
] as const

const STATUS_TINT: Record<string, string> = {
  draft:            'bg-muted text-muted-foreground border-border',
  sent:             'bg-amber-50 text-amber-800 border-amber-200',
  quotes_collected: 'bg-violet-50 text-violet-800 border-violet-200',
  cs_finalised:     'bg-emerald-50 text-emerald-800 border-emerald-200',
  po_raised:        'bg-sky-50 text-sky-800 border-sky-200',
  cancelled:        'bg-rose-50 text-rose-800 border-rose-200',
}

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function RfqsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const status = STATUS_FILTERS.find((f) => f.value === sp.status)?.value ?? 'all'
  const rfqs = await listRfqs({ status: status === 'all' ? 'all' : (status as RfqSummary['status']), limit: 500 })

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-6xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/procurement" className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> Procurement
        </Link>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Request for Quotations (RFQ)</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {rfqs.length} record{rfqs.length === 1 ? '' : 's'} · multi-vendor evaluation between PR and PO
          </p>
        </div>
        <Link
          href="/procurement/rfqs/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Send className="size-4" /> New RFQ
        </Link>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => {
          const active = status === f.value
          const href = f.value === 'all' ? '/procurement/rfqs' : `/procurement/rfqs?status=${f.value}`
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

      {rfqs.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          {status === 'all'
            ? <>No RFQs yet. <Link href="/procurement/rfqs/new" className="text-primary hover:underline">Send the first one →</Link></>
            : <>No RFQs with this status. <Link href="/procurement/rfqs" className="text-primary hover:underline">Clear filter</Link></>}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rfqs.map((r) => (
            <Link
              key={r.id}
              href={`/procurement/rfqs/${r.id}`}
              className="flex items-center gap-4 rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-muted/30 transition-colors"
            >
              <div className="flex flex-col gap-0.5 w-44 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">{r.rfq_number}</span>
                  <Badge variant="outline" className={`${STATUS_TINT[r.status] ?? STATUS_TINT.draft} text-[10px] font-medium`}>
                    {r.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">{formatDate(r.rfq_date)}</div>
              </div>

              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.project_name ?? '(no project)'}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {r.line_count} line{r.line_count === 1 ? '' : 's'} ·{' '}
                  {r.vendor_count} vendor{r.vendor_count === 1 ? '' : 's'} invited ·{' '}
                  {r.response_count} responses
                  {r.source_pr_count > 0 && ` · from ${r.source_pr_count} PR${r.source_pr_count === 1 ? '' : 's'}`}
                  {r.linked_po_number && <> · PO <span className="font-mono">{r.linked_po_number}</span></>}
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground tabular-nums w-32 text-right">
                {r.response_deadline && <>deadline {formatDate(r.response_deadline)}</>}
              </div>

              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
