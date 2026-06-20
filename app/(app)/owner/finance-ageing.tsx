/**
 * FinanceAgeing — Section 3 of the Owner Dashboard (Blueprint INT-014, Slice 2).
 *
 * Receivables ageing rollup driven by `invoice_ageing_v` buckets. Each bucket
 * is clickable → drills into `/collections?bucket=X` (matches the collections
 * page's existing filter contract).
 *
 * Visual: a single horizontal stacked bar (proportional widths) + a 4-card
 * breakdown strip below. The bar gives shape-at-a-glance; the cards give the
 * exact ₹ + count + drill affordance. Buckets with 0 outstanding still render
 * so the structure is consistent on a quiet day.
 *
 * Per design.md §5: status never color-only — every bucket has an icon AND
 * a text label ('Current', 'Late 1-30', etc).
 *
 * Customer-#2 readiness note (honest): bucket boundaries are hardcoded in
 * `invoice_ageing_v` (0006_invoices.sql), not tenant-configurable. Pre-existing
 * limitation — out of scope for this slice; tracked separately if a tenant
 * demands non-standard buckets.
 */
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar, Clock, AlertTriangle, AlertOctagon, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Ageing, AgeingBucketKey } from '@/lib/read-models/owner-overview'

const BUCKET_CONFIG: Record<AgeingBucketKey, {
  label: string
  shortLabel: string
  icon: typeof Calendar
  barColor: string
  badgeClass: string
}> = {
  'current': {
    label: 'Within terms',
    shortLabel: 'Current',
    icon: Calendar,
    barColor: 'bg-emerald-500',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  '1-30': {
    label: 'Late 1–30 days',
    shortLabel: '1–30d',
    icon: Clock,
    barColor: 'bg-amber-400',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  '31-60': {
    label: 'Late 31–60 days',
    shortLabel: '31–60d',
    icon: AlertTriangle,
    barColor: 'bg-orange-500',
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  '60+': {
    label: 'Late 60+ days',
    shortLabel: '60+d',
    icon: AlertOctagon,
    barColor: 'bg-red-500',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
  },
}

function formatMoney(n: number): string {
  if (n === 0) return '₹0'
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)} cr`
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

export function FinanceAgeing({ ageing }: { ageing: Ageing }) {
  const total = ageing.total_outstanding
  if (total <= 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center flex flex-col items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Calendar className="size-5" />
          </div>
          <p className="text-sm font-medium text-foreground">No outstanding receivables.</p>
          <p className="text-sm text-muted-foreground">All invoices paid or within terms.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="pt-4 pb-4 flex flex-col gap-4">
        {/* Headline + worst */}
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {formatMoney(total)}
            </p>
            <p className="text-xs text-muted-foreground">Total outstanding</p>
          </div>
          {ageing.worst_days_overdue > 0 && (
            <p className="text-xs text-muted-foreground tabular-nums">
              Worst: <span className="font-semibold text-foreground">{ageing.worst_days_overdue} days</span> overdue
            </p>
          )}
        </div>

        {/* Stacked bar */}
        <div
          role="img"
          aria-label={`Ageing breakdown: ${ageing.buckets.map((b) => `${BUCKET_CONFIG[b.key].label} ${formatMoney(b.value)}`).join(', ')}`}
          className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
        >
          {ageing.buckets.map((b) => {
            const widthPct = total > 0 ? (b.value / total) * 100 : 0
            if (widthPct === 0) return null
            return (
              <div
                key={b.key}
                className={cn('h-full', BUCKET_CONFIG[b.key].barColor)}
                style={{ width: `${widthPct}%` }}
                title={`${BUCKET_CONFIG[b.key].label}: ${formatMoney(b.value)} (${b.count} invoice${b.count === 1 ? '' : 's'})`}
              />
            )
          })}
        </div>

        {/* Per-bucket card row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {ageing.buckets.map((b) => {
            const cfg = BUCKET_CONFIG[b.key]
            const Icon = cfg.icon
            const pct = total > 0 ? (b.value / total) * 100 : 0
            return (
              <Link key={b.key} href={b.drill_href} className="group">
                <div className={cn(
                  'rounded-lg border bg-background p-2.5 transition-shadow group-hover:shadow-sm flex flex-col gap-1',
                )}>
                  <div className="flex items-center justify-between gap-1">
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                      cfg.badgeClass,
                    )}>
                      <Icon className="size-3" />
                      {cfg.shortLabel}
                    </span>
                    <ArrowRight className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-base font-semibold tabular-nums text-foreground">
                    {formatMoney(b.value)}
                  </p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {b.count} invoice{b.count === 1 ? '' : 's'} · {pct.toFixed(0)}%
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
