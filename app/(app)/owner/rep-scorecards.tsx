/**
 * RepScorecards — Section 13 of the Owner Dashboard (Blueprint INT-014, Slice 4).
 *
 * Top 5 reps by visits-with-outcome in period. Completion % surfaced as a
 * coaching signal (visits opened but not closed); honestly null when 0 opened.
 *
 * Honest gap: visit → win attribution is NOT computed here (no FK from
 * field_visit to quotation). Ranking by visits-with-outcome only. Adding a
 * "closed ₹ attributed to this rep's field visits" column would require
 * traversal via subject (lead.won_at, project terminal stage) — saved for
 * Slice 5 (drill-downs) or beyond.
 */
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Activity, MapPin, Wallet, Trophy, Award, MinusCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RepScorecard } from '@/lib/read-models/owner-overview'

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

function completionTone(pct: number | null): string {
  if (pct == null) return 'text-muted-foreground bg-muted border-border'
  if (pct >= 70) return 'text-emerald-700 bg-emerald-50 border-emerald-200'
  if (pct >= 40) return 'text-amber-700 bg-amber-50 border-amber-200'
  return 'text-red-700 bg-red-50 border-red-200'
}

export function RepScorecards({ scorecards }: { scorecards: RepScorecard[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Card>
        <CardContent className="p-0">
          {scorecards.length === 0 ? (
            <div className="py-8 text-center flex flex-col items-center gap-2">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Activity className="size-5" />
              </div>
              <p className="text-sm font-medium text-foreground">No field activity in this period.</p>
              <p className="text-sm text-muted-foreground">Try a longer period.</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Top {scorecards.length} by visits with outcome
                </p>
              </div>
              <ul className="divide-y">
                {scorecards.map((s, idx) => {
                  const cfg = RANK_ICON[idx]
                  return (
                    <li key={s.user_id}>
                      <Link
                        href={s.drill_href}
                        className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                      >
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
                            {s.name}
                          </p>
                          <p className="text-xs text-muted-foreground tabular-nums flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1">
                              <Activity className="size-3" />
                              {s.visits_completed} of {s.visits_opened} visits
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3" />
                              {s.total_km.toLocaleString('en-IN')}km
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Wallet className="size-3" />
                              {formatMoney(s.total_expense)}
                            </span>
                            <span>· {s.on_duty_days} days on duty</span>
                          </p>
                        </div>
                        {s.completion_pct != null && (
                          <span className={cn(
                            'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
                            completionTone(s.completion_pct),
                          )}>
                            {s.completion_pct.toFixed(0)}% complete
                          </span>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {/* Honest gap card — live GPS won't be built */}
      <Card className="border-dashed bg-muted/30">
        <CardContent className="pt-4 pb-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MinusCircle className="size-4" />
            <p className="text-xs font-medium uppercase tracking-wide">
              Not tracked yet
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <GapItem
              title="Live GPS / continuous location"
              reason="Only check-in/out points are stored — continuous tracking is not in scope (privacy + battery)."
              blueprintId="FLD-023"
            />
            <GapItem
              title="Visit → closed ₹ attribution"
              reason="No FK from field_visit to quotation. Ranking by visits-with-outcome only; closed-₹ attribution needs subject-traversal (saved for Slice 5)."
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function GapItem({
  title, reason, blueprintId,
}: { title: string; reason: string; blueprintId?: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-background p-2.5 flex items-start gap-2">
      <MinusCircle className="size-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {blueprintId && (
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70 bg-muted border border-border rounded px-1.5 py-0.5">
              {blueprintId}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{reason}</p>
      </div>
    </div>
  )
}
