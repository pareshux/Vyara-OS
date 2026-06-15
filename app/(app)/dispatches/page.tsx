import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Truck, Tablet } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function DispatchesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: dispatches }, { data: stages }] = await Promise.all([
    supabase
      .from('dispatch')
      .select(
        `id, dispatch_number, scheduled_at, dispatched_at, delivered_at,
         lr_number, vehicle_number,
         project:project_id(id, name),
         transporter:transporter_id(name),
         order:sales_order_id(id, order_number),
         stage:current_stage_id(id, label, color, order_index)`
      )
      .is('deleted_at', null)
      .order('scheduled_at', { ascending: false }),
    supabase.from('dispatch_stage').select('id, label, color, order_index').order('order_index'),
  ])

  type Row = {
    id: string
    dispatch_number: string
    scheduled_at: string | null
    dispatched_at: string | null
    delivered_at: string | null
    lr_number: string | null
    vehicle_number: string | null
    project: { id: string; name: string } | { id: string; name: string }[] | null
    transporter: { name: string } | { name: string }[] | null
    order: { id: string; order_number: string } | { id: string; order_number: string }[] | null
    stage: { id: string; label: string; color: string; order_index: number } | { id: string; label: string; color: string; order_index: number }[] | null
  }
  const rows = (dispatches ?? []) as unknown as Row[]
  const stageCounts = (stages ?? []).map((s) => ({
    ...s,
    count: rows.filter((r) => {
      const st = Array.isArray(r.stage) ? r.stage[0] : r.stage
      return st?.id === s.id
    }).length,
  }))

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Dispatches</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {rows.length} {rows.length === 1 ? 'dispatch' : 'dispatches'}
          </p>
        </div>
        <Button size="sm" variant="outline" asChild>
          <Link href="/warehouse">
            <Tablet className="size-4 mr-1.5" />
            Warehouse view
          </Link>
        </Button>
      </div>

      {stageCounts.some((s) => s.count > 0) && (
        <div className="flex flex-wrap gap-2">
          {stageCounts.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ backgroundColor: `${s.color}20`, color: s.color }}
            >
              <span className="size-1.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
              <span className="tabular-nums font-semibold">{s.count}</span>
            </span>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Truck className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No dispatches yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Open a sales order and click <span className="font-medium">Schedule dispatch</span>.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Dispatch #</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Order</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">Project</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Stage</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground lg:table-cell">Transporter</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground lg:table-cell">Vehicle</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Scheduled</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const project = Array.isArray(r.project) ? r.project[0] : r.project
                const transporter = Array.isArray(r.transporter) ? r.transporter[0] : r.transporter
                const order = Array.isArray(r.order) ? r.order[0] : r.order
                const stage = Array.isArray(r.stage) ? r.stage[0] : r.stage
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link href={`/dispatches/${r.id}`} className="text-foreground hover:text-primary">
                        {r.dispatch_number}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {order ? (
                        <Link href={`/orders/${order.id}`} className="text-muted-foreground hover:text-foreground">
                          {order.order_number}
                        </Link>
                      ) : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="hidden px-3 py-2 md:table-cell">
                      {project ? (
                        <Link href={`/projects/${project.id}`} className="text-foreground hover:text-primary">
                          {project.name}
                        </Link>
                      ) : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {stage ? (
                        <Badge
                          variant="outline"
                          className="border-0 text-xs"
                          style={{ backgroundColor: `${stage.color}20`, color: stage.color }}
                        >
                          {stage.label}
                        </Badge>
                      ) : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="hidden px-3 py-2 text-muted-foreground lg:table-cell">
                      {transporter?.name ?? '—'}
                    </td>
                    <td className="hidden px-3 py-2 text-muted-foreground tabular-nums lg:table-cell">
                      {r.vehicle_number ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">
                      {r.scheduled_at
                        ? new Date(r.scheduled_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
