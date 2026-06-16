import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, Truck } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function DealerOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS automatically restricts to this dealer's orders
  const [{ data: order }, { data: history }, { data: dispatches }] = await Promise.all([
    supabase
      .from('sales_order')
      .select(
        `id, order_number, value, order_date, expected_delivery_at, notes, created_at,
         stage:current_stage_id(id, stage_key, label, color, order_index, is_terminal),
         lines:sales_order_line(id, product_name, sku_code, unit, quantity, unit_price, line_total, sort_order)`
      )
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('sales_order_stage_history')
      .select('id, remark, created_at, from_stage:from_stage_id(label, color), to_stage:to_stage_id(label, color)')
      .eq('sales_order_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('dispatch')
      .select(
        `id, dispatch_number, scheduled_at, dispatched_at, delivered_at, vehicle_number,
         stage:current_stage_id(label, color)`
      )
      .eq('sales_order_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])

  if (!order) notFound()

  const stage = (Array.isArray(order.stage) ? order.stage[0] : order.stage) as
    | { id: string; stage_key: string; label: string; color: string; order_index: number; is_terminal: boolean }
    | null

  type Line = { id: string; product_name: string; sku_code: string; unit: string; quantity: number; unit_price: number; line_total: number; sort_order: number }
  const lines = ((order.lines ?? []) as Line[]).sort((a, b) => a.sort_order - b.sort_order)

  type Dispatch = { id: string; dispatch_number: string; scheduled_at: string | null; dispatched_at: string | null; delivered_at: string | null; vehicle_number: string | null; stage: { label: string; color: string } | { label: string; color: string }[] | null }
  const dispatchList = (dispatches ?? []) as unknown as Dispatch[]

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/dealer-portal/orders" className="hover:text-foreground">My orders</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium font-mono">{order.order_number as string}</span>
      </div>

      <Card>
        <CardContent className="pt-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold font-mono">{order.order_number as string}</h1>
                {stage && (
                  <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: `${stage.color}20`, color: stage.color }}>
                    {stage.label}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground tabular-nums">
                Placed {new Date(order.order_date as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                {order.expected_delivery_at && (
                  <> · Expected delivery {new Date(order.expected_delivery_at as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Estimated total</p>
              <p className="text-2xl font-semibold tabular-nums">
                ₹{Number(order.value).toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {order.notes && (
        <Card size="sm">
          <CardContent className="pt-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm whitespace-pre-wrap">{order.notes as string}</p>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-sm font-semibold mb-2">Items</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">SKU</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qty</th>
                <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground sm:table-cell">Price</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Line total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{l.sku_code}</td>
                  <td className="px-3 py-2">
                    {l.product_name}
                    <span className="block text-xs text-muted-foreground">{l.unit}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.quantity}</td>
                  <td className="hidden px-3 py-2 text-right tabular-nums text-muted-foreground sm:table-cell">
                    ₹{Number(l.unit_price).toLocaleString('en-IN')}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">₹{Number(l.line_total).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30">
                <td colSpan={4} className="px-3 py-2 text-right text-sm font-medium text-muted-foreground">Total</td>
                <td className="px-3 py-2 text-right text-base font-semibold tabular-nums">
                  ₹{Number(order.value).toLocaleString('en-IN')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Dispatch info — visible to dealer via Step 4 RLS */}
      {dispatchList.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Truck className="size-3.5" /> Dispatch
          </h2>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <ul className="divide-y divide-border">
              {dispatchList.map((d) => {
                const ds = Array.isArray(d.stage) ? d.stage[0] : d.stage
                return (
                  <li key={d.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs">{d.dispatch_number}</span>
                        {ds && (
                          <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: `${ds.color}20`, color: ds.color }}>
                            {ds.label}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                        {d.vehicle_number && <>Vehicle {d.vehicle_number} · </>}
                        {d.dispatched_at
                          ? <>Dispatched {new Date(d.dispatched_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>
                          : d.scheduled_at
                            ? <>Scheduled {new Date(d.scheduled_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>
                            : 'Not yet scheduled'}
                        {d.delivered_at && <> · Delivered {new Date(d.delivered_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold mb-2">Status history</h2>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {(history ?? []).length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No status changes yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(history ?? []).map((h) => {
                const from = (Array.isArray(h.from_stage) ? h.from_stage[0] : h.from_stage) as { label: string; color: string } | null
                const to = (Array.isArray(h.to_stage) ? h.to_stage[0] : h.to_stage) as { label: string; color: string } | null
                return (
                  <li key={h.id as string} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {from ? (
                        <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: `${from.color}20`, color: from.color }}>
                          {from.label}
                        </Badge>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                      <ChevronRight className="size-3.5 text-muted-foreground" />
                      {to && (
                        <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: `${to.color}20`, color: to.color }}>
                          {to.label}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {new Date(h.created_at as string).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground italic">
        To request changes or cancellation, contact Vyara&apos;s sales team.
      </p>
    </div>
  )
}
