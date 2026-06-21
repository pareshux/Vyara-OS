/**
 * FieldToday — Section 11 of the Owner Dashboard (Blueprint INT-014, Slice 4).
 *
 * Point-in-time snapshot of TODAY's field activity. Not period-coupled — the
 * owner reading this at 11am wants to know what's happening right now, not
 * a 30-day average. The period selector still drives the scorecards below.
 *
 * Roster of statuses + activity totals. Click the card → /field/team for the
 * full grid.
 */
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2, Home, CalendarOff, AlertCircle, MapPin, Wallet, Activity, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldToday as FieldTodayType } from '@/lib/read-models/owner-overview'

function formatMoney(n: number): string {
  if (n === 0) return '₹0'
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)} cr`
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

export function FieldToday({ today }: { today: FieldTodayType }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4 flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="size-4" />
            <p className="text-xs font-medium uppercase tracking-wide">
              Today &middot; {today.total_reps} field rep{today.total_reps === 1 ? '' : 's'}
            </p>
          </div>
          <Link
            href="/field/team"
            className="group inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Open /field/team
            <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Status row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatusCount
            icon={CheckCircle2}
            label="On duty"
            value={today.on_duty_count}
            tone="good"
          />
          <StatusCount
            icon={Home}
            label="WFH"
            value={today.wfh_count}
            tone="neutral"
          />
          <StatusCount
            icon={CalendarOff}
            label="On leave"
            value={today.leave_count}
            tone="neutral"
          />
          <StatusCount
            icon={AlertCircle}
            label="No record"
            value={today.no_record_count}
            tone={today.no_record_count > 0 ? 'warn' : 'neutral'}
          />
        </div>

        {/* Activity totals row */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 border-t pt-3">
          <Activity_Kpi
            icon={Activity}
            label="Visits done"
            value={today.visits_completed_today.toString()}
            sub={today.visits_open_today > 0 ? `${today.visits_open_today} in progress` : 'all complete'}
          />
          <Activity_Kpi
            icon={MapPin}
            label="Distance"
            value={`${today.total_km_today.toLocaleString('en-IN')} km`}
            sub="total team km"
          />
          <Activity_Kpi
            icon={Wallet}
            label="Expense"
            value={formatMoney(today.total_expense_today)}
            sub="logged today"
          />
        </div>
      </CardContent>
    </Card>
  )
}

function StatusCount({
  icon: Icon, label, value, tone,
}: {
  icon: typeof CheckCircle2
  label: string
  value: number
  tone: 'good' | 'warn' | 'neutral'
}) {
  const valueClass = tone === 'good' && value > 0
    ? 'text-emerald-700'
    : tone === 'warn' && value > 0
    ? 'text-amber-700'
    : 'text-foreground'
  return (
    <div className="rounded-lg border bg-background p-2.5 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
      </div>
      <p className={cn('text-lg font-semibold tabular-nums', valueClass)}>{value}</p>
    </div>
  )
}

function Activity_Kpi({
  icon: Icon, label, value, sub,
}: {
  icon: typeof Activity
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="rounded-lg border bg-background p-2.5 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground tabular-nums truncate">{sub}</p>
    </div>
  )
}
