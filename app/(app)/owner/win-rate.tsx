/**
 * WinRate — Section 8 of the Owner Dashboard (Blueprint INT-014, Slice 3).
 *
 * Win-rate is honestly null when there are no decided quotes in the period
 * (rather than displaying a misleading 0% or 100%).
 *
 * Top loss reasons surface only when the period had decided losses with a
 * recorded reason. Losses-without-reason flag appears only when non-zero —
 * it's a dunning-hygiene signal (reps closing leads as lost without recording
 * why).
 */
import { Card, CardContent } from '@/components/ui/card'
import { Target, Clock, ThumbsDown, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WinRateCycle } from '@/lib/read-models/owner-overview'

function formatMoney(n: number): string {
  if (n === 0) return '₹0'
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)} cr`
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

function rateTone(pct: number | null): { label: string; tone: string } {
  if (pct == null) return { label: 'n/a', tone: 'text-muted-foreground bg-muted border-border' }
  if (pct >= 50) return { label: 'Strong', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
  if (pct >= 30) return { label: 'Average', tone: 'text-amber-700 bg-amber-50 border-amber-200' }
  return { label: 'Below par', tone: 'text-red-700 bg-red-50 border-red-200' }
}

export function WinRate({ win }: { win: WinRateCycle }) {
  const tone = rateTone(win.win_rate_pct)
  const decidedCount = win.accepted_count + win.rejected_count

  return (
    <Card>
      <CardContent className="pt-4 pb-4 flex flex-col gap-3">
        {/* Headline rate */}
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Target className="size-4" />
              <p className="text-xs font-medium uppercase tracking-wide">Win rate</p>
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {win.win_rate_pct != null ? `${win.win_rate_pct.toFixed(0)}%` : '—'}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {win.accepted_count} won · {win.rejected_count} lost · {decidedCount} decided
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
            icon={Clock}
            label="Quote → close"
            value={win.avg_quote_cycle_days != null ? `${win.avg_quote_cycle_days.toFixed(0)}d` : '—'}
            sub="avg cycle in window"
          />
          <Stat
            icon={ThumbsDown}
            label="Lost value"
            value={formatMoney(win.rejected_value)}
            sub={`across ${win.rejected_count} quote${win.rejected_count === 1 ? '' : 's'}`}
            tone={win.rejected_value > 0 ? 'warn' : 'good'}
          />
          <Stat
            icon={Target}
            label="Won value"
            value={formatMoney(win.accepted_value)}
            sub={`across ${win.accepted_count} quote${win.accepted_count === 1 ? '' : 's'}`}
            tone={win.accepted_value > 0 ? 'good' : undefined}
          />
        </div>

        {/* Top loss reasons */}
        {win.top_loss_reasons.length > 0 && (
          <div className="border-t pt-2 flex flex-col gap-1">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Top reasons leads are lost
            </p>
            <div className="flex flex-wrap gap-1.5">
              {win.top_loss_reasons.map((r) => (
                <span key={r.label}
                  className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-[11px] tabular-nums">
                  <ThumbsDown className="size-3 text-muted-foreground" />
                  <span className="text-foreground font-medium">{r.label}</span>
                  <span className="text-muted-foreground">· {r.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Hygiene flag — only when present */}
        {win.losses_without_reason > 0 && (
          <div className="flex items-center gap-2 border-t pt-2 text-xs">
            <AlertTriangle className="size-3.5 text-amber-600 shrink-0" />
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{win.losses_without_reason}</span> lead{win.losses_without_reason === 1 ? ' was' : 's were'} closed as lost without recording a reason — coaching signal.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({
  icon: Icon, label, value, sub, tone,
}: {
  icon: typeof Target
  label: string
  value: string
  sub: string
  tone?: 'warn' | 'good'
}) {
  const valueClass = tone === 'warn' && value !== '₹0'
    ? 'text-red-700'
    : tone === 'good' && value !== '₹0'
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
