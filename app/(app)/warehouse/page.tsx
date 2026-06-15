/**
 * Warehouse tablet view — Slice 2 Step 2
 *
 * Optimized for a 10" tablet on the warehouse floor:
 *   - Large touch targets (≥48px) per design.md §7
 *   - Single primary action per card; secondary actions in overflow
 *   - Today's and upcoming dispatches grouped by stage
 *   - No deep nav — one tap to act
 */
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Truck, Calendar } from 'lucide-react'
import { WarehouseRowActions } from './row-actions'

export const dynamic = 'force-dynamic'

export default async function WarehousePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
  const inSevenDays = new Date(today.getTime() + 7 * 86_400_000).toISOString()

  const { data: rawDispatches } = await supabase
    .from('dispatch')
    .select(
      `id, dispatch_number, lr_number, vehicle_number, driver_phone, scheduled_at,
       project:project_id(id, name, city),
       order:sales_order_id(order_number),
       transporter:transporter_id(name),
       stage:current_stage_id(id, stage_key, label, color, order_index)`
    )
    .is('deleted_at', null)
    .or('current_stage_id.not.is.null')
    // Only non-terminal stages (manually filter below since "is_terminal" isn't on dispatch row)
    .order('scheduled_at', { ascending: true })

  type Row = {
    id: string
    dispatch_number: string
    lr_number: string | null
    vehicle_number: string | null
    driver_phone: string | null
    scheduled_at: string | null
    project: { id: string; name: string; city: string | null } | { id: string; name: string; city: string | null }[] | null
    order: { order_number: string } | { order_number: string }[] | null
    transporter: { name: string } | { name: string }[] | null
    stage: { id: string; stage_key: string; label: string; color: string; order_index: number } | { id: string; stage_key: string; label: string; color: string; order_index: number }[] | null
  }

  const rows = (rawDispatches ?? []) as unknown as Row[]
  const active = rows.filter((r) => {
    const st = Array.isArray(r.stage) ? r.stage[0] : r.stage
    return st?.stage_key !== 'closed' && st?.stage_key !== 'cancelled' && st?.stage_key !== 'pod_uploaded'
  })

  const todayList = active.filter((r) => {
    if (!r.scheduled_at) return false
    return r.scheduled_at >= todayStart && r.scheduled_at < inSevenDays
  })

  // Group by stage_key
  type Norm = {
    id: string
    dispatch_number: string
    lr_number: string | null
    vehicle_number: string | null
    driver_phone: string | null
    scheduled_at: string | null
    project_name: string
    project_city: string | null
    order_number: string
    transporter_name: string | null
    stage_key: string
    stage_label: string
    stage_color: string
  }
  const normalize = (r: Row): Norm => {
    const p = Array.isArray(r.project) ? r.project[0] : r.project
    const o = Array.isArray(r.order) ? r.order[0] : r.order
    const t = Array.isArray(r.transporter) ? r.transporter[0] : r.transporter
    const s = Array.isArray(r.stage) ? r.stage[0] : r.stage
    return {
      id: r.id,
      dispatch_number: r.dispatch_number,
      lr_number: r.lr_number,
      vehicle_number: r.vehicle_number,
      driver_phone: r.driver_phone,
      scheduled_at: r.scheduled_at,
      project_name: p?.name ?? '—',
      project_city: p?.city ?? null,
      order_number: o?.order_number ?? '—',
      transporter_name: t?.name ?? null,
      stage_key: s?.stage_key ?? '',
      stage_label: s?.label ?? '',
      stage_color: s?.color ?? '#94a3b8',
    }
  }

  const groups: Record<string, Norm[]> = { scheduled: [], in_transit: [], delivered: [] }
  for (const r of todayList) {
    const n = normalize(r)
    if (groups[n.stage_key]) groups[n.stage_key].push(n)
  }

  return (
    <div className="p-6 flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Truck className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Warehouse — today &amp; week ahead</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {active.length} active · {todayList.length} in next 7 days
          </p>
        </div>
      </div>

      <Section
        title="To dispatch"
        keyName="scheduled"
        items={groups.scheduled}
        emptyText="Nothing scheduled to leave today."
      />

      <Section
        title="In transit"
        keyName="in_transit"
        items={groups.in_transit}
        emptyText="No vehicles in transit."
      />

      <Section
        title="Delivered — POD pending"
        keyName="delivered"
        items={groups.delivered}
        emptyText="Nothing waiting for POD."
      />

      {todayList.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="size-8 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium">No active dispatches in the next 7 days.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Open an order &amp; click <span className="font-medium">Schedule dispatch</span>.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Section({
  title,
  keyName,
  items,
  emptyText,
}: {
  title: string
  keyName: 'scheduled' | 'in_transit' | 'delivered'
  items: Array<{
    id: string
    dispatch_number: string
    lr_number: string | null
    vehicle_number: string | null
    driver_phone: string | null
    scheduled_at: string | null
    project_name: string
    project_city: string | null
    order_number: string
    transporter_name: string | null
    stage_label: string
    stage_color: string
  }>
  emptyText: string
}) {
  if (items.length === 0) return null
  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        {title}
        <span className="text-xs text-muted-foreground tabular-nums">({items.length})</span>
      </h2>
      <div className="flex flex-col gap-3">
        {items.map((d) => (
          <Card key={d.id} size="sm">
            <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm text-foreground">{d.dispatch_number}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="font-mono text-xs text-muted-foreground">{d.order_number}</span>
                  <Badge
                    variant="outline"
                    className="border-0 text-xs"
                    style={{ backgroundColor: `${d.stage_color}20`, color: d.stage_color }}
                  >
                    {d.stage_label}
                  </Badge>
                </div>
                <p className="text-base font-medium text-foreground mt-1 truncate">
                  {d.project_name}
                  {d.project_city && <span className="text-muted-foreground"> · {d.project_city}</span>}
                </p>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground tabular-nums">
                  {d.transporter_name && <span>Transporter: {d.transporter_name}</span>}
                  {d.vehicle_number && <span>Vehicle: {d.vehicle_number}</span>}
                  {d.lr_number && <span>LR: {d.lr_number}</span>}
                  {d.scheduled_at && (
                    <span>{new Date(d.scheduled_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  )}
                </div>
              </div>
              <WarehouseRowActions dispatchId={d.id} stageKey={keyName} />
            </CardContent>
          </Card>
        ))}
      </div>
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground italic">{emptyText}</p>
      )}
    </section>
  )
}
