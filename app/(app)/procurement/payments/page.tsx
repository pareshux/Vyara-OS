/**
 * /procurement/payments — Vendor payments list.
 */
import Link from 'next/link'
import { listVendorPayments, type PaymentSummary } from '@/lib/actions/vendor-payments'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, Banknote } from 'lucide-react'

function formatMoneyShort(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} cr`
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)} L`
  if (n >= 1_000)       return `₹${(n / 1_000).toFixed(1)} k`
  return `₹${n.toFixed(0)}`
}
function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
}

const STATUS_FILTERS = [
  { value: 'all',       label: 'All' },
  { value: 'draft',     label: 'Drafts' },
  { value: 'posted',    label: 'Posted' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

const MODE_FILTERS = [
  { value: 'all',     label: 'Any mode' },
  { value: 'neft',    label: 'NEFT' },
  { value: 'rtgs',    label: 'RTGS' },
  { value: 'cheque',  label: 'Cheque' },
  { value: 'upi',     label: 'UPI' },
  { value: 'cash',    label: 'Cash' },
] as const

const STATUS_TINT: Record<string, string> = {
  draft:     'bg-muted text-muted-foreground border-border',
  posted:    'bg-emerald-50 text-emerald-800 border-emerald-200',
  cancelled: 'bg-rose-50 text-rose-800 border-rose-200',
}

const MODE_TINT: Record<string, string> = {
  neft:          'bg-sky-50 text-sky-800 border-sky-200',
  rtgs:          'bg-indigo-50 text-indigo-800 border-indigo-200',
  cheque:        'bg-amber-50 text-amber-800 border-amber-200',
  upi:           'bg-violet-50 text-violet-800 border-violet-200',
  cash:          'bg-stone-50 text-stone-800 border-stone-200',
  bg_adjustment: 'bg-muted text-muted-foreground border-border',
  on_account:    'bg-muted text-muted-foreground border-border',
}

interface PageProps {
  searchParams: Promise<{ status?: string; mode?: string }>
}

export default async function VendorPaymentsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const status = STATUS_FILTERS.find((f) => f.value === sp.status)?.value ?? 'all'
  const mode = MODE_FILTERS.find((f) => f.value === sp.mode)?.value ?? 'all'

  const payments = await listVendorPayments({
    status: status === 'all' ? 'all' : status,
    mode: mode === 'all' ? 'all' : (mode as PaymentSummary['payment_mode']),
    limit: 500,
  })

  const postedThisMonth = payments.filter((p) => {
    if (p.status !== 'posted') return false
    const d = new Date(p.payment_date)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const postedThisMonthValue = postedThisMonth.reduce((s, p) => s + Number(p.net_amount || 0), 0)
  const totalTdsThisMonth = postedThisMonth.reduce((s, p) => s + Number(p.tds_amount || 0), 0)
  const draftCount = payments.filter((p) => p.status === 'draft').length

  function filterHref(nextStatus: string, nextMode: string) {
    const params = new URLSearchParams()
    if (nextStatus !== 'all') params.set('status', nextStatus)
    if (nextMode !== 'all') params.set('mode', nextMode)
    const q = params.toString()
    return q ? `/procurement/payments?${q}` : '/procurement/payments'
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
          <h1 className="text-lg font-semibold tracking-tight">Vendor payments</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {payments.length} record{payments.length === 1 ? '' : 's'} · {formatMoneyShort(postedThisMonthValue)} net paid this month
          </p>
        </div>
        <Link
          href="/procurement/payments/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Banknote className="size-4" /> New payment
        </Link>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Net paid this month" value={formatMoneyShort(postedThisMonthValue)} hint={`${postedThisMonth.length} payment${postedThisMonth.length === 1 ? '' : 's'}`} />
        <KpiTile label="TDS deducted (month)" value={formatMoneyShort(totalTdsThisMonth)} hint="deposit by 7th of next month" />
        <KpiTile label="Drafts" value={draftCount.toString()} hint="not yet posted" accent={draftCount > 0 ? 'amber' : 'default'} />
        <KpiTile label="Total records" value={payments.length.toString()} hint="all states" />
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
                href={filterHref(f.value, mode)}
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
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Mode</div>
        <div className="flex flex-wrap gap-1.5">
          {MODE_FILTERS.map((f) => {
            const active = mode === f.value
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

      {payments.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground inline-flex flex-col items-center gap-2">
          <Banknote className="size-5 text-muted-foreground/60" />
          {status === 'all' && mode === 'all'
            ? <>No payments yet. <Link href="/procurement/payments/new" className="text-primary hover:underline">Book the first one →</Link></>
            : <>No payments match these filters. <Link href="/procurement/payments" className="text-primary hover:underline">Clear filters</Link></>}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {payments.map((p) => <PaymentRow key={p.id} payment={p} />)}
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

function PaymentRow({ payment }: { payment: PaymentSummary }) {
  return (
    <Link
      href={`/procurement/payments/${payment.id}`}
      className="flex items-center gap-4 rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-muted/30 transition-colors"
    >
      <div className="flex flex-col gap-0.5 w-44 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs">{payment.payment_number}</span>
          <Badge variant="outline" className={`${STATUS_TINT[payment.status] ?? STATUS_TINT.draft} text-[10px] font-medium`}>
            {payment.status}
          </Badge>
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {formatDate(payment.payment_date)}
        </div>
      </div>

      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{payment.vendor_name ?? '—'}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {payment.allocation_count} bill{payment.allocation_count === 1 ? '' : 's'}
          {payment.reference_no && <> · ref <span className="font-mono">{payment.reference_no}</span></>}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <Badge variant="outline" className={`${MODE_TINT[payment.payment_mode] ?? MODE_TINT.cash} text-[10px] uppercase`}>
          {payment.payment_mode}
        </Badge>
        {payment.tds_section && (
          <Badge variant="outline" className="bg-rose-50 text-rose-800 border-rose-200 text-[10px]">
            TDS {payment.tds_section} · {payment.tds_pct}%
          </Badge>
        )}
      </div>

      <div className="text-[11px] tabular-nums w-32 text-right">
        <div className="text-muted-foreground">gross {formatMoneyShort(payment.gross_amount)}</div>
        <div className="text-foreground font-medium">net {formatMoneyShort(payment.net_amount)}</div>
      </div>

      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
    </Link>
  )
}
