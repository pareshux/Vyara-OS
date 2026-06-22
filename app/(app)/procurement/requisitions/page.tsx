/**
 * /procurement/requisitions — Purchase Requisitions list.
 */
import Link from 'next/link'
import { listPurchaseRequisitions, type PrSummary } from '@/lib/actions/purchase-requisitions'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react'

function formatMoneyShort(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} cr`
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)} L`
  if (n >= 1_000)       return `₹${(n / 1_000).toFixed(1)} k`
  return `₹${n.toFixed(0)}`
}
function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
}

const STATUS_FILTERS = [
  { value: 'all',        label: 'All' },
  { value: 'draft',      label: 'Drafts' },
  { value: 'submitted',  label: 'Awaiting approval' },
  { value: 'approved',   label: 'Approved' },
  { value: 'po_raised',  label: 'PO raised' },
  { value: 'rejected',   label: 'Rejected' },
  { value: 'cancelled',  label: 'Cancelled' },
] as const

const STATUS_TINT: Record<string, string> = {
  draft:      'bg-muted text-muted-foreground border-border',
  submitted:  'bg-amber-50 text-amber-800 border-amber-200',
  approved:   'bg-emerald-50 text-emerald-800 border-emerald-200',
  po_raised:  'bg-sky-50 text-sky-800 border-sky-200',
  rejected:   'bg-rose-50 text-rose-800 border-rose-200',
  cancelled:  'bg-muted text-muted-foreground border-border',
}

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function PurchaseRequisitionsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const requested = sp.status as (typeof STATUS_FILTERS)[number]['value'] | undefined
  const status = STATUS_FILTERS.find((f) => f.value === requested)?.value ?? 'all'

  const prs = await listPurchaseRequisitions({
    status: status === 'all' ? 'all' : (status as PrSummary['status']),
    limit: 500,
  })

  const drafts = prs.filter((p) => p.status === 'draft').length
  const awaiting = prs.filter((p) => p.status === 'submitted').length
  const approved = prs.filter((p) => p.status === 'approved').length
  const pending = prs.filter((p) => p.status === 'submitted' || p.status === 'draft' || p.status === 'approved')
  const pendingValue = pending.reduce((s, p) => s + Number(p.estimated_value || 0), 0)

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-6xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/procurement" className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> Procurement
        </Link>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Purchase requisitions</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {prs.length} record{prs.length === 1 ? '' : 's'} · {formatMoneyShort(pendingValue)} estimated value in flight
          </p>
        </div>
        <Link
          href="/procurement/requisitions/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <ClipboardList className="size-4" /> New requisition
        </Link>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Drafts" value={drafts.toString()} hint="not yet submitted" />
        <KpiTile label="Awaiting approval" value={awaiting.toString()} hint="manager review" accent={awaiting > 0 ? 'amber' : 'default'} />
        <KpiTile label="Approved" value={approved.toString()} hint="ready for PO" accent={approved > 0 ? 'emerald' : 'default'} />
        <KpiTile label="Total in flight" value={formatMoneyShort(pendingValue)} hint="estimated value" />
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => {
          const active = status === f.value
          const href = f.value === 'all' ? '/procurement/requisitions' : `/procurement/requisitions?status=${f.value}`
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

      {prs.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground inline-flex flex-col items-center gap-2">
          <ClipboardList className="size-5 text-muted-foreground/60" />
          {status === 'all'
            ? <>No purchase requisitions yet. <Link href="/procurement/requisitions/new" className="text-primary hover:underline">Raise the first one →</Link></>
            : <>No PRs with this status. <Link href="/procurement/requisitions" className="text-primary hover:underline">Clear filter</Link></>}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {prs.map((pr) => <PrRow key={pr.id} pr={pr} />)}
        </div>
      )}
    </div>
  )
}

function KpiTile({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: 'emerald' | 'amber' | 'default' }) {
  const valueClass = accent === 'emerald' ? 'text-emerald-700' : accent === 'amber' ? 'text-amber-700' : ''
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-0.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${valueClass}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </div>
  )
}

function PrRow({ pr }: { pr: PrSummary }) {
  return (
    <Link
      href={`/procurement/requisitions/${pr.id}`}
      className="flex items-center gap-4 rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-muted/30 transition-colors"
    >
      <div className="flex flex-col gap-0.5 w-44 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs">{pr.pr_number}</span>
          <Badge variant="outline" className={`${STATUS_TINT[pr.status] ?? STATUS_TINT.draft} text-[10px] font-medium`}>
            {pr.status.replace(/_/g, ' ')}
          </Badge>
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {formatDate(pr.created_at)}
          {pr.required_by_date && ` · need by ${formatDate(pr.required_by_date)}`}
        </div>
      </div>

      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {pr.project_name ?? '(no project)'}
          {pr.cost_center && <span className="text-muted-foreground"> · {pr.cost_center}</span>}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">
          {pr.requested_by_name && <>by {pr.requested_by_name} · </>}
          {pr.line_count} line{pr.line_count === 1 ? '' : 's'}
          {pr.linked_po_number && (
            <> · PO <span className="font-mono">{pr.linked_po_number}</span></>
          )}
        </div>
      </div>

      <div className="text-sm tabular-nums w-28 text-right font-medium">
        {formatMoneyShort(pr.estimated_value)}
      </div>

      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
    </Link>
  )
}
