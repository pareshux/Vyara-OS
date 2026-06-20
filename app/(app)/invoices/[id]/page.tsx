import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, MessageSquare } from 'lucide-react'
import { InvoiceActions } from './invoice-actions'

export const dynamic = 'force-dynamic'

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  draft:        { bg: '#F3F4F6', color: '#6B7280', label: 'Draft' },
  sent:         { bg: '#DBEAFE', color: '#1D4ED8', label: 'Sent' },
  paid:         { bg: '#DCFCE7', color: '#15803D', label: 'Paid' },
  partial_paid: { bg: '#FEF3C7', color: '#B45309', label: 'Partial paid' },
  cancelled:    { bg: '#F3F4F6', color: '#6B7280', label: 'Cancelled' },
  written_off:  { bg: '#FEE2E2', color: '#B91C1C', label: 'Written off' },
}

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: invoice }, { data: ageing }, { data: collectionRow }] = await Promise.all([
    supabase
      .from('invoice')
      .select(
        `id, invoice_number, external_invoice_number, source, source_metadata, synced_at,
         invoice_date, due_date, payment_terms_days,
         subtotal, gst_pct, gst_amount, total, retention_pct, retention_amount, retention_released_at,
         billed_amount, paid_amount,
         is_running_bill, running_bill_seq, is_final_bill, status, notes, created_at,
         project:project_id(id, name),
         order:sales_order_id(id, order_number),
         buyer:buyer_firm_id(id, name, gstin, city),
         lines:invoice_line(id, description, sku_code, quantity, unit, unit_price, line_total, sort_order)`
      )
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase.from('invoice_ageing_v').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('collection')
      .select('id')
      .eq('invoice_id', id)
      .is('deleted_at', null)
      .maybeSingle(),
  ])

  // collection_activity is keyed by collection_id (not invoice_id) — fetch only when collection exists
  const { data: dunningActivity } = collectionRow
    ? await supabase
        .from('collection_activity')
        .select('id, channel, template_key, outcome, notes, payload, created_at')
        .eq('collection_id', collectionRow.id)
        .order('created_at', { ascending: false })
        .limit(20)
    : { data: null }

  if (!invoice) notFound()

  const project = (Array.isArray(invoice.project) ? invoice.project[0] : invoice.project) as { id: string; name: string } | null
  const order = (Array.isArray(invoice.order) ? invoice.order[0] : invoice.order) as { id: string; order_number: string } | null
  const buyer = (Array.isArray(invoice.buyer) ? invoice.buyer[0] : invoice.buyer) as { id: string; name: string; gstin: string | null; city: string | null } | null

  type Line = { id: string; description: string; sku_code: string | null; quantity: number | null; unit: string | null; unit_price: number | null; line_total: number; sort_order: number }
  const lines = ((invoice.lines ?? []) as Line[]).sort((a, b) => a.sort_order - b.sort_order)

  const ageingRow = ageing as null | { days_overdue: number; ageing_bucket: string; outstanding: number }
  const status = invoice.status as string
  const ss = STATUS_COLORS[status] ?? STATUS_COLORS.draft

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/invoices" className="hover:text-foreground">Invoices</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium font-mono">{invoice.invoice_number as string}</span>
      </div>

      <Card>
        <CardContent className="pt-4 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold font-mono">{invoice.invoice_number as string}</h1>
                <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: ss.bg, color: ss.color }}>
                  {ss.label}
                </Badge>
                {invoice.is_running_bill && (
                  <Badge variant="outline" className="text-xs">
                    RA-Bill {invoice.running_bill_seq ?? '?'}{invoice.is_final_bill ? ' (final)' : ''}
                  </Badge>
                )}
                <Badge variant="secondary" className="text-[10px] uppercase">{invoice.source as string}</Badge>
              </div>
              {invoice.external_invoice_number && (
                <p className="text-xs text-muted-foreground font-mono">External: {invoice.external_invoice_number as string}</p>
              )}
              <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                {project && <Link href={`/projects/${project.id}`} className="hover:text-foreground">{project.name}</Link>}
                {order && <Link href={`/orders/${order.id}`} className="hover:text-foreground">Order: {order.order_number}</Link>}
                {buyer && <span>Buyer: <span className="text-foreground">{buyer.name}</span></span>}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className="text-2xl font-semibold tabular-nums text-primary">
                ₹{Number(ageingRow?.outstanding ?? (Number(invoice.billed_amount) - Number(invoice.paid_amount))).toLocaleString('en-IN')}
              </p>
              {ageingRow && ageingRow.days_overdue > 0 && (
                <p className="text-xs text-destructive tabular-nums">{ageingRow.days_overdue} days overdue</p>
              )}
            </div>
          </div>

          <InvoiceActions
            invoiceId={invoice.id as string}
            status={status}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Money label="Subtotal" value={invoice.subtotal as number} />
        <Money label={`GST (${Number(invoice.gst_pct)}%)`} value={invoice.gst_amount as number} />
        <Money label="Total" value={invoice.total as number} bold />
        <Money label={`Retention (${Number(invoice.retention_pct)}%)`} value={invoice.retention_amount as number} muted />
        <Money label="Billed amount" value={invoice.billed_amount as number} bold accent="primary" />
        <Money label="Paid" value={invoice.paid_amount as number} muted />
      </div>

      <Card size="sm">
        <CardContent className="pt-3 flex flex-col gap-2 text-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dates &amp; buyer</p>
          <div className="grid sm:grid-cols-3 gap-2">
            <Row label="Invoice date" value={new Date(invoice.invoice_date as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} />
            <Row label="Due date" value={new Date(invoice.due_date as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} />
            <Row label="Payment terms" value={`${invoice.payment_terms_days} days`} />
            <Row label="Buyer city" value={buyer?.city ?? '—'} />
            <Row label="GSTIN" value={buyer?.gstin ?? '—'} />
            {invoice.synced_at && <Row label="Last synced" value={new Date(invoice.synced_at as string).toLocaleString('en-IN')} />}
          </div>
          {invoice.notes && (
            <p className="text-sm pt-2 border-t border-border mt-2">
              <span className="text-muted-foreground">Notes:</span> {invoice.notes as string}
            </p>
          )}
        </CardContent>
      </Card>

      {(dunningActivity ?? []).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2">Dunning timeline</h2>
          <div className="flex flex-col">
            {(dunningActivity ?? []).map((a, i) => {
              type DunningRow = { id: string; channel: string; template_key: string | null; outcome: string; notes: string | null; payload: Record<string, unknown> | null; created_at: string }
              const row = a as DunningRow
              const isLast = i === (dunningActivity ?? []).length - 1
              const outcomeColor =
                row.outcome === 'delivered' || row.outcome === 'replied'
                  ? 'text-emerald-700'
                  : row.outcome === 'failed'
                  ? 'text-destructive'
                  : 'text-muted-foreground'
              const verb = row.outcome === 'failed' ? 'failed' : row.outcome === 'logged' ? 'logged' : 'sent'
              return (
                <div key={row.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="flex size-7 items-center justify-center rounded-full bg-muted border border-border shrink-0 mt-0.5">
                      <MessageSquare className="size-3.5 text-muted-foreground" />
                    </div>
                    {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
                  </div>
                  <div className="pb-4 min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="text-sm text-foreground capitalize">
                        {row.channel} dunning {verb}
                      </p>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {new Date(row.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    {row.outcome && (
                      <p className={`text-xs mt-0.5 capitalize ${outcomeColor}`}>{row.outcome}</p>
                    )}
                    {row.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5 italic truncate max-w-md">{row.notes}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {lines.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2">Line items</h2>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">SKU</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qty</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Rate</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Line total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{l.description}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{l.sku_code ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.quantity ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.unit_price != null ? `₹${Number(l.unit_price).toLocaleString('en-IN')}` : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">₹{Number(l.line_total).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  )
}

function Money({ label, value, bold, muted, accent }: { label: string; value: number; bold?: boolean; muted?: boolean; accent?: 'primary' }) {
  const color = accent === 'primary' ? 'text-primary' : (muted ? 'text-muted-foreground' : 'text-foreground')
  return (
    <Card size="sm">
      <CardContent className="pt-3 pb-3 flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`tabular-nums ${bold ? 'text-lg font-semibold' : 'text-base font-medium'} ${color}`}>
          ₹{Number(value).toLocaleString('en-IN')}
        </span>
      </CardContent>
    </Card>
  )
}
