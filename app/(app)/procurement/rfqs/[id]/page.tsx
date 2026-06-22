/**
 * /procurement/rfqs/[id] — RFQ detail with vendor responses.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getRfq } from '@/lib/actions/rfqs'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RfqWorkflowActions } from './workflow-actions'
import { ChevronLeft, ExternalLink, Send, Users, ClipboardList, BarChart3 } from 'lucide-react'

function formatINR(n: number) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STATUS_TINT: Record<string, string> = {
  draft:            'bg-muted text-muted-foreground border-border',
  sent:             'bg-amber-50 text-amber-800 border-amber-200',
  quotes_collected: 'bg-violet-50 text-violet-800 border-violet-200',
  cs_finalised:     'bg-emerald-50 text-emerald-800 border-emerald-200',
  po_raised:        'bg-sky-50 text-sky-800 border-sky-200',
  cancelled:        'bg-rose-50 text-rose-800 border-rose-200',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function RfqDetailPage({ params }: PageProps) {
  const { id } = await params
  const rfq = await getRfq(id)
  if (!rfq) notFound()

  const respondedVendors = rfq.vendors.filter((v) => v.responded_at != null).length
  const totalInvited = rfq.vendors.length
  const canCs = (rfq.status === 'sent' || rfq.status === 'quotes_collected') && rfq.responses.length > 0

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-6xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/procurement" className="hover:text-foreground">Procurement</Link>
        <span>/</span>
        <Link href="/procurement/rfqs" className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> RFQs
        </Link>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-semibold tracking-tight font-mono">{rfq.rfq_number}</h1>
                <Badge variant="outline" className={`${STATUS_TINT[rfq.status] ?? STATUS_TINT.draft} text-[11px] font-medium`}>
                  {rfq.status.replace(/_/g, ' ')}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {formatDate(rfq.rfq_date)}
                {rfq.response_deadline && ` · responses by ${formatDate(rfq.response_deadline)}`}
                {rfq.required_by_date && ` · need by ${formatDate(rfq.required_by_date)}`}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {canCs && (
                <Link
                  href={`/procurement/rfqs/${rfq.id}/cs`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-emerald-700 transition-colors"
                >
                  <BarChart3 className="size-4" /> Open CS
                </Link>
              )}
              <RfqWorkflowActions rfqId={rfq.id} status={rfq.status} />
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-3 pt-2 border-t border-border">
            <Cell label="Project" value={rfq.project_name ?? '—'} />
            <Cell label="Cost center" value={rfq.cost_center ?? '—'} />
            <Cell label="Vendors invited" value={`${respondedVendors}/${totalInvited} responded`} />
            <Cell label="Total lines" value={rfq.lines.length.toString()} />
          </div>

          {rfq.source_pr_numbers.length > 0 && (
            <div className="text-[11px] text-muted-foreground">
              Sourced from PRs: {rfq.source_pr_numbers.map((n) => <span key={n} className="font-mono mr-2">{n}</span>)}
            </div>
          )}

          {rfq.linked_po_id && rfq.linked_po_number && (
            <div className="rounded-md border border-sky-200 bg-sky-50/50 text-sky-900 px-3 py-2 text-xs inline-flex items-center gap-1.5">
              <ExternalLink className="size-3.5" />
              PO <Link href={`/procurement/orders/${rfq.linked_po_id}`} className="font-mono font-medium hover:underline">{rfq.linked_po_number}</Link> raised from this RFQ.
            </div>
          )}
        </CardContent>
      </Card>

      {rfq.cancelled_at && rfq.cancellation_reason && (
        <div className="rounded-md border border-rose-200 bg-rose-50/50 text-rose-900 px-3 py-2 text-xs">
          Cancelled on {formatDate(rfq.cancelled_at)} · reason: {rfq.cancellation_reason}
        </div>
      )}

      {/* Lines */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="text-sm font-medium inline-flex items-center gap-1.5">
            <ClipboardList className="size-3.5" /> Items requested ({rfq.lines.length})
          </div>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-2 font-medium">#</th>
                  <th className="text-left px-2 py-2 font-medium">Item</th>
                  <th className="text-left px-2 py-2 font-medium">HSN</th>
                  <th className="text-right px-2 py-2 font-medium">Qty</th>
                  <th className="text-left px-2 py-2 font-medium">Specifications</th>
                </tr>
              </thead>
              <tbody>
                {rfq.lines.map((l) => (
                  <tr key={l.id} className="border-t border-border align-top">
                    <td className="px-2 py-2 text-muted-foreground tabular-nums">{l.line_no}</td>
                    <td className="px-2 py-2">
                      <div className="font-medium">{l.description}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {l.unit}
                        {l.product_sku && <span className="font-mono ml-1">· {l.product_sku}</span>}
                      </div>
                    </td>
                    <td className="px-2 py-2 font-mono text-[11px]">{l.hsn_code ?? '—'}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{l.quantity}</td>
                    <td className="px-2 py-2 text-[11px] text-muted-foreground">{l.specifications ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Vendors invited */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium inline-flex items-center gap-1.5">
              <Users className="size-3.5" /> Vendors invited ({rfq.vendors.length})
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            {rfq.vendors.map((v) => {
              const fullyResponded = v.response_count === rfq.lines.length
              return (
                <div key={v.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs">{v.vendor_code}</span>
                      <span className="text-sm font-medium truncate">{v.vendor_name}</span>
                      {v.responded_at ? (
                        <Badge variant="outline" className={fullyResponded ? 'bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px]' : 'bg-amber-50 text-amber-800 border-amber-200 text-[10px]'}>
                          {v.response_count}/{rfq.lines.length} lines · responded {formatDate(v.responded_at.slice(0, 10))}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground border-border text-[10px]">
                          Awaiting response
                        </Badge>
                      )}
                    </div>
                    {v.vendor_quote_no && (
                      <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                        Quote <span className="font-mono">{v.vendor_quote_no}</span>
                        {v.vendor_quote_date && ` · dated ${formatDate(v.vendor_quote_date)}`}
                        {v.payment_terms_days != null && ` · ${v.payment_terms_days}d payment`}
                        {v.delivery_terms && ` · ${v.delivery_terms}`}
                      </div>
                    )}
                  </div>
                  {(rfq.status === 'sent' || rfq.status === 'quotes_collected') && (
                    <Link
                      href={`/procurement/rfqs/${rfq.id}/responses/new?vendor=${v.vendor_id}`}
                      className="text-xs text-primary hover:underline whitespace-nowrap"
                    >
                      {v.responded_at ? 'Edit response' : 'Record response'} →
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {rfq.notes && (
        <Card size="sm">
          <CardContent className="flex flex-col gap-1 text-sm">
            <div className="text-xs text-muted-foreground">Notes</div>
            <div className="text-xs">{rfq.notes}</div>
          </CardContent>
        </Card>
      )}

      <div className="text-[11px] text-muted-foreground">
        Created {formatDate(rfq.created_at)}
        {rfq.sent_at && ` · sent ${formatDate(rfq.sent_at)}`}
      </div>
    </div>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm font-medium tabular-nums">{value}</div>
    </div>
  )
}
