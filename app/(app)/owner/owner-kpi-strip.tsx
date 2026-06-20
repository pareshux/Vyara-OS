/**
 * OwnerKpiStrip — Section 1 of the Owner Dashboard (Blueprint INT-014).
 *
 * 6-card strip rendered server-side. Period-sensitive KPIs (revenue,
 * collections, orders) show a delta vs the equal prior-period window;
 * point-in-time KPIs (outstanding, open pipeline, DSO) omit deltas.
 *
 * Reuses the KPI-card shape established by /finance + /field — clean
 * semantic markup, tabular-nums on every figure, icon + label + value
 * + hint + delta-chip layout.
 */
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import {
  TrendingUp,
  Wallet,
  Package,
  AlertCircle,
  FileText,
  CalendarClock,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BusinessHealth, BusinessHealthKpi, KpiDelta } from '@/lib/read-models/owner-overview'

type KpiConfig = {
  icon: typeof TrendingUp
  label: string
  href: string
  /** money | count | days — drives formatting */
  unit: 'money' | 'days'
  /** Lower delta = better (cheap is good, e.g. DSO would be — but DSO has no delta). */
  invertDeltaColor?: boolean
}

const KPI_CONFIG: Record<BusinessHealthKpi['key'], KpiConfig> = {
  revenue: {
    icon: FileText,
    label: 'Revenue',
    href: '/invoices',
    unit: 'money',
  },
  collections: {
    icon: TrendingUp,
    label: 'Collections',
    href: '/collections',
    unit: 'money',
  },
  orders: {
    icon: Package,
    label: 'Orders',
    href: '/orders',
    unit: 'money',
  },
  outstanding: {
    icon: AlertCircle,
    label: 'Outstanding',
    href: '/finance',
    unit: 'money',
  },
  open_pipeline: {
    icon: Wallet,
    label: 'Open pipeline',
    href: '/quotes',
    unit: 'money',
  },
  dso: {
    icon: CalendarClock,
    label: 'DSO',
    href: '/finance',
    unit: 'days',
  },
}

function formatMoney(n: number): string {
  if (n === 0) return '₹0'
  // Indian short format: ₹1.2L / ₹4.5cr
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)} cr`
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

function formatDays(n: number): string {
  if (n <= 0) return '—'
  return Math.round(n).toString()
}

function DeltaChip({ delta }: { delta: KpiDelta }) {
  if (delta.direction === 'flat') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground tabular-nums">
        <Minus className="size-3" /> flat
      </span>
    )
  }
  const Icon = delta.direction === 'up' ? ArrowUpRight : ArrowDownRight
  const colorClass = delta.direction === 'up'
    ? 'text-green-700 bg-green-50'
    : 'text-red-700 bg-red-50'
  const pctLabel = delta.pct != null
    ? `${delta.pct > 0 ? '+' : ''}${delta.pct.toFixed(0)}%`
    : delta.direction === 'up' ? 'new' : '—'

  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
      colorClass,
    )}>
      <Icon className="size-3" />
      {pctLabel}
    </span>
  )
}

export function OwnerKpiStrip({ health }: { health: BusinessHealth }) {
  const keys: BusinessHealthKpi['key'][] = [
    'revenue', 'collections', 'orders',
    'outstanding', 'open_pipeline', 'dso',
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {keys.map((key) => {
        const kpi = health.kpis[key]
        const cfg = KPI_CONFIG[key]
        const Icon = cfg.icon
        const value = cfg.unit === 'money'
          ? formatMoney(kpi.value)
          : formatDays(kpi.value)

        return (
          <Link key={key} href={cfg.href} className="group">
            <Card size="sm" className="transition-shadow group-hover:shadow-sm">
              <CardContent className="pt-3 pb-3 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Icon className="size-4" />
                    <span className="text-xs font-medium uppercase tracking-wide">
                      {cfg.label}
                    </span>
                  </div>
                  {kpi.delta && <DeltaChip delta={kpi.delta} />}
                </div>
                <p className="tabular-nums text-2xl font-semibold text-foreground">{value}</p>
                {kpi.hint && (
                  <p className="text-xs text-muted-foreground tabular-nums">{kpi.hint}</p>
                )}
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
