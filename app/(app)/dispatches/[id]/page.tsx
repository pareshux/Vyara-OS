import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, Truck, FileImage } from 'lucide-react'
import { DispatchActions } from './dispatch-actions'

export const dynamic = 'force-dynamic'

export default async function DispatchDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: dispatch }, { data: stages }, { data: history }] = await Promise.all([
    supabase
      .from('dispatch')
      .select(
        `id, dispatch_number, lr_number, vehicle_number, driver_phone,
         scheduled_at, dispatched_at, delivered_at,
         pod_url, pod_signature_name, pod_uploaded_at, notes, created_at,
         project:project_id(id, name),
         order:sales_order_id(id, order_number, value),
         transporter:transporter_id(id, name, phone),
         owner:owner_id(full_name),
         stage:current_stage_id(id, stage_key, label, color, order_index, is_terminal),
         lines:dispatch_line(id, product_name, sku_code, unit, quantity, sort_order)`
      )
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase.from('dispatch_stage').select('id, stage_key, label, color, order_index, is_terminal').order('order_index'),
    supabase
      .from('dispatch_stage_history')
      .select('id, remark, created_at, from_stage:from_stage_id(label, color), to_stage:to_stage_id(label, color)')
      .eq('dispatch_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (!dispatch) notFound()

  const stage = (Array.isArray(dispatch.stage) ? dispatch.stage[0] : dispatch.stage) as
    | { id: string; stage_key: string; label: string; color: string; order_index: number; is_terminal: boolean }
    | null
  const project = (Array.isArray(dispatch.project) ? dispatch.project[0] : dispatch.project) as
    | { id: string; name: string } | null
  const order = (Array.isArray(dispatch.order) ? dispatch.order[0] : dispatch.order) as
    | { id: string; order_number: string; value: number } | null
  const transporter = (Array.isArray(dispatch.transporter) ? dispatch.transporter[0] : dispatch.transporter) as
    | { id: string; name: string; phone: string | null } | null
  const owner = (Array.isArray(dispatch.owner) ? dispatch.owner[0] : dispatch.owner) as { full_name: string } | null

  type Line = { id: string; product_name: string; sku_code: string; unit: string; quantity: number; sort_order: number }
  const lines = ((dispatch.lines ?? []) as Line[]).sort((a, b) => a.sort_order - b.sort_order)

  let podPublicUrl: string | null = null
  if (dispatch.pod_url) {
    const { data: signed } = await supabase.storage
      .from('dispatch-pod')
      .createSignedUrl(dispatch.pod_url, 3600)
    podPublicUrl = signed?.signedUrl ?? null
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/dispatches" className="hover:text-foreground">Dispatches</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium font-mono">{dispatch.dispatch_number}</span>
      </div>

      <Card>
        <CardContent className="pt-4 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold font-mono">{dispatch.dispatch_number}</h1>
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
                {project && <Link href={`/projects/${project.id}`} className="hover:text-foreground">{project.name}</Link>}
                {order && (
                  <Link href={`/orders/${order.id}`} className="hover:text-foreground inline-flex items-center gap-1">
                    <Truck className="size-3" /> {order.order_number}
                  </Link>
                )}
                {owner && <span>· {owner.full_name}</span>}
              </div>
            </div>
            {order && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Order value</p>
                <p className="text-lg font-semibold tabular-nums">
                  ₹{Number(order.value).toLocaleString('en-IN')}
                </p>
              </div>
            )}
          </div>

          <DispatchActions
            dispatchId={dispatch.id}
            stageKey={stage?.stage_key ?? ''}
            isTerminal={stage?.is_terminal ?? false}
            podUrl={dispatch.pod_url as string | null}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card size="sm">
          <CardContent className="pt-3 flex flex-col gap-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Logistics</p>
            <div className="flex flex-col gap-2 text-sm">
              <Row label="Transporter" value={transporter?.name ?? '—'} />
              <Row label="LR number" value={dispatch.lr_number ?? '—'} />
              <Row label="Vehicle" value={dispatch.vehicle_number ?? '—'} />
              <Row label="Driver phone" value={dispatch.driver_phone ?? '—'} />
              <Row label="Scheduled" value={dispatch.scheduled_at
                ? new Date(dispatch.scheduled_at as string).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                : '—'} />
              <Row label="Dispatched" value={dispatch.dispatched_at
                ? new Date(dispatch.dispatched_at as string).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                : '—'} />
              <Row label="Delivered" value={dispatch.delivered_at
                ? new Date(dispatch.delivered_at as string).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                : '—'} />
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-3 flex flex-col gap-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Proof of delivery</p>
            {podPublicUrl ? (
              <div className="flex flex-col gap-2">
                <a
                  href={podPublicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <FileImage className="size-4" />
                  View attached POD
                </a>
                {dispatch.pod_signature_name && (
                  <p className="text-xs text-muted-foreground">
                    Received by <span className="font-medium text-foreground">{dispatch.pod_signature_name}</span>
                    {dispatch.pod_uploaded_at && (
                      <> on {new Date(dispatch.pod_uploaded_at as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</>
                    )}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No POD captured yet. Use the warehouse view or the &quot;Upload POD&quot; action above.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Items shipped</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">SKU</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qty</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Unit</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{l.sku_code}</td>
                  <td className="px-3 py-2">{l.product_name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.quantity}</td>
                  <td className="px-3 py-2 text-muted-foreground">{l.unit}</td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">No lines captured</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Stage history</h2>
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
                      {h.remark && (
                        <span className="text-muted-foreground italic truncate">— {h.remark}</span>
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
