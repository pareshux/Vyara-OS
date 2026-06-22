/**
 * /procurement/ap-ageing — Accounts Payable ageing dashboard.
 *
 * The cash-out twin of /collections. KPI strip + 5-bucket ageing
 * stacked bar + top vendor outstanding + MSME compliance (45-day
 * rule per MSMED Act 2006) + filtered bills list.
 *
 * Bucket clicks filter the bills list via ?bucket= query param.
 * The bucket strip + top vendor + MSME sections always render the
 * full universe so the dashboard stays informative regardless of
 * which bucket is being inspected.
 */
import Link from 'next/link'
import {
  getApAgeingOverview,
  type AgeingBucket,
  type AgeingBillRow,
  type AgeingBucketSummary,
  type TopVendor,
} from '@/lib/read-models/ap-ageing'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, AlertTriangle, Wallet, CalendarClock, Building2 } from 'lucide-react'

function formatINR(n: number) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
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

const BUCKET_META: Record<AgeingBucket, { label: string; color: string; chipBg: string; chipColor: string }> = {
  current:  { label: 'Current',   color: '#1F5E55', chipBg: 'bg-emerald-50',  chipColor: 'text-emerald-800 border-emerald-200' },
  '1-30':   { label: '1–30 days', color: '#B45309', chipBg: 'bg-amber-50',    chipColor: 'text-amber-800 border-amber-200' },
  '31-60':  { label: '31–60 days', color: '#C2410C', chipBg: 'bg-orange-50',  chipColor: 'text-orange-800 border-orange-200' },
  '61-90':  { label: '61–90 days', color: '#B91C1C', chipBg: 'bg-rose-50',    chipColor: 'text-rose-800 border-rose-200' },
  '90+':    { label: '90+ days',  color: '#7F1D1D', chipBg: 'bg-rose-50',    chipColor: 'text-rose-900 border-rose-300' },
}

const MSME_LABEL: Record<string, string> = {
  not_applicable: 'Not MSME',
  unknown:        'Unknown',
  ok:             'OK',
  warning:        'Warning',
  breach:         'Breach',
}

interface PageProps {
  searchParams: Promise<{ bucket?: string; vendor?: string }>
}

export default async function ApAgeingPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const bucketFilter = (sp.bucket && (['current', '1-30', '31-60', '61-90', '90+'] as const).includes(sp.bucket as AgeingBucket))
    ? (sp.bucket as AgeingBucket)
    : null
  const vendorFilter = sp.vendor ?? null

  const data = await getApAgeingOverview({
    bucket: bucketFilter ?? 'all',
    vendor_id: vendorFilter ?? undefined,
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
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">AP ageing</h1>
          <p className="text-sm text-muted-foreground">
            What you owe vendors, by how long it&apos;s been overdue. MSME 45-day rule (MSMED Act 2006) tracked separately.
          </p>
        </div>
        {data.totals.msme_breach_count > 0 && (
          <a
            href="/api/procurement/ap-ageing/export-msme1"
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-rose-50 text-rose-800 px-3 py-1.5 text-sm font-medium hover:bg-rose-100 transition-colors"
          >
            <AlertTriangle className="size-4" /> Export MSME-1 ({data.totals.msme_breach_count})
          </a>
        )}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile
          icon={Wallet}
          label="Total outstanding"
          value={formatMoneyShort(data.totals.outstanding)}
          hint={`${data.totals.bill_count} bill${data.totals.bill_count === 1 ? '' : 's'}`}
        />
        <KpiTile
          icon={CalendarClock}
          label="Overdue"
          value={formatMoneyShort(data.totals.overdue)}
          hint={`${data.totals.overdue_count} overdue bill${data.totals.overdue_count === 1 ? '' : 's'}`}
          accent={data.totals.overdue > 0 ? 'rose' : 'default'}
        />
        <KpiTile
          icon={AlertTriangle}
          label="MSME breach (45d+)"
          value={data.totals.msme_breach_count.toString()}
          hint={data.totals.msme_breach_value > 0 ? `${formatMoneyShort(data.totals.msme_breach_value)} owed` : 'none'}
          accent={data.totals.msme_breach_count > 0 ? 'rose' : 'default'}
        />
        <KpiTile
          icon={AlertTriangle}
          label="MSME approaching (30-44d)"
          value={data.totals.msme_warning_count.toString()}
          hint={data.totals.msme_warning_value > 0 ? `${formatMoneyShort(data.totals.msme_warning_value)} owed` : 'none'}
          accent={data.totals.msme_warning_count > 0 ? 'amber' : 'default'}
        />
      </div>

      {/* Ageing bucket strip */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Ageing</div>
            {bucketFilter && (
              <Link href="/procurement/ap-ageing" className="text-xs text-muted-foreground hover:text-foreground">
                Clear filter ×
              </Link>
            )}
          </div>

          {/* Stacked bar */}
          {data.totals.outstanding > 0 ? (
            <div className="flex h-3 rounded-full overflow-hidden border border-border bg-muted">
              {data.buckets.map((b) => (
                b.pct > 0 && (
                  <div
                    key={b.bucket}
                    style={{ width: `${b.pct}%`, backgroundColor: BUCKET_META[b.bucket].color }}
                    title={`${BUCKET_META[b.bucket].label}: ${formatMoneyShort(b.value)} (${b.pct}%)`}
                  />
                )
              ))}
            </div>
          ) : (
            <div className="h-3 rounded-full bg-muted" />
          )}

          {/* Bucket buttons */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {data.buckets.map((b) => (
              <BucketTile
                key={b.bucket}
                bucket={b}
                active={bucketFilter === b.bucket}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* MSME compliance card — only render if anything to show */}
      {(data.msme.breach.length > 0 || data.msme.warning.length > 0) && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-700" />
              <div className="text-sm font-medium">MSME 45-day compliance</div>
              <span className="text-[11px] text-muted-foreground">MSMED Act 2006 — payment within 45 days of supply is mandatory</span>
            </div>

            {data.msme.breach.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium text-rose-700">
                  🔴 Breach ({data.msme.breach.length}) — past the 45-day window. 3× bank-rate interest applies under MSMED.
                </div>
                <div className="flex flex-col gap-1.5">
                  {data.msme.breach.map(({ bill }) => (
                    <MsmeBillRow key={bill.id} bill={bill} severity="breach" />
                  ))}
                </div>
              </div>
            )}

            {data.msme.warning.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium text-amber-700">
                  🟡 Approaching ({data.msme.warning.length}) — within 30 days of supply, less than 15 days to the legal limit.
                </div>
                <div className="flex flex-col gap-1.5">
                  {data.msme.warning.map(({ bill }) => (
                    <MsmeBillRow key={bill.id} bill={bill} severity="warning" />
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground border-t border-border pt-2">
              MSME-1 half-yearly report (FIN-020 follow-on) lands when the first tenant approaches a filing window.
              For now, surface as a dashboard signal.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Top vendors */}
      {data.top_vendors.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="text-sm font-medium inline-flex items-center gap-1.5">
              <Building2 className="size-3.5" /> Top vendors by outstanding
            </div>
            <div className="flex flex-col gap-1.5">
              {data.top_vendors.map((v) => <VendorRow key={v.vendor_id} vendor={v} />)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bills list — filtered by bucket */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">
              Bills {bucketFilter && <span className="text-muted-foreground">— {BUCKET_META[bucketFilter].label}</span>}
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {data.bills.length} bill{data.bills.length === 1 ? '' : 's'}
            </div>
          </div>

          {data.bills.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {bucketFilter
                ? <>No bills in this bucket. <Link href="/procurement/ap-ageing" className="text-primary hover:underline">Clear filter</Link></>
                : 'No outstanding bills.'}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {data.bills.map((b) => <BillRow key={b.id} bill={b} />)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  hint: string
  accent?: 'rose' | 'amber' | 'default'
}) {
  const valueClass = accent === 'rose' ? 'text-rose-700' : accent === 'amber' ? 'text-amber-700' : ''
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-0.5">
      <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
        <Icon className="size-3" /> {label}
      </div>
      <div className={`text-lg font-semibold tabular-nums ${valueClass}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </div>
  )
}

function BucketTile({ bucket, active }: { bucket: AgeingBucketSummary; active: boolean }) {
  const meta = BUCKET_META[bucket.bucket]
  const href = active
    ? '/procurement/ap-ageing'
    : `/procurement/ap-ageing?bucket=${bucket.bucket}`
  return (
    <Link
      href={href}
      className={`rounded-md border p-2.5 flex flex-col gap-0.5 transition-colors ${
        active
          ? 'border-primary bg-primary/5'
          : bucket.count === 0
            ? 'border-border bg-muted/30 hover:bg-muted/50'
            : 'border-border bg-card hover:bg-muted/30'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{meta.label}</span>
        <div className="size-2 rounded-full" style={{ backgroundColor: meta.color }} />
      </div>
      <div className="text-base font-semibold tabular-nums">{formatMoneyShort(bucket.value)}</div>
      <div className="text-[11px] text-muted-foreground tabular-nums">
        {bucket.count} bill{bucket.count === 1 ? '' : 's'}
        {bucket.pct > 0 && ` · ${bucket.pct}%`}
      </div>
    </Link>
  )
}

function VendorRow({ vendor }: { vendor: TopVendor }) {
  const isMsme = vendor.msme_status && vendor.msme_status !== 'not_msme'
  return (
    <Link
      href={`/procurement/ap-ageing?vendor=${vendor.vendor_id}`}
      className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 hover:bg-muted/30 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{vendor.vendor_name}</div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {vendor.bill_count} bill{vendor.bill_count === 1 ? '' : 's'}
          {' · oldest '}
          <span className={vendor.oldest_days_overdue > 0 ? 'text-rose-700' : ''}>
            {vendor.oldest_days_overdue > 0 ? `${vendor.oldest_days_overdue}d overdue` : 'not yet due'}
          </span>
          {' · '}<span className="font-mono">{vendor.oldest_bill_number}</span>
        </div>
      </div>
      {isMsme && (
        <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-[10px]">
          MSME · {vendor.msme_status}
        </Badge>
      )}
      <div className="text-sm tabular-nums font-medium">{formatMoneyShort(vendor.outstanding)}</div>
    </Link>
  )
}

function MsmeBillRow({ bill, severity }: { bill: AgeingBillRow; severity: 'breach' | 'warning' }) {
  const days = bill.days_since_receipt ?? 0
  const remaining = 45 - days
  const tint = severity === 'breach'
    ? 'border-rose-200 bg-rose-50/40'
    : 'border-amber-200 bg-amber-50/40'
  return (
    <Link
      href={`/procurement/bills/${bill.id}`}
      className={`flex items-center gap-3 rounded-md border ${tint} px-3 py-2 hover:bg-muted/30 transition-colors`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{bill.vendor_name}</div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          <span className="font-mono">{bill.bill_number}</span>
          {' · vendor inv '}<span className="font-mono">{bill.vendor_invoice_no}</span>
          {' · received '}{formatDate(bill.received_at)}
        </div>
      </div>
      <div className="text-[11px] tabular-nums text-right">
        {severity === 'breach'
          ? <span className="text-rose-700 font-medium">{days}d since supply · {Math.abs(remaining)}d past 45-day limit</span>
          : <span className="text-amber-700 font-medium">{days}d since supply · {remaining}d to limit</span>}
        <div className="text-foreground font-medium">{formatMoneyShort(bill.amount_outstanding)}</div>
      </div>
    </Link>
  )
}

function BillRow({ bill }: { bill: AgeingBillRow }) {
  const overdue = bill.days_overdue > 0
  const isMsme = bill.vendor_msme_status && bill.vendor_msme_status !== 'not_msme'
  return (
    <Link
      href={`/procurement/bills/${bill.id}`}
      className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 hover:bg-muted/30 transition-colors"
    >
      <div className="flex flex-col gap-0.5 w-48 shrink-0">
        <span className="font-mono text-xs">{bill.bill_number}</span>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          Inv <span className="font-mono">{bill.vendor_invoice_no}</span>
        </div>
      </div>

      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{bill.vendor_name}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {bill.received_at && <>received {formatDate(bill.received_at)} · </>}
          due {formatDate(bill.due_date)}
        </div>
      </div>

      {isMsme && (
        <Badge
          variant="outline"
          className={`text-[10px] ${
            bill.msme_flag === 'breach' ? 'bg-rose-50 text-rose-800 border-rose-200'
            : bill.msme_flag === 'warning' ? 'bg-amber-50 text-amber-800 border-amber-200'
            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}
        >
          MSME {MSME_LABEL[bill.msme_flag]}
        </Badge>
      )}

      <Badge variant="outline" className={`${BUCKET_META[bill.ageing_bucket].chipBg} ${BUCKET_META[bill.ageing_bucket].chipColor} text-[10px]`}>
        {bill.ageing_bucket === 'current' ? 'current' : `${bill.days_overdue}d`}
      </Badge>

      <div className="text-sm tabular-nums w-28 text-right font-medium">
        {formatMoneyShort(bill.amount_outstanding)}
      </div>
    </Link>
  )
}
