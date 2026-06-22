/**
 * /procurement/orders/[id] — purchase-order detail.
 *
 * Server component: assembles PO header + lines + (when present) the
 * inline approval card via PLAT-014's existing component.
 *
 * Workflow buttons (submit / send / cancel) live in a small client
 * island. Approve / reject happens *via* the ApprovalCard's
 * DecideButtons — we don't reinvent that flow here.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPurchaseOrder } from '@/lib/actions/purchase-orders'
import { listGoodsReceiptNotes } from '@/lib/actions/goods-receipt-notes'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ApprovalCard } from '@/components/approval/approval-card'
import { POWorkflowActions } from './workflow-actions'
import { ChevronLeft, ExternalLink, Building2, MapPin, FileText, Receipt, AlertTriangle, PackagePlus, PackageOpen } from 'lucide-react'

function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STATUS_TINT: Record<string, string> = {
  draft:            'bg-muted text-muted-foreground border-border',
  pending_approval: 'bg-amber-50 text-amber-800 border-amber-200',
  approved:         'bg-sky-50 text-sky-800 border-sky-200',
  sent:             'bg-indigo-50 text-indigo-800 border-indigo-200',
  partly_received:  'bg-violet-50 text-violet-800 border-violet-200',
  received:         'bg-emerald-50 text-emerald-800 border-emerald-200',
  cancelled:        'bg-rose-50 text-rose-800 border-rose-200',
  closed:           'bg-muted text-muted-foreground border-border',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PurchaseOrderDetailPage({ params }: PageProps) {
  const { id } = await params
  const [po, grns] = await Promise.all([
    getPurchaseOrder(id),
    listGoodsReceiptNotes({ po_id: id, status: 'all', limit: 50 }),
  ])
  if (!po) notFound()

  const receivable = ['approved', 'sent', 'partly_received'].includes(po.status)
  const hasUnfulfilled = po.lines.some((l) => Number(l.qty_received || 0) < Number(l.quantity || 0))
  const showReceiveCta = receivable && hasUnfulfilled

  const interstate = po.lines.some((l) => l.is_interstate)
  const cgstTotal = po.lines.reduce((s, l) => s + Number(l.cgst_amount || 0), 0)
  const sgstTotal = po.lines.reduce((s, l) => s + Number(l.sgst_amount || 0), 0)
  const igstTotal = po.lines.reduce((s, l) => s + Number(l.igst_amount || 0), 0)

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/procurement" className="hover:text-foreground">Procurement</Link>
        <span>/</span>
        <Link href="/procurement/orders" className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> Purchase orders
        </Link>
      </div>

      {/* Header */}
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight font-mono">{po.po_number}</h1>
                <Badge variant="outline" className={`${STATUS_TINT[po.status] ?? STATUS_TINT.draft} text-[11px] font-medium`}>
                  {po.status.replace(/_/g, ' ')}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {formatDate(po.po_date)}{po.expected_delivery_at && ` · expected ${formatDate(po.expected_delivery_at)}`}
                {po.payment_terms_days != null && ` · ${po.payment_terms_days}d payment terms`}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {showReceiveCta && (
                <Link
                  href={`/procurement/orders/${po.id}/receive`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-emerald-700 transition-colors"
                >
                  <PackagePlus className="size-4" /> Receive goods
                </Link>
              )}
              <POWorkflowActions
                poId={po.id}
                status={po.status}
                hasApprovalRequest={!!po.approval_request_id}
              />
            </div>
          </div>

          {/* Vendor + ship-to grid */}
          <div className="grid md:grid-cols-2 gap-4 pt-2 border-t border-border">
            <div className="flex flex-col gap-1">
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Building2 className="size-3" /> Vendor</div>
              <div className="text-sm font-medium">{po.vendor_name}</div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                {po.vendor_gstin && <div>GSTIN <span className="font-mono">{po.vendor_gstin}</span></div>}
                {po.vendor_phone && <div>{po.vendor_phone}</div>}
                {po.vendor_msme_status && po.vendor_msme_status !== 'not_msme' && (
                  <div>
                    <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-[10px]">
                      MSME · {po.vendor_msme_status}
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><MapPin className="size-3" /> Ship to</div>
              <div className="text-sm font-medium">{po.warehouse_name}{po.warehouse_state && ` · ${po.warehouse_state}`}</div>
              {po.project_name && (
                <div className="text-xs text-muted-foreground">
                  Project: <Link href={`/projects/${po.project_id}`} className="text-primary hover:underline inline-flex items-center gap-0.5">
                    {po.project_name} <ExternalLink className="size-3" />
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* MSME compliance hint (P2 lifts to actual rule) */}
          {po.vendor_msme_status && po.vendor_msme_status !== 'not_msme' && (
            <div className="rounded-md border border-amber-200 bg-amber-50/50 text-amber-900 px-3 py-2 text-xs inline-flex items-start gap-1.5">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              <span>
                MSMED Act 2006 — payment within <strong>45 days</strong> of supply is mandatory.
                FIN-020 will surface the dues report in Phase 2.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inline approval card when present */}
      {po.approval_request_id && (
        <ApprovalCard requestId={po.approval_request_id} />
      )}

      {/* Lines */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="text-sm font-medium">Line items ({po.lines.length})</div>

          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-2 font-medium">#</th>
                  <th className="text-left px-2 py-2 font-medium">Description</th>
                  <th className="text-left px-2 py-2 font-medium">HSN/SAC</th>
                  <th className="text-right px-2 py-2 font-medium">Qty</th>
                  <th className="text-right px-2 py-2 font-medium">Rate</th>
                  <th className="text-right px-2 py-2 font-medium">Disc</th>
                  <th className="text-right px-2 py-2 font-medium">Taxable</th>
                  <th className="text-right px-2 py-2 font-medium">GST</th>
                  <th className="text-right px-2 py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {po.lines.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-2 py-2 tabular-nums text-muted-foreground">{l.line_no}</td>
                    <td className="px-2 py-2">
                      <div className="font-medium text-foreground">{l.description}</div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        {l.unit}
                        {Number(l.qty_received) > 0 && (
                          <span className={`ml-1.5 ${Number(l.qty_received) >= Number(l.quantity) ? 'text-emerald-700' : 'text-violet-700'}`}>
                            · {l.qty_received}/{l.quantity} received
                          </span>
                        )}
                        {Number(l.qty_rejected) > 0 && (
                          <span className="ml-1 text-rose-700">· {l.qty_rejected} rejected</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 font-mono text-[11px]">{l.hsn_code ?? '—'}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{l.quantity}</td>
                    <td className="px-2 py-2 text-right tabular-nums">₹{formatINR(l.rate)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{l.discount_pct > 0 ? `${l.discount_pct}%` : '—'}</td>
                    <td className="px-2 py-2 text-right tabular-nums">₹{formatINR(l.taxable_value)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{l.gst_rate_pct}%</td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium">₹{formatINR(l.amount_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Totals + terms in two columns */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card size="sm">
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="text-sm font-medium mb-1 inline-flex items-center gap-1.5">
              <Receipt className="size-3.5" /> Totals
            </div>
            <Row label="Subtotal (taxable)" value={`₹${formatINR(po.subtotal)}`} />
            {po.discount_amount > 0 && <Row label="Discount" value={`− ₹${formatINR(po.discount_amount)}`} />}
            {interstate ? (
              <Row label="IGST" value={`₹${formatINR(igstTotal)}`} />
            ) : (
              <>
                <Row label="CGST" value={`₹${formatINR(cgstTotal)}`} />
                <Row label="SGST" value={`₹${formatINR(sgstTotal)}`} />
              </>
            )}
            <div className="border-t border-border my-1" />
            <Row label="Grand total" value={`₹${formatINR(po.total)}`} bold />
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="text-sm font-medium mb-1 inline-flex items-center gap-1.5">
              <FileText className="size-3.5" /> Terms
            </div>
            <TermRow label="Payment" value={`${po.payment_terms_days} days`} />
            {po.delivery_terms && <TermRow label="Delivery" value={po.delivery_terms} />}
            {po.warranty_terms && <TermRow label="Warranty" value={po.warranty_terms} />}
            {po.liquidated_damages_terms && <TermRow label="LD" value={po.liquidated_damages_terms} />}
            {po.retention_pct != null && <TermRow label="Retention" value={`${po.retention_pct}%`} />}
            {po.other_terms && <TermRow label="Other" value={po.other_terms} />}
          </CardContent>
        </Card>
      </div>

      {/* Goods receipts (GRNs) against this PO */}
      {grns.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium inline-flex items-center gap-1.5">
                <PackageOpen className="size-3.5" /> Goods receipts ({grns.length})
              </div>
              <Link href={`/procurement/grns?po=${po.id}`} className="text-xs text-muted-foreground hover:text-foreground">View in GRN list →</Link>
            </div>
            <div className="flex flex-col gap-1.5">
              {grns.map((g) => {
                const tint = g.status === 'posted'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : g.status === 'cancelled'
                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                    : 'bg-muted text-muted-foreground border-border'
                return (
                  <Link
                    key={g.id}
                    href={`/procurement/grns/${g.id}`}
                    className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 hover:bg-muted/30 transition-colors"
                  >
                    <span className="font-mono text-xs">{g.grn_number}</span>
                    <Badge variant="outline" className={`${tint} text-[10px] font-medium`}>{g.status}</Badge>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{formatDate(g.grn_date)}</span>
                    <span className="text-xs flex-1 text-muted-foreground">{g.line_count} line{g.line_count === 1 ? '' : 's'} · {g.qty_accepted_total} accepted{g.qty_rejected_total > 0 ? ` · ${g.qty_rejected_total} rejected` : ''}</span>
                    <ExternalLink className="size-3 text-muted-foreground" />
                  </Link>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Snapshots + audit footer */}
      <Card size="sm">
        <CardContent className="grid md:grid-cols-3 gap-3 text-[11px] text-muted-foreground">
          {po.bill_to_snapshot && <div><div className="font-medium text-foreground mb-0.5">Bill to</div>{po.bill_to_snapshot}</div>}
          {po.ship_to_snapshot && <div><div className="font-medium text-foreground mb-0.5">Ship to</div>{po.ship_to_snapshot}</div>}
          {po.vendor_address_snapshot && <div><div className="font-medium text-foreground mb-0.5">Vendor</div>{po.vendor_address_snapshot}</div>}
        </CardContent>
      </Card>

      {po.cancelled_at && po.cancellation_reason && (
        <div className="rounded-md border border-rose-200 bg-rose-50/50 text-rose-900 px-3 py-2 text-xs">
          Cancelled on {formatDate(po.cancelled_at)} · reason: {po.cancellation_reason}
        </div>
      )}

      <div className="text-[11px] text-muted-foreground">
        Created {formatDate(po.created_at)}
        {po.submitted_at && ` · submitted ${formatDate(po.submitted_at)}`}
        {po.approved_at && ` · approved ${formatDate(po.approved_at)}`}
        {po.sent_at && ` · sent ${formatDate(po.sent_at)}`}
      </div>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'font-semibold text-base' : ''}`}>
      <span className={bold ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

function TermRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-xs">{value}</span>
    </div>
  )
}
