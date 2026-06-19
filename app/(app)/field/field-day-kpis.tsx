import { Card, CardContent } from '@/components/ui/card'
import { MapPin, Clock, Receipt, Footprints } from 'lucide-react'
import type { FieldDayKpis } from '@/lib/read-models/field-day'

/**
 * FieldDayKpiStrip — 4 KPI cards rendered above the day's content on
 * /field and /field/team/[userId]. Reads from the field-day read-model.
 *
 *   Visits · Distance · Duration · Expenses
 *
 * Same shape on rep and manager views so the day's story reads the
 * same regardless of who's looking.
 */
export function FieldDayKpiStrip({ kpis }: { kpis: FieldDayKpis }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <KpiCard
        icon={<Footprints className="size-3.5" />}
        label="Visits"
        primary={`${kpis.visits_completed}`}
        secondary={
          kpis.visits_planned_open > 0
            ? `${kpis.visits_planned_open} planned open`
            : 'done'
        }
      />
      <KpiCard
        icon={<MapPin className="size-3.5" />}
        label="Distance"
        primary={kpis.distance_km != null ? `${kpis.distance_km} km` : '—'}
        secondary={
          kpis.vehicle_claim_amount != null
            ? `₹${kpis.vehicle_claim_amount.toLocaleString('en-IN')} claim`
            : 'no vehicle claim'
        }
      />
      <KpiCard
        icon={<Clock className="size-3.5" />}
        label="On duty"
        primary={
          kpis.duration_minutes != null
            ? `${Math.floor(kpis.duration_minutes / 60)}h ${kpis.duration_minutes % 60}m`
            : '—'
        }
        secondary={kpis.duration_minutes != null ? 'today' : 'not checked out'}
      />
      <KpiCard
        icon={<Receipt className="size-3.5" />}
        label="Expenses"
        primary={`₹${kpis.expense_total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
        secondary={
          kpis.expense_pending > 0
            ? `${kpis.expense_pending} pending approval`
            : 'all clear'
        }
      />
    </div>
  )
}

function KpiCard({
  icon,
  label,
  primary,
  secondary,
}: {
  icon: React.ReactNode
  label: string
  primary: string
  secondary: string
}) {
  return (
    <Card>
      <CardContent className="py-3 flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wide">
          {icon}
          {label}
        </div>
        <p className="text-base font-semibold tabular-nums">{primary}</p>
        <p className="text-[10px] text-muted-foreground tabular-nums">{secondary}</p>
      </CardContent>
    </Card>
  )
}
