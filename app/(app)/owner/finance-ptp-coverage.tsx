/**
 * FinancePtpCoverage — Section 6 of the Owner Dashboard (Blueprint INT-014, Slice 2).
 *
 * Tells the owner two things in one card:
 *   (1) How much of overdue receivables has a payment promise sitting against it
 *       (coverage = overdue invoices with PTP / overdue invoices total)
 *   (2) Health of the dunning engine itself — promises due this week (action
 *       window) and dishonoured in the last 30 days (engine's batting average)
 *
 * Coverage % is honestly null when there are no overdue invoices to compute
 * against (rather than showing a misleading 100%). Same for the dishonoured
 * flag — it surfaces only when there's something to surface.
 */
import { Card, CardContent } from '@/components/ui/card'
import { Handshake, CalendarClock, XCircle, ShieldAlert, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PtpCoverage } from '@/lib/read-models/owner-overview'

function formatMoney(n: number): string {
  if (n === 0) return '₹0'
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)} cr`
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

function coverageTone(pct: number | null): { label: string; tone: string } {
  if (pct == null) return { label: 'n/a', tone: 'text-muted-foreground bg-muted border-border' }
  if (pct >= 70) return { label: 'Strong', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
  if (pct >= 40) return { label: 'Patchy', tone: 'text-amber-700 bg-amber-50 border-amber-200' }
  return { label: 'Thin', tone: 'text-red-700 bg-red-50 border-red-200' }
}

export function FinancePtpCoverage({ ptp }: { ptp: PtpCoverage }) {
  const tone = coverageTone(ptp.coverage_pct)
  const uncovered = ptp.overdue_total - ptp.overdue_with_ptp

  return (
    <Card>
      <CardContent className="pt-4 pb-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Handshake className="size-4" />
          <p className="text-xs font-medium uppercase tracking-wide">
            Promise-to-pay coverage
          </p>
        </div>

        {/* Headline coverage stat */}
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {ptp.coverage_pct != null ? `${ptp.coverage_pct.toFixed(0)}%` : '—'}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {ptp.overdue_with_ptp} of {ptp.overdue_total} overdue invoice{ptp.overdue_total === 1 ? '' : 's'} have a promise
            </p>
          </div>
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
            tone.tone,
          )}>
            {tone.label}
          </span>
        </div>

        {/* Sub-stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 border-t pt-3">
          <Stat
            icon={Handshake}
            label="Open promises"
            value={`${ptp.open_promise_count}`}
            sub={formatMoney(ptp.total_promised) + ' promised'}
          />
          <Stat
            icon={CalendarClock}
            label="Due this week"
            value={`${ptp.due_this_week}`}
            sub={ptp.due_this_week === 0 ? 'no PTPs landing soon' : 'expect inflows'}
            highlight={ptp.due_this_week > 0}
          />
          <Stat
            icon={uncovered > 0 ? ShieldAlert : ShieldCheck}
            label="Uncovered overdue"
            value={`${uncovered}`}
            sub={uncovered === 0 ? 'fully covered' : 'no promise in place'}
            tone={uncovered > 0 ? 'warn' : 'good'}
          />
        </div>

        {/* Honest dishonoured flag — only when there's signal */}
        {ptp.dishonoured_30d > 0 && (
          <div className="flex items-center gap-2 border-t pt-2 text-xs">
            <XCircle className="size-3.5 text-red-600 shrink-0" />
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{ptp.dishonoured_30d}</span> promise{ptp.dishonoured_30d === 1 ? '' : 's'} dishonoured in last 30 days — review dunning quality.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({
  icon: Icon, label, value, sub, highlight = false, tone,
}: {
  icon: typeof Handshake
  label: string
  value: string
  sub: string
  highlight?: boolean
  tone?: 'warn' | 'good'
}) {
  const valueClass = tone === 'warn' && value !== '0'
    ? 'text-red-700'
    : tone === 'good' && value === '0'
    ? 'text-emerald-700'
    : highlight
    ? 'text-emerald-700'
    : 'text-foreground'
  return (
    <div className="rounded-lg border bg-background p-2.5 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
      </div>
      <p className={cn('text-lg font-semibold tabular-nums', valueClass)}>{value}</p>
      <p className="text-[11px] text-muted-foreground tabular-nums truncate">{sub}</p>
    </div>
  )
}
