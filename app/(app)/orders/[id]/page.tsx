import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, FileText, Truck } from 'lucide-react'
import { OrderStageActions } from './stage-actions'
import { ScheduleDispatchButton } from './schedule-dispatch-sheet'

export const dynamic = 'force-dynamic'

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: order }, { data: allStages }, { data: history }, { data: dispatchesRaw }, { data: reservationsRaw }] = await Promise.all([
    supabase
      .from('sales_order')
      .select(
        `id, order_number, value, order_date, expected_delivery_at, notes, created_at,
         project:project_id(id, name, segment),
         buyer:buyer_firm_id(name, gstin, city),
         owner:owner_id(full_name),
         quote:quote_id(id, quotation_number),
         stage:current_stage_id(id, stage_key, label, color, order_index),
         lines:sales_order_line(id, product_id, product_name, sku_code, unit, quantity, unit_price, line_total, sort_order)`
      )
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase.from('order_stage').select('id, stage_key, label, color, order_index, is_terminal').order('order_index'),
    supabase
      .from('sales_order_stage_history')
      .select('id, remark, created_at, from_stage:from_stage_id(label, color), to_stage:to_stage_id(label, color), actor:actor_id(id)')
      .eq('sales_order_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('dispatch')
      .select('id, dispatch_number, scheduled_at, delivered_at, stage:current_stage_id(label, color)')
      .eq('sales_order_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    // Active reservations for this order's lines
    (async () => {
      const { data: lineRows } = await supabase.from('sales_order_line').select('id').eq('sales_order_id', id)
      const lineIds = (lineRows ?? []).map((l) => l.id)
      if (lineIds.length === 0) return { data: [] }
      return supabase
        .from('stock_reservation')
        .select('id, related_entity_id, quantity, status, warehouse:warehouse_id(code)')
        .eq('related_entity_type', 'sales_order_line')
        .in('related_entity_id', lineIds)
        .eq('status', 'active')
    })(),
  ])

  if (!order) notFound()

  const stage = (Array.isArray(order.stage) ? order.stage[0] : order.stage) as
    | { id: string; stage_key: string; label: string; color: string; order_index: number }
    | null
  const project = (Array.isArray(order.project) ? order.project[0] : order.project) as
    | { id: string; name: string; segment: string }
    | null
  const buyer = (Array.isArray(order.buyer) ? order.buyer[0] : order.buyer) as
    | { name: string; gstin: string | null; city: string | null }
    | null
  const owner = (Array.isArray(order.owner) ? order.owner[0] : order.owner) as
    | { full_name: string }
    | null
  const quote = (Array.isArray(order.quote) ? order.quote[0] : order.quote) as
    | { id: string; quotation_number: string }
    | null

  const stages = allStages ?? []
  type LineRow = { id: string; product_id: string | null; product_name: string; sku_code: string; unit: string; quantity: number; unit_price: number; line_total: number; sort_order: number }
  const lines = ((order.lines ?? []) as LineRow[]).sort((a, b) => a.sort_order - b.sort_order)

  // Index reservations by order_line_id for the line-items table
  type Reservation = { id: string; related_entity_id: string; quantity: number; status: string; warehouse: { code: string } | { code: string }[] | null }
  const reservations = (reservationsRaw ?? []) as unknown as Reservation[]
  const resByLine = Object.fromEntries(reservations.map((r) => [r.related_entity_id, r]))
  type ReservationStatus = { label: string; color: string; bg: string; reservedQty: number; warehouseCode: string | null }
  const reservationStatusFor = (line: LineRow): ReservationStatus => {
    const r = resByLine[line.id]
    if (!r) return { label: 'Back-order', color: '#B91C1C', bg: '#FEE2E2', reservedQty: 0, warehouseCode: null }
    const wh = Array.isArray(r.warehouse) ? r.warehouse[0] : r.warehouse
    const qty = Number(r.quantity)
    const requested = Number(line.quantity)
    if (qty >= requested) return { label: 'Reserved', color: '#15803D', bg: '#DCFCE7', reservedQty: qty, warehouseCode: wh?.code ?? null }
    return { label: `Partial (${qty}/${requested})`, color: '#B45309', bg: '#FEF3C7', reservedQty: qty, warehouseCode: wh?.code ?? null }
  }
  const totalRequested = lines.reduce((s, l) => s + Number(l.quantity), 0)
  const totalReserved = lines.reduce((s, l) => s + (resByLine[l.id] ? Number(resByLine[l.id].quantity) : 0), 0)
  const fulfilment: { label: string; color: string; bg: string } = totalReserved === 0
    ? { label: 'Back-order risk', color: '#B91C1C', bg: '#FEE2E2' }
    : totalReserved >= totalRequested
    ? { label: 'Fully reserved', color: '#15803D', bg: '#DCFCE7' }
    : { label: 'Partial reservation', color: '#B45309', bg: '#FEF3C7' }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/orders" className="hover:text-foreground transition-colors">Orders</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium font-mono">{order.order_number}</span>
      </div>

      <Card>
        <CardContent className="pt-4 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold text-foreground font-mono">{order.order_number}</h1>
                {stage && (
                  <Badge
                    variant="outline"
                    className="border-0 text-xs"
                    style={{ backgroundColor: `${stage.color}20`, color: stage.color }}
                  >
                    {stage.label}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                {project && (
                  <Link href={`/projects/${project.id}`} className="hover:text-foreground">
                    {project.name}
                  </Link>
                )}
                {owner && <span>· {owner.full_name}</span>}
                {quote && (
                  <Link href={`/projects/${project?.id ?? ''}#quotes`} className="hover:text-foreground inline-flex items-center gap-1">
                    <FileText className="size-3" /> {quote.quotation_number}
                  </Link>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total value</p>
              <p className="text-2xl font-semibold tabular-nums">
                ₹{Number(order.value).toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          {stages.length > 0 && stage && (
            <div className="flex items-center gap-2 flex-wrap">
              <OrderStageActions
                orderId={order.id}
                currentStageId={stage.id}
                stages={stages}
              />
              {!stage.label.toLowerCase().includes('cancel') && (
                <ScheduleDispatchButton
                  orderId={order.id}
                  lines={lines.map((l) => ({
                    id: l.id,
                    product_name: l.product_name,
                    sku_code: l.sku_code,
                    unit: l.unit,
                    quantity: Number(l.quantity),
                  }))}
                />
              )}
              <Badge
                variant="outline"
                className="border-0 text-xs ml-auto"
                style={{ backgroundColor: fulfilment.bg, color: fulfilment.color }}
              >
                {fulfilment.label}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card size="sm">
          <CardContent className="pt-3 flex flex-col gap-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Order details</p>
            <div className="flex flex-col gap-2 text-sm">
              <Row label="Order date" value={new Date(order.order_date as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} />
              <Row
                label="Expected delivery"
                value={order.expected_delivery_at
                  ? new Date(order.expected_delivery_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                  : '—'}
              />
              <Row label="Created" value={new Date(order.created_at as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} />
              {order.notes && (
                <div className="mt-1 pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{order.notes}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-3 flex flex-col gap-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Buyer</p>
            <div className="flex flex-col gap-2 text-sm">
              <Row label="Name" value={buyer?.name ?? '—'} />
              <Row label="City" value={buyer?.city ?? '—'} />
              <Row label="GSTIN" value={buyer?.gstin ?? '—'} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2">Line items</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">SKU</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qty</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Reservation</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Price</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Line total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const rs = reservationStatusFor(l)
                return (
                  <tr key={l.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{l.sku_code}</td>
                    <td className="px-3 py-2 text-foreground">
                      {l.product_name}
                      <span className="block text-xs text-muted-foreground">{l.unit}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.quantity}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: rs.bg, color: rs.color }}>
                        {rs.label}
                      </Badge>
                      {rs.warehouseCode && (
                        <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">@ {rs.warehouseCode}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">₹{Number(l.unit_price).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">₹{Number(l.line_total).toLocaleString('en-IN')}</td>
                  </tr>
                )
              })}
              {lines.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">No line items</td></tr>
              )}
            </tbody>
            {lines.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30">
                  <td colSpan={5} className="px-3 py-2 text-right text-sm font-medium text-muted-foreground">Total</td>
                  <td className="px-3 py-2 text-right text-base font-semibold tabular-nums">
                    ₹{Number(order.value).toLocaleString('en-IN')}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
          <Truck className="size-3.5 text-muted-foreground" /> Dispatches
        </h2>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {(dispatchesRaw ?? []).length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No dispatches yet for this order.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(dispatchesRaw ?? []).map((d) => {
                const s = (Array.isArray(d.stage) ? d.stage[0] : d.stage) as { label: string; color: string } | null
                return (
                  <li key={d.id as string} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                    <Link href={`/dispatches/${d.id}`} className="font-mono text-xs text-foreground hover:text-primary flex-1 min-w-0 truncate">
                      {d.dispatch_number as string}
                    </Link>
                    {s && (
                      <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: `${s.color}20`, color: s.color }}>
                        {s.label}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {d.scheduled_at
                        ? new Date(d.scheduled_at as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                        : '—'}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2">Stage history</h2>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {(history ?? []).length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No history yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(history ?? []).map((h) => {
                const from = (Array.isArray(h.from_stage) ? h.from_stage[0] : h.from_stage) as { label: string; color: string } | null
                const to = (Array.isArray(h.to_stage) ? h.to_stage[0] : h.to_stage) as { label: string; color: string } | null
                return (
                  <li key={h.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {from ? (
                        <Badge
                          variant="outline"
                          className="border-0 text-xs"
                          style={{ backgroundColor: `${from.color}20`, color: from.color }}
                        >
                          {from.label}
                        </Badge>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                      <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                      {to && (
                        <Badge
                          variant="outline"
                          className="border-0 text-xs"
                          style={{ backgroundColor: `${to.color}20`, color: to.color }}
                        >
                          {to.label}
                        </Badge>
                      )}
                      {h.remark && (
                        <span className="text-muted-foreground truncate italic">— {h.remark}</span>
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
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  )
}
