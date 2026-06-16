import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  draft:        { bg: '#F3F4F6', color: '#6B7280', label: 'Draft' },
  sent:         { bg: '#DBEAFE', color: '#1D4ED8', label: 'Sent' },
  paid:         { bg: '#DCFCE7', color: '#15803D', label: 'Paid' },
  partial_paid: { bg: '#FEF3C7', color: '#B45309', label: 'Partial paid' },
  cancelled:    { bg: '#F3F4F6', color: '#6B7280', label: 'Cancelled' },
  written_off:  { bg: '#FEE2E2', color: '#B91C1C', label: 'Written off' },
}

export default async function DealerInvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS automatically restricts to this dealer's invoices
  const [{ data: invoice }, { data: receiptsRaw }] = await Promise.all([
    supabase
      .from('invoice')
      .select(
        `id, invoice_number, external_invoice_number, invoice_date, due_date,
         payment_terms_days, subtotal, gst_pct, gst_amount, total,
         retention_pct, retention_amount, billed_amount, paid_amount,
         is_running_bill, running_bill_seq, is_final_bill, status, notes,
         lines:invoice_line(id, description, sku_code, quantity, unit, unit_price, line_total, sort_order)`
      )
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('receipt')
      .select('id, amount, payment_mode, payment_reference, received_at, notes')
      .eq('invoice_id', id)
      .is('deleted_at', null)
      .order('received_at', { ascending: false }),
  ])

  if (!invoice) notFound()

  type Line = { id: string; description: string; sku_code: string | null; quantity: number | null; unit: string | null; unit_price: number | null; line_total: number; sort_order: number }
  const lines = ((invoice.lines ?? []) as Line[]).sort((a, b) => a.sort_order - b.sort_order)

  type Receipt = { id: string; amount: number; payment_mode: string; payment_reference: string | null; received_at: string; notes: string | null }
  const receipts = (receiptsRaw ?? []) as Receipt[]

  const status = invoice.status as string
  const ss = STATUS_STYLES[status] ?? STATUS_STYLES.draft
  const outstanding = Math.max(0, Number(invoice.billed_amount) - Number(invoice.paid_amount))
  const isOverdue = !['paid', 'cancelled', 'written_off'].includes(status) && new Date(invoice.due_date as string) < new Date()
  const daysOverdue = isOverdue
    ? Math.floor((Date.now() - new Date(invoice.due_date as string).getTime()) / 86_400_000)
    : 0

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/dealer-portal/invoices" className="hover:text-foreground">My invoices</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium font-mono">{invoice.invoice_number as string}</span>
      </div>

      <Card>
        <CardContent className="pt-4 flex flex-col gap-3">
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
              </div>
              {invoice.external_invoice_number && (
                <p className="text-xs text-muted-foreground font-mono">External: {invoice.external_invoice_number as string}</p>
              )}
              <p className="text-sm text-muted-foreground tabular-nums">
                Issued {new Date(invoice.invoice_date as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                {' '}· Due {new Date(invoice.due_date as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                {daysOverdue > 0 && <span className="ml-1 text-destructive font-medium">· {daysOverdue} days overdue</span>}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className={`text-2xl font-semibold tabular-nums ${outstanding > 0 ? 'text-primary' : 'text-emerald-700'}`}>
                {outstanding > 0 ? `₹${outstanding.toLocaleString('en-IN')}` : 'Paid'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Money grid */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Money label="Subtotal" value={invoice.subtotal as number} />
        <Money label={`GST (${Number(invoice.gst_pct)}%)`} value={invoice.gst_amount as number} />
        <Money label="Total" value={invoice.total as number} bold />
        <Money label={`Retention (${Number(invoice.retention_pct)}%)`} value={invoice.retention_amount as number} muted />
        <Money label="Billed amount" value={invoice.billed_amount as number} bold accent />
        <Money label="Paid" value={invoice.paid_amount as number} muted />
      </div>

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

      {/* Payment history */}
      <div>
        <h2 className="text-sm font-semibold mb-2">Payment history</h2>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {receipts.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No payments recorded yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {receipts.map((r) => (
                <li key={r.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-[10px] uppercase">{r.payment_mode}</Badge>
                      {r.payment_reference && (
                        <span className="font-mono text-xs text-muted-foreground">{r.payment_reference}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                      Received {new Date(r.received_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <span className="tabular-nums font-medium text-foreground">₹{Number(r.amount).toLocaleString('en-IN')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {invoice.notes && (
        <Card size="sm">
          <CardContent className="pt-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm whitespace-pre-wrap">{invoice.notes as string}</p>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground italic">
        To pay this invoice or dispute charges, contact Vyara&apos;s accounts team.
      </p>
    </div>
  )
}

function Money({ label, value, bold, muted, accent }: { label: string; value: number; bold?: boolean; muted?: boolean; accent?: boolean }) {
  const color = accent ? 'text-primary' : (muted ? 'text-muted-foreground' : 'text-foreground')
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
