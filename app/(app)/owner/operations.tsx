/**
 * Operations — Section 10 of the Owner Dashboard (Blueprint INT-014, Slice 3).
 *
 * Two honest gaps surfaced as inline markers (same pattern as Attention Centre):
 *   - On-time % — needs `dispatch.expected_delivery_at` (DEL-007)
 *   - Stock at risk — needs `stock_location.safety_stock` (no Blueprint item
 *     yet, but explicit so it's discoverable)
 *
 * What we CAN compute: dispatch volume in period, current in-transit count,
 * delivered-in-period count, dispatches by current stage (labels pulled live
 * from dispatch_stage — not hardcoded), and avg scheduled→delivered cycle.
 */
import { Card, CardContent } from '@/components/ui/card'
import { Truck, MapPin, CheckCircle2, Clock, MinusCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Operations as OperationsType } from '@/lib/read-models/owner-overview'

const GAP_ICON: Record<'on_time_pct' | 'stock_at_risk', typeof MinusCircle> = {
  on_time_pct:    AlertCircle,
  stock_at_risk:  AlertCircle,
}

const GAP_TITLE: Record<'on_time_pct' | 'stock_at_risk', string> = {
  on_time_pct:    'On-time delivery %',
  stock_at_risk:  'Stock at risk',
}

export function Operations({ ops }: { ops: OperationsType }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* Live ops card */}
      <Card>
        <CardContent className="pt-4 pb-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Truck className="size-4" />
            <p className="text-xs font-medium uppercase tracking-wide">
              Dispatch ops
            </p>
          </div>

          {/* Headline counts */}
          <div className="grid grid-cols-3 gap-2">
            <KPI
              icon={Truck}
              label="Dispatches"
              value={ops.dispatch_count_period.toString()}
              sub="in period"
            />
            <KPI
              icon={MapPin}
              label="In transit"
              value={ops.in_transit_count.toString()}
              sub="right now"
              highlight={ops.in_transit_count > 0}
            />
            <KPI
              icon={CheckCircle2}
              label="Delivered"
              value={ops.delivered_count_period.toString()}
              sub="in period"
            />
          </div>

          {/* Avg cycle */}
          {ops.avg_dispatch_cycle_days != null && (
            <div className="flex items-center gap-2 border-t pt-2 text-xs">
              <Clock className="size-3.5 text-muted-foreground shrink-0" />
              <p className="text-muted-foreground">
                Avg scheduled → delivered:
                {' '}<span className="font-semibold text-foreground tabular-nums">{ops.avg_dispatch_cycle_days.toFixed(1)} days</span>
              </p>
            </div>
          )}

          {/* Stage breakdown */}
          {ops.dispatches_by_stage.length > 0 && (
            <div className="border-t pt-2 flex flex-col gap-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                By current stage
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ops.dispatches_by_stage.map((s) => (
                  <span key={s.label}
                    className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-[11px] tabular-nums">
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="font-medium text-foreground">{s.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gaps card */}
      <Card className="border-dashed bg-muted/30">
        <CardContent className="pt-4 pb-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MinusCircle className="size-4" />
            <p className="text-xs font-medium uppercase tracking-wide">
              Not tracked yet
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {ops.gaps.map((g) => {
              const Icon = GAP_ICON[g.key]
              return (
                <div key={g.key} className={cn(
                  'rounded-lg border border-dashed bg-background p-2.5 flex items-start gap-2',
                )}>
                  <Icon className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground">
                        {GAP_TITLE[g.key]}
                      </p>
                      {g.blueprint_id && (
                        <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70 bg-muted border border-border rounded px-1.5 py-0.5">
                          {g.blueprint_id}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {g.reason}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function KPI({
  icon: Icon, label, value, sub, highlight = false,
}: {
  icon: typeof Truck
  label: string
  value: string
  sub: string
  highlight?: boolean
}) {
  return (
    <div className="rounded-lg border bg-background p-2.5 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
      </div>
      <p className={cn('text-lg font-semibold tabular-nums', highlight ? 'text-emerald-700' : 'text-foreground')}>{value}</p>
      <p className="text-[11px] text-muted-foreground tabular-nums truncate">{sub}</p>
    </div>
  )
}
