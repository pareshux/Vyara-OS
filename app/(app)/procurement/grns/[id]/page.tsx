/**
 * /procurement/grns/[id] — GRN detail.
 *
 * Server-rendered. Workflow buttons (post / cancel) live in a small
 * client island. RTV is deferred to P1γ.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getGoodsReceiptNote } from '@/lib/actions/goods-receipt-notes'
import { listReturnsToVendor } from '@/lib/actions/return-to-vendor'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GrnWorkflowActions } from './workflow-actions'
import { ChevronLeft, ExternalLink, Truck, FileSignature, AlertTriangle, Undo2 } from 'lucide-react'

const STATUS_TINT: Record<string, string> = {
  draft:     'bg-muted text-muted-foreground border-border',
  posted:    'bg-emerald-50 text-emerald-800 border-emerald-200',
  cancelled: 'bg-rose-50 text-rose-800 border-rose-200',
}

const QC_LABEL: Record<string, string> = {
  not_required:   'Not required',
  pending:        'Pending',
  accepted:       'Accepted',
  rejected:       'Rejected',
  partial_accept: 'Partial accept',
}

const QC_TINT: Record<string, string> = {
  not_required:   'bg-muted text-muted-foreground border-border',
  pending:        'bg-amber-50 text-amber-800 border-amber-200',
  accepted:       'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected:       'bg-rose-50 text-rose-800 border-rose-200',
  partial_accept: 'bg-amber-50 text-amber-800 border-amber-200',
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function GrnDetailPage({ params }: PageProps) {
  const { id } = await params
  const [grn, rtvs] = await Promise.all([
    getGoodsReceiptNote(id),
    listReturnsToVendor({ grn_id: id, status: 'all', limit: 50 }),
  ])
  if (!grn) notFound()

  const totalAccepted = grn.lines.reduce((s, l) => s + Number(l.qty_accepted || 0), 0)
  const totalRejected = grn.lines.reduce((s, l) => s + Number(l.qty_rejected || 0), 0)
  const totalReturned = rtvs
    .filter((r) => r.status === 'posted')
    .reduce((s, r) => s + Number(r.qty_returned_total || 0), 0)
  const canReturn = grn.status === 'posted' && totalAccepted - totalReturned > 0

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/procurement" className="hover:text-foreground">Procurement</Link>
        <span>/</span>
        <Link href="/procurement/grns" className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> Goods receipts
        </Link>
      </div>

      {/* Header */}
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight font-mono">{grn.grn_number}</h1>
                <Badge variant="outline" className={`${STATUS_TINT[grn.status] ?? STATUS_TINT.draft} text-[11px] font-medium`}>
                  {grn.status}
                </Badge>
                <Badge variant="outline" className={`${QC_TINT[grn.qc_status] ?? QC_TINT.not_required} text-[11px]`}>
                  QC · {QC_LABEL[grn.qc_status] ?? grn.qc_status}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {formatDate(grn.grn_date)}
                {grn.posted_at && ` · posted ${formatDate(grn.posted_at)}`}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {canReturn && (
                <Link
                  href={`/procurement/grns/${grn.id}/return`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-rose-700 transition-colors"
                >
                  <Undo2 className="size-4" /> Return to vendor
                </Link>
              )}
              <GrnWorkflowActions grnId={grn.id} status={grn.status} />
            </div>
          </div>

          {/* Vendor + PO + Warehouse */}
          <div className="grid md:grid-cols-3 gap-4 pt-2 border-t border-border">
            <div className="flex flex-col gap-1">
              <div className="text-xs text-muted-foreground">Vendor</div>
              <div className="text-sm font-medium">{grn.vendor_name ?? '—'}</div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-xs text-muted-foreground">Against PO</div>
              <Link href={`/procurement/orders/${grn.po_id}`} className="text-sm font-mono text-primary hover:underline inline-flex items-center gap-0.5 w-fit">
                {grn.po_number ?? grn.po_id} <ExternalLink className="size-3" />
              </Link>
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-xs text-muted-foreground">Received into</div>
              <div className="text-sm font-medium">{grn.warehouse_name ?? '—'}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {grn.cancelled_at && grn.cancellation_reason && (
        <div className="rounded-md border border-rose-200 bg-rose-50/50 text-rose-900 px-3 py-2 text-xs">
          Cancelled on {formatDate(grn.cancelled_at)} · reason: {grn.cancellation_reason}
        </div>
      )}

      {/* Lines */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Lines ({grn.lines.length})</div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {totalAccepted} accepted{totalRejected > 0 && <span className="text-rose-700"> · {totalRejected} rejected</span>}
            </div>
          </div>

          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-2 font-medium">Description</th>
                  <th className="text-right px-2 py-2 font-medium">Received</th>
                  <th className="text-right px-2 py-2 font-medium">Accepted</th>
                  <th className="text-right px-2 py-2 font-medium">Rejected</th>
                  <th className="text-left px-2 py-2 font-medium">Batch / expiry</th>
                  <th className="text-left px-2 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {grn.lines.map((l) => (
                  <tr key={l.id} className="border-t border-border align-top">
                    <td className="px-2 py-2">
                      <div className="font-medium text-foreground">{l.description}</div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        {l.unit}
                        {l.po_line_quantity != null && ` · PO ordered ${l.po_line_quantity}`}
                        {!l.product_id && <span className="ml-1 text-amber-700">· no stock impact</span>}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{l.qty_received}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-emerald-700 font-medium">{l.qty_accepted}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {l.qty_rejected > 0 ? <span className="text-rose-700">{l.qty_rejected}</span> : '—'}
                    </td>
                    <td className="px-2 py-2">
                      <div className="font-mono text-[11px]">{l.batch_no ?? '—'}</div>
                      {l.expiry_date && <div className="text-[10px] text-muted-foreground">{formatDate(l.expiry_date)}</div>}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {l.rejection_reason && <div className="text-rose-700"><AlertTriangle className="size-3 inline" /> {l.rejection_reason}</div>}
                      {l.remarks && <div>{l.remarks}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Paperwork + Notes */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card size="sm">
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="text-sm font-medium mb-1 inline-flex items-center gap-1.5">
              <Truck className="size-3.5" /> Inbound paperwork
            </div>
            <Row label="Challan" value={grn.vendor_challan_no ?? '—'} mono />
            <Row label="Vendor invoice" value={grn.vendor_invoice_no ?? '—'} mono />
            <Row label="Vehicle" value={grn.vehicle_no ?? '—'} mono />
            <Row label="Transporter" value={grn.transporter ?? '—'} />
            <Row label="E-way bill" value={grn.e_way_bill_no ?? '—'} mono />
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="text-sm font-medium mb-1 inline-flex items-center gap-1.5">
              <FileSignature className="size-3.5" /> Notes
            </div>
            {grn.qc_notes && <div><div className="text-xs text-muted-foreground mb-0.5">QC notes</div><div className="text-xs">{grn.qc_notes}</div></div>}
            {grn.notes && <div><div className="text-xs text-muted-foreground mb-0.5">Internal notes</div><div className="text-xs">{grn.notes}</div></div>}
            {!grn.qc_notes && !grn.notes && <div className="text-xs text-muted-foreground">—</div>}
          </CardContent>
        </Card>
      </div>

      {/* Returns against this GRN */}
      {rtvs.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="text-sm font-medium inline-flex items-center gap-1.5">
              <Undo2 className="size-3.5" /> Returns ({rtvs.length})
            </div>
            <div className="flex flex-col gap-1.5">
              {rtvs.map((r) => {
                const tint = r.status === 'posted'
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : 'bg-muted text-muted-foreground border-border'
                return (
                  <Link
                    key={r.id}
                    href={`/procurement/returns/${r.id}`}
                    className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 hover:bg-muted/30 transition-colors"
                  >
                    <span className="font-mono text-xs">{r.rtv_number}</span>
                    <Badge variant="outline" className={`${tint} text-[10px] font-medium`}>{r.status}</Badge>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{formatDate(r.rtv_date)}</span>
                    <span className="text-xs flex-1 text-muted-foreground">{r.line_count} line{r.line_count === 1 ? '' : 's'} · {r.qty_returned_total} returned</span>
                    {r.vendor_credit_note_no && <span className="text-[10px] text-emerald-700">credit note ✓</span>}
                    <ExternalLink className="size-3 text-muted-foreground" />
                  </Link>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="text-[11px] text-muted-foreground">
        Created {formatDate(grn.created_at)}
        {grn.posted_at && ` · posted ${formatDate(grn.posted_at)}`}
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`text-xs ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}
