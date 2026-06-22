/**
 * /procurement/bills — Vendor Bills list.
 */
import Link from 'next/link'
import { listVendorBills, type VendorBillSummary } from '@/lib/actions/vendor-bills'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, Receipt, AlertTriangle, CheckCircle2, Eye } from 'lucide-react'

function formatINR(n: number) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function formatMoneyShort(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} cr`
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)} L`
  if (n >= 1_000)       return `₹${(n / 1_000).toFixed(1)} k`
  return `₹${n.toFixed(0)}`
}
function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
}
function isOverdue(due: string | null): boolean {
  if (!due) return false
  return new Date(due) < new Date(new Date().toISOString().slice(0, 10))
}

const STATUS_FILTERS = [
  { value: 'all',         label: 'All' },
  { value: 'draft',       label: 'Drafts' },
  { value: 'submitted',   label: 'Awaiting approval' },
  { value: 'approved',    label: 'Approved' },
  { value: 'partly_paid', label: 'Partly paid' },
  { value: 'paid',        label: 'Paid' },
  { value: 'cancelled',   label: 'Cancelled' },
] as const

const MATCH_FILTERS = [
  { value: 'all',          label: 'Any match' },
  { value: 'matched',      label: 'Matched' },
  { value: 'under_review', label: 'Under review' },
  { value: 'mismatched',   label: 'Mismatched' },
] as const

const STATUS_TINT: Record<string, string> = {
  draft:       'bg-muted text-muted-foreground border-border',
  submitted:   'bg-amber-50 text-amber-800 border-amber-200',
  approved:    'bg-sky-50 text-sky-800 border-sky-200',
  partly_paid: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  paid:        'bg-emerald-50 text-emerald-800 border-emerald-200',
  cancelled:   'bg-rose-50 text-rose-800 border-rose-200',
}

const MATCH_TINT: Record<string, string> = {
  pending:      'bg-muted text-muted-foreground border-border',
  matched:      'bg-emerald-50 text-emerald-800 border-emerald-200',
  under_review: 'bg-amber-50 text-amber-800 border-amber-200',
  mismatched:   'bg-rose-50 text-rose-800 border-rose-200',
}

interface PageProps {
  searchParams: Promise<{ status?: string; match?: string }>
}

export default async function VendorBillsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const status = STATUS_FILTERS.find((f) => f.value === sp.status)?.value ?? 'all'
  const matchFilter = MATCH_FILTERS.find((f) => f.value === sp.match)?.value ?? 'all'

  const bills = await listVendorBills({
    status: status === 'all' ? 'all' : status,
    match_status: matchFilter === 'all' ? 'all' : matchFilter,
    limit: 500,
  })

  const outstandingTotal = bills.filter((b) => b.status === 'approved' || b.status === 'partly_paid').reduce((s, b) => s + Number(b.amount_outstanding || 0), 0)
  const overdueBills = bills.filter((b) => (b.status === 'approved' || b.status === 'partly_paid') && isOverdue(b.due_date))
  const overdueValue = overdueBills.reduce((s, b) => s + Number(b.amount_outstanding || 0), 0)
  const mismatchedCount = bills.filter((b) => b.match_status === 'mismatched').length

  function filterHref(nextStatus: string, nextMatch: string) {
    const params = new URLSearchParams()
    if (nextStatus !== 'all') params.set('status', nextStatus)
    if (nextMatch !== 'all') params.set('match', nextMatch)
    const q = params.toString()
    return q ? `/procurement/bills?${q}` : '/procurement/bills'
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-6xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/procurement" className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> Procurement
        </Link>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Vendor bills</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {bills.length} record{bills.length === 1 ? '' : 's'} · {formatMoneyShort(outstandingTotal)} outstanding
            {overdueBills.length > 0 && <span className="text-rose-700"> · {overdueBills.length} overdue ({formatMoneyShort(overdueValue)})</span>}
          </p>
        </div>
        <Link
          href="/procurement/bills/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Receipt className="size-4" /> New vendor bill
        </Link>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Outstanding" value={formatMoneyShort(outstandingTotal)} hint={`${bills.filter(b => b.status === 'approved' || b.status === 'partly_paid').length} bills`} />
        <KpiTile label="Overdue" value={formatMoneyShort(overdueValue)} hint={`${overdueBills.length} bills`} accent={overdueBills.length > 0 ? 'rose' : 'default'} />
        <KpiTile label="Mismatched" value={mismatchedCount.toString()} hint="need review" accent={mismatchedCount > 0 ? 'amber' : 'default'} />
        <KpiTile label="Drafts" value={bills.filter(b => b.status === 'draft').length.toString()} hint="not yet submitted" />
      </div>

      {/* Status filter */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Status</div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => {
            const active = status === f.value
            return (
              <Link
                key={f.value}
                href={filterHref(f.value, matchFilter)}
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
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">3-way match</div>
        <div className="flex flex-wrap gap-1.5">
          {MATCH_FILTERS.map((f) => {
            const active = matchFilter === f.value
            return (
              <Link
                key={f.value}
                href={filterHref(status, f.value)}
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
      </div>

      {bills.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground inline-flex flex-col items-center gap-2">
          <Receipt className="size-5 text-muted-foreground/60" />
          {status === 'all' && matchFilter === 'all'
            ? <>No vendor bills yet. <Link href="/procurement/bills/new" className="text-primary hover:underline">Book the first one →</Link></>
            : <>No bills match these filters. <Link href="/procurement/bills" className="text-primary hover:underline">Clear filters</Link></>}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {bills.map((b) => <BillRow key={b.id} bill={b} />)}
        </div>
      )}
    </div>
  )
}

function KpiTile({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: 'rose' | 'amber' | 'default' }) {
  const valueClass = accent === 'rose' ? 'text-rose-700' : accent === 'amber' ? 'text-amber-700' : ''
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-0.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${valueClass}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </div>
  )
}

function BillRow({ bill }: { bill: VendorBillSummary }) {
  const overdue = (bill.status === 'approved' || bill.status === 'partly_paid') && isOverdue(bill.due_date)
  return (
    <Link
      href={`/procurement/bills/${bill.id}`}
      className="flex items-center gap-4 rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-muted/30 transition-colors"
    >
      <div className="flex flex-col gap-0.5 w-48 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs">{bill.bill_number}</span>
          <Badge variant="outline" className={`${STATUS_TINT[bill.status] ?? STATUS_TINT.draft} text-[10px] font-medium`}>
            {bill.status.replace(/_/g, ' ')}
          </Badge>
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          Inv: <span className="font-mono">{bill.vendor_invoice_no}</span> · {formatDate(bill.vendor_invoice_date)}
        </div>
      </div>

      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{bill.vendor_name ?? '—'}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {bill.po_number && <>PO <span className="font-mono">{bill.po_number}</span> · </>}
          {bill.line_count} line{bill.line_count === 1 ? '' : 's'}
        </div>
      </div>

      <div className="w-28 shrink-0">
        <Badge variant="outline" className={`${MATCH_TINT[bill.match_status] ?? MATCH_TINT.pending} text-[10px] inline-flex items-center gap-1`}>
          {bill.match_status === 'matched' && <CheckCircle2 className="size-3" />}
          {bill.match_status === 'mismatched' && <AlertTriangle className="size-3" />}
          {bill.match_status === 'under_review' && <Eye className="size-3" />}
          {bill.match_status.replace(/_/g, ' ')}
        </Badge>
      </div>

      <div className="text-[11px] tabular-nums w-32 text-right">
        {bill.due_date && (
          <div className={overdue ? 'text-rose-700 font-medium' : 'text-muted-foreground'}>
            due {formatDate(bill.due_date)}
          </div>
        )}
        <div className="text-foreground font-medium">{formatMoneyShort(bill.total)}</div>
      </div>

      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
    </Link>
  )
}
