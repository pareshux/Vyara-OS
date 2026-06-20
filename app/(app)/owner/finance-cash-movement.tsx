/**
 * FinanceCashMovement — Section 5 of the Owner Dashboard (Blueprint INT-014, Slice 2).
 *
 * Cash IN: receipts in last 30d, with delta vs prior 30d, daily avg, best day,
 * and a payment-mode split.
 *
 * Cash OUT: rendered as an honest GAP marker — we don't track outflows yet.
 * The closest tracked Blueprint item is FIN-014 (pluggable accounting adapter)
 * which would surface vendor payments. The expense module (FIN-006, shipped)
 * tracks claim outflows but not committed AP — so showing a "Net" line would
 * misrepresent the picture. Per Constitution Principle #11 (untracked code is
 * dead code), the gap is made legible rather than silently absorbed.
 *
 * Window is FIXED 30d (not period-coupled) so the section is stable across
 * the period selector — same reasoning as the DSO KPI.
 */
import { Card, CardContent } from '@/components/ui/card'
import {
  ArrowDownToLine, ArrowUpFromLine, MinusCircle,
  ArrowUpRight, ArrowDownRight, Minus, Banknote,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CashMovement, PaymentModeBreakdown } from '@/lib/read-models/owner-overview'

function formatMoney(n: number): string {
  if (n === 0) return '₹0'
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)} cr`
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

const MODE_LABEL: Record<PaymentModeBreakdown['mode'], string> = {
  cheque: 'Cheque',
  neft:   'NEFT',
  rtgs:   'RTGS',
  upi:    'UPI',
  cash:   'Cash',
  card:   'Card',
  other:  'Other',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

export function FinanceCashMovement({ cash }: { cash: CashMovement }) {
  const delta = cash.delta_30d_vs_prev
  const DeltaIcon = delta.direction === 'up' ? ArrowUpRight
                  : delta.direction === 'down' ? ArrowDownRight
                  : Minus
  const deltaColor = delta.direction === 'up' ? 'text-emerald-700 bg-emerald-50'
                   : delta.direction === 'down' ? 'text-red-700 bg-red-50'
                   : 'text-muted-foreground bg-muted'
  const pctLabel = delta.pct != null
    ? `${delta.pct > 0 ? '+' : ''}${delta.pct.toFixed(0)}%`
    : delta.direction === 'up' ? 'new' : 'flat'

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* IN card */}
      <Card>
        <CardContent className="pt-4 pb-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-emerald-700">
              <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50">
                <ArrowDownToLine className="size-4" />
              </div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Cash in · last 30 days
              </p>
            </div>
            <span className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
              deltaColor,
            )}>
              <DeltaIcon className="size-3" />
              {pctLabel}
            </span>
          </div>

          <div>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {formatMoney(cash.receipts_in_30d)}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {cash.receipt_count_30d} receipt{cash.receipt_count_30d === 1 ? '' : 's'} ·
              {' '}prev 30d {formatMoney(cash.receipts_in_prev_30d)}
            </p>
          </div>

          <div className="flex items-center justify-between text-xs tabular-nums border-t pt-2">
            <span className="text-muted-foreground">
              Avg/day <span className="text-foreground font-medium">{formatMoney(cash.daily_avg)}</span>
            </span>
            {cash.best_day && (
              <span className="text-muted-foreground">
                Best day <span className="text-foreground font-medium">{formatMoney(cash.best_day.amount)}</span>
                {' · '}{formatDate(cash.best_day.date)}
              </span>
            )}
          </div>

          {/* Payment-mode split */}
          {cash.by_mode.length > 0 && (
            <div className="border-t pt-2 flex flex-col gap-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                By payment mode
              </p>
              <div className="flex flex-wrap gap-1.5">
                {cash.by_mode.map((m) => (
                  <span key={m.mode}
                    className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-[11px] tabular-nums">
                    <Banknote className="size-3 text-muted-foreground" />
                    <span className="text-muted-foreground">{MODE_LABEL[m.mode]}</span>
                    <span className="font-medium text-foreground">{formatMoney(m.amount)}</span>
                    <span className="text-muted-foreground">· {m.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* OUT card — honest gap marker */}
      <Card className="border-dashed bg-muted/30">
        <CardContent className="pt-4 pb-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                <ArrowUpFromLine className="size-4" />
              </div>
              <p className="text-xs font-medium uppercase tracking-wide">
                Cash out · last 30 days
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <MinusCircle className="size-3" />
              Not tracked
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-sm text-foreground/80">
              Cash outflow isn&rsquo;t tracked in the system yet.
            </p>
            <p className="text-xs text-muted-foreground">
              {cash.outflow_gap.reason}
            </p>
          </div>

          {cash.outflow_gap.blueprint_id && (
            <div className="border-t pt-2">
              <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70 bg-background border border-border rounded px-1.5 py-0.5">
                {cash.outflow_gap.blueprint_id}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
