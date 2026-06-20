import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Package, PlusCircle } from 'lucide-react'
import { OrderRowActions } from './row-actions'
import { ListFilter } from '@/components/app/list-filter'

export const dynamic = 'force-dynamic'

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; buyer?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const stageFilter = sp.stage ?? null
  const buyerFilter = sp.buyer ?? null  // buyer_firm_id UUID

  const [{ data: ordersRaw }, { data: stagesRaw }] = await Promise.all([
    (async () => {
      let query = supabase
        .from('sales_order')
        .select(
          `id, order_number, value, order_date, expected_delivery_at, notes, created_via, buyer_firm_id,
           project:project_id(id, name),
           buyer:buyer_firm_id(id, name),
           stage:current_stage_id(id, stage_key, label, color, order_index, is_terminal)`
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (stageFilter) query = query.eq('current_stage_id', stageFilter)
      return query
    })(),
    supabase
      .from('order_stage')
      .select('id, stage_key, label, color, order_index, is_terminal')
      .order('order_index'),
  ])
  const cancelStageId = (stagesRaw ?? []).find((s) => s.stage_key === 'cancelled')?.id ?? null

  type Order = {
    id: string
    order_number: string
    value: number
    order_date: string
    expected_delivery_at: string | null
    notes: string | null
    created_via: string
    buyer_firm_id: string | null
    project: { id: string; name: string } | { id: string; name: string }[] | null
    buyer: { id: string; name: string } | { id: string; name: string }[] | null
    stage: { id: string; stage_key: string; label: string; color: string; order_index: number; is_terminal: boolean } | { id: string; stage_key: string; label: string; color: string; order_index: number; is_terminal: boolean }[] | null
  }

  const allOrders = (ordersRaw ?? []) as unknown as Order[]

  // Derive buyer options from the full set (before filtering)
  const buyerMap = new Map<string, string>()
  for (const o of allOrders) {
    const buyer = Array.isArray(o.buyer) ? o.buyer[0] : o.buyer
    if (o.buyer_firm_id && buyer?.name) buyerMap.set(o.buyer_firm_id, buyer.name)
  }
  const buyerOptions = [...buyerMap.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, name]) => ({ value: id, label: name }))

  // Apply filters in-memory
  let orders = allOrders
  if (buyerFilter) orders = orders.filter((o) => o.buyer_firm_id === buyerFilter)
  if (q) {
    const needle = q.toLowerCase()
    orders = orders.filter((o) => {
      const project = Array.isArray(o.project) ? o.project[0] : o.project
      const buyer = Array.isArray(o.buyer) ? o.buyer[0] : o.buyer
      return (
        o.order_number.toLowerCase().includes(needle) ||
        (project?.name ?? '').toLowerCase().includes(needle) ||
        (buyer?.name ?? '').toLowerCase().includes(needle)
      )
    })
  }

  const stages = stagesRaw ?? []

  // Stage chip counts from the full unfiltered set
  const { data: allForCounts } = await supabase
    .from('sales_order')
    .select('current_stage_id')
    .is('deleted_at', null)
  const stageCounts = stages.map((s) => ({
    ...s,
    count: (allForCounts ?? []).filter((o) => o.current_stage_id === s.id).length,
  }))

  const hasFilter = q || stageFilter || buyerFilter

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Orders</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {orders.length}{orders.length < allOrders.length ? ` of ${allOrders.length}` : ''} {orders.length === 1 ? 'order' : 'orders'}
          </p>
        </div>
        <Button size="sm" asChild>
          <Link href="/orders/new"><PlusCircle className="size-4 mr-1.5" />New order</Link>
        </Button>
      </div>

      {/* Filter bar */}
      <ListFilter
        searchPlaceholder="Search by order number, project, or buyer…"
        selects={[
          {
            key: 'stage',
            label: 'Stage',
            placeholder: 'All stages',
            options: stageCounts.map((s) => ({
              value: s.id,
              label: `${s.label} (${s.count})`,
              color: s.color,
            })),
          },
          ...(buyerOptions.length > 1
            ? [{ key: 'buyer', label: 'Buyer', placeholder: 'All buyers', options: buyerOptions }]
            : []),
        ]}
      />

      {orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">
              {hasFilter ? 'No orders match the filters' : 'No sales orders yet'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              {hasFilter
                ? 'Try clearing the filter or a different search term.'
                : 'Create a direct order, or mark a quote as won and convert it from the project page.'}
            </p>
            {!hasFilter && (
              <Button size="sm" asChild className="mt-3">
                <Link href="/orders/new"><PlusCircle className="size-4 mr-1.5" />New order</Link>
              </Button>
            )}
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
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Actions</th>
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
                      {o.created_via === 'dealer_portal' && (
                        <Badge variant="outline" className="ml-1.5 text-[9px] uppercase border-0 bg-purple-50 text-purple-700">
                          Via portal
                        </Badge>
                      )}
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
                    <td className="px-3 py-3 text-right">
                      <OrderRowActions
                        orderId={o.id}
                        orderNumber={o.order_number}
                        isTerminal={stage?.is_terminal ?? false}
                        cancelStageId={cancelStageId}
                      />
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
