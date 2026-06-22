/**
 * /procurement/returns/[id] — RTV detail.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getReturnToVendor } from '@/lib/actions/return-to-vendor'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RtvWorkflowActions } from './workflow-actions'
import { RecordCreditNoteForm } from './credit-note-form'
import { ChevronLeft, ExternalLink, Building2, MapPin } from 'lucide-react'

const STATUS_TINT: Record<string, string> = {
  draft:     'bg-muted text-muted-foreground border-border',
  posted:    'bg-rose-50 text-rose-800 border-rose-200',
  cancelled: 'bg-muted text-muted-foreground border-border',
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function RtvDetailPage({ params }: PageProps) {
  const { id } = await params
  const rtv = await getReturnToVendor(id)
  if (!rtv) notFound()

  const totalReturned = rtv.lines.reduce((s, l) => s + Number(l.qty_returned || 0), 0)

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/procurement" className="hover:text-foreground">Procurement</Link>
        <span>/</span>
        <Link href="/procurement/returns" className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> Returns
        </Link>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight font-mono">{rtv.rtv_number}</h1>
                <Badge variant="outline" className={`${STATUS_TINT[rtv.status] ?? STATUS_TINT.draft} text-[11px] font-medium`}>
                  {rtv.status}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {formatDate(rtv.rtv_date)}
                {rtv.posted_at && ` · posted ${formatDate(rtv.posted_at)}`}
              </div>
            </div>

            <RtvWorkflowActions rtvId={rtv.id} status={rtv.status} />
          </div>

          <div className="grid md:grid-cols-3 gap-4 pt-2 border-t border-border">
            <div className="flex flex-col gap-1">
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Building2 className="size-3" /> Vendor</div>
              <div className="text-sm font-medium">{rtv.vendor_name ?? '—'}</div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-xs text-muted-foreground">Against GRN</div>
              <Link href={`/procurement/grns/${rtv.grn_id}`} className="text-sm font-mono text-primary hover:underline inline-flex items-center gap-0.5 w-fit">
                {rtv.grn_number ?? rtv.grn_id} <ExternalLink className="size-3" />
              </Link>
              {rtv.po_number && (
                <Link href={`/procurement/orders/${rtv.po_id}`} className="text-[11px] text-muted-foreground hover:text-foreground">
                  PO <span className="font-mono">{rtv.po_number}</span>
                </Link>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><MapPin className="size-3" /> Returned from</div>
              <div className="text-sm font-medium">{rtv.warehouse_name ?? '—'}</div>
            </div>
          </div>

          {rtv.reason && (
            <div className="rounded-md border border-amber-200 bg-amber-50/50 text-amber-900 px-3 py-2 text-xs">
              <span className="font-medium">Reason · </span>{rtv.reason}
            </div>
          )}
        </CardContent>
      </Card>

      {rtv.cancelled_at && rtv.cancellation_reason && (
        <div className="rounded-md border border-rose-200 bg-rose-50/50 text-rose-900 px-3 py-2 text-xs">
          Cancelled on {formatDate(rtv.cancelled_at)} · reason: {rtv.cancellation_reason}
        </div>
      )}

      {/* Vendor credit-note round trip (when posted) */}
      {rtv.status === 'posted' && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="text-sm font-medium">Vendor credit note</div>
            {rtv.vendor_credit_note_no ? (
              <div className="text-sm">
                <div>Credit note <span className="font-mono">{rtv.vendor_credit_note_no}</span> received {formatDate(rtv.vendor_credit_note_at)}.</div>
                <p className="text-xs text-muted-foreground mt-1">
                  When vendor bills land (P2), this credit note will be matched against the outstanding invoice during 3-way reconciliation.
                </p>
              </div>
            ) : (
              <RecordCreditNoteForm rtvId={rtv.id} />
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Lines ({rtv.lines.length})</div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {totalReturned} total qty returned
            </div>
          </div>

          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-2 font-medium">Description</th>
                  <th className="text-right px-2 py-2 font-medium">GRN accepted</th>
                  <th className="text-right px-2 py-2 font-medium">Returned</th>
                  <th className="text-left px-2 py-2 font-medium">Reason</th>
                  <th className="text-left px-2 py-2 font-medium">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {rtv.lines.map((l) => (
                  <tr key={l.id} className="border-t border-border align-top">
                    <td className="px-2 py-2">
                      <div className="font-medium text-foreground">{l.description}</div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        {l.unit}
                        {!l.product_id && <span className="ml-1 text-amber-700">· no stock impact</span>}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{l.grn_qty_accepted ?? '—'}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-rose-700 font-medium">{l.qty_returned}</td>
                    <td className="px-2 py-2">{l.reason ?? '—'}</td>
                    <td className="px-2 py-2 text-muted-foreground">{l.remarks ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {rtv.notes && (
        <Card size="sm">
          <CardContent className="flex flex-col gap-1 text-sm">
            <div className="text-xs text-muted-foreground">Internal notes</div>
            <div className="text-xs">{rtv.notes}</div>
          </CardContent>
        </Card>
      )}

      <div className="text-[11px] text-muted-foreground">
        Created {formatDate(rtv.created_at)}
        {rtv.posted_at && ` · posted ${formatDate(rtv.posted_at)}`}
      </div>
    </div>
  )
}
