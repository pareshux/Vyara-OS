/**
 * TopReps — Section 9 of the Owner Dashboard (Blueprint INT-014, Slice 3).
 *
 * Top 5 reps by accepted-quote ₹ in the period. Attribution = quotation.created_by
 * (the person who built the quote — matches the sales-engineer ownership model).
 * Each rep card also shows personal win rate so the owner sees both volume and
 * conversion quality.
 *
 * Honest gap: this surface is admin-only (the /owner page itself is admin-only),
 * so the per-rep ₹ figures are visible without role masking. If we ever expose
 * /owner to a manager role, this section will need PLAT-007 mask integration.
 */
import { Card, CardContent } from '@/components/ui/card'
import { Trophy, TrendingUp, Award } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TopRep } from '@/lib/read-models/owner-overview'

function formatMoney(n: number): string {
  if (n === 0) return '₹0'
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)} cr`
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

const RANK_ICON: Record<number, { icon: typeof Trophy; tone: string }> = {
  0: { icon: Trophy, tone: 'text-yellow-600 bg-yellow-50' },
  1: { icon: Award,  tone: 'text-zinc-500  bg-zinc-50' },
  2: { icon: Award,  tone: 'text-amber-700 bg-amber-50' },
}

export function TopReps({ reps }: { reps: TopRep[] }) {
  if (reps.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center flex flex-col items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Trophy className="size-5" />
          </div>
          <p className="text-sm font-medium text-foreground">No closed wins in this window.</p>
          <p className="text-sm text-muted-foreground">Try a longer period.</p>
        </CardContent>
      </Card>
    )
  }

  const totalClosed = reps.reduce((s, r) => s + r.closed_value, 0)

  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-4 py-3 border-b flex items-baseline justify-between">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Top {reps.length}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            <span className="font-semibold text-foreground">{formatMoney(totalClosed)}</span> closed across these {reps.length} rep{reps.length === 1 ? '' : 's'}
          </p>
        </div>
        <ul className="divide-y">
          {reps.map((r, idx) => {
            const cfg = RANK_ICON[idx]
            return (
              <li key={r.user_id} className="flex items-center gap-3 px-4 py-3">
                <div className={cn(
                  'flex size-8 items-center justify-center rounded-lg shrink-0',
                  cfg ? cfg.tone : 'text-muted-foreground bg-muted',
                )}>
                  {cfg
                    ? <cfg.icon className="size-4" />
                    : <span className="text-xs font-semibold tabular-nums">{idx + 1}</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {r.name}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums truncate">
                    {r.wins} win{r.wins === 1 ? '' : 's'} of {r.sent} quote{r.sent === 1 ? '' : 's'} sent
                    {r.win_rate_pct != null && (
                      <> · <span className="inline-flex items-center gap-0.5"><TrendingUp className="size-3" />{r.win_rate_pct.toFixed(0)}%</span></>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-semibold tabular-nums text-foreground">
                    {formatMoney(r.closed_value)}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
