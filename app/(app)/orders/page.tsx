import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Package } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function OrdersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: ordersRaw }, { data: stagesRaw }] = await Promise.all([
    supabase
      .from('sales_order')
      .select(
        `id, order_number, value, order_date, expected_delivery_at, notes,
         project:project_id(id, name),
         buyer:buyer_firm_id(name),
         stage:current_stage_id(id, label, color, order_index)`
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('order_stage')
      .select('id, label, color, order_index')
      .order('order_index'),
  ])

  type Order = {
    id: string
    order_number: string
    value: number
    order_date: string
    expected_delivery_at: string | null
    notes: string | null
    project: { id: string; name: string } | { id: string; name: string }[] | null
    buyer: { name: string } | { name: string }[] | null
    stage: { id: string; label: string; color: string; order_index: number } | { id: string; label: string; color: string; order_index: number }[] | null
  }

  const orders = (ordersRaw ?? []) as unknown as Order[]
  const stages = stagesRaw ?? []

  // Stage chip counts
  const stageCounts = stages.map((s) => ({
    ...s,
    count: orders.filter((o) => {
      const st = Array.isArray(o.stage) ? o.stage[0] : o.stage
      return st?.id === s.id
    }).length,
  }))

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Orders</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {orders.length} {orders.length === 1 ? 'order' : 'orders'}
          </p>
        </div>
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

      {orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No sales orders yet</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Mark a quote as won, then create an order from the project page — or convert
              an existing quote with the &quot;Create order&quot; action.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Order #</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Project</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground md:table-cell">Buyer</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Stage</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Value</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground lg:table-cell">Expected</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const project = Array.isArray(o.project) ? o.project[0] : o.project
                const buyer = Array.isArray(o.buyer) ? o.buyer[0] : o.buyer
                const stage = Array.isArray(o.stage) ? o.stage[0] : o.stage
                return (
                  <tr key={o.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link href={`/orders/${o.id}`} className="text-foreground hover:text-primary">
                        {o.order_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {project ? (
                        <Link href={`/projects/${project.id}`} className="text-foreground hover:text-primary">
                          {project.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {buyer?.name ?? <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {stage ? (
                        <Badge
                          variant="outline"
                          className="border-0 text-xs"
                          style={{ backgroundColor: `${stage.color}20`, color: stage.color }}
                        >
                          {stage.label}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      ₹{Number(o.value).toLocaleString('en-IN')}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground tabular-nums lg:table-cell">
                      {o.expected_delivery_at
                        ? new Date(o.expected_delivery_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : <span className="text-muted-foreground/50">—</span>}
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
