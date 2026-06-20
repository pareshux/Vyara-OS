/**
 * RevenueFunnel — Section 7 of the Owner Dashboard (Blueprint INT-014, Slice 3).
 *
 * 4-stage funnel — open leads → sent quotes → accepted quotes → won leads —
 * with conversion % between each transition. Period-coupled (matches the
 * selector at the top of the page). Each stage drills into the underlying list.
 *
 * Conversions can exceed 100% on a noisy short window (e.g. wins from leads
 * created before the window) — we floor at 0 but don't cap at 100, surfacing
 * the noise rather than hiding it. Tooltip on the % chip explains the math.
 */
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Users, FileText, Handshake, Trophy, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RevenueFunnel as RevenueFunnelType, FunnelStage } from '@/lib/read-models/owner-overview'

const STAGE_ICON: Record<FunnelStage['key'], typeof Users> = {
  open_leads:       Users,
  sent_quotes:      FileText,
  accepted_quotes:  Handshake,
  won_leads:        Trophy,
}

function formatMoney(n: number): string {
  if (n === 0) return '₹0'
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)} cr`
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

function convTone(pct: number | null): string {
  if (pct == null) return 'text-muted-foreground bg-muted border-border'
  if (pct >= 60) return 'text-emerald-700 bg-emerald-50 border-emerald-200'
  if (pct >= 30) return 'text-amber-700 bg-amber-50 border-amber-200'
  return 'text-red-700 bg-red-50 border-red-200'
}

export function RevenueFunnel({ funnel }: { funnel: RevenueFunnelType }) {
  const maxCount = Math.max(1, ...funnel.stages.map((s) => s.count))
  const hasAny = funnel.stages.some((s) => s.count > 0)

  if (!hasAny) {
    return (
      <Card>
        <CardContent className="py-8 text-center flex flex-col items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Users className="size-5" />
          </div>
          <p className="text-sm font-medium text-foreground">No commercial activity in this window.</p>
          <p className="text-sm text-muted-foreground">Try a longer period.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="pt-4 pb-4 flex flex-col gap-3">
        {funnel.stages.map((stage, idx) => {
          const Icon = STAGE_ICON[stage.key]
          const widthPct = (stage.count / maxCount) * 100
          const nextConv = funnel.conversions[idx]
          return (
            <div key={stage.key}>
              <Link href={stage.drill_href} className="group block">
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0">
                    <Icon className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {stage.label}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {stage.value != null && stage.value > 0 && (
                          <span className="text-foreground font-medium">{formatMoney(stage.value)}</span>
                        )}
                      </p>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/70 transition-all group-hover:bg-primary"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-base font-semibold text-foreground min-w-[3ch] text-right">
                        {stage.count}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
              {/* Conversion chip between stages */}
              {nextConv && idx < funnel.stages.length - 1 && (
                <div className="flex items-center gap-2 ml-11 mt-1 mb-0.5">
                  <ChevronRight className="size-3 text-muted-foreground" />
                  <span className={cn(
                    'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
                    convTone(nextConv.pct),
                  )}
                    title={`Conversion from ${stage.label.toLowerCase()} to next stage`}
                  >
                    {nextConv.pct == null ? 'n/a' : `${nextConv.pct.toFixed(0)}% convert`}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
