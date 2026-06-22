/**
 * /procurement/requisitions/[id] — Purchase Requisition detail.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPurchaseRequisition } from '@/lib/actions/purchase-requisitions'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ApprovalCard } from '@/components/approval/approval-card'
import { PrWorkflowActions } from './workflow-actions'
import { ChevronLeft, ExternalLink, Calendar, Building2, User, AlertCircle, ClipboardList, FileSpreadsheet } from 'lucide-react'

function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function formatMoneyShort(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} cr`
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)} L`
  if (n >= 1_000)       return `₹${(n / 1_000).toFixed(1)} k`
  return `₹${n.toFixed(0)}`
}
function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STATUS_TINT: Record<string, string> = {
  draft:     'bg-muted text-muted-foreground border-border',
  submitted: 'bg-amber-50 text-amber-800 border-amber-200',
  approved:  'bg-emerald-50 text-emerald-800 border-emerald-200',
  po_raised: 'bg-sky-50 text-sky-800 border-sky-200',
  rejected:  'bg-rose-50 text-rose-800 border-rose-200',
  cancelled: 'bg-muted text-muted-foreground border-border',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PurchaseRequisitionDetailPage({ params }: PageProps) {
  const { id } = await params
  const pr = await getPurchaseRequisition(id)
  if (!pr) notFound()

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/procurement" className="hover:text-foreground">Procurement</Link>
        <span>/</span>
        <Link href="/procurement/requisitions" className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> Requisitions
        </Link>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-semibold tracking-tight font-mono">{pr.pr_number}</h1>
                <Badge variant="outline" className={`${STATUS_TINT[pr.status] ?? STATUS_TINT.draft} text-[11px] font-medium`}>
                  {pr.status.replace(/_/g, ' ')}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                Raised {formatDate(pr.created_at)}
                {pr.required_by_date && ` · need by ${formatDate(pr.required_by_date)}`}
                {' · '}
                <span className="font-medium text-foreground">{formatMoneyShort(pr.estimated_value)}</span>
                {' estimated'}
              </div>
            </div>

            <PrWorkflowActions prId={pr.id} status={pr.status} linkedPoId={pr.linked_po_id} />
          </div>

          {/* Meta grid */}
          <div className="grid md:grid-cols-3 gap-4 pt-2 border-t border-border">
            <div className="flex flex-col gap-1">
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Building2 className="size-3" /> Project</div>
              {pr.project_name && pr.project_id ? (
                <Link href={`/projects/${pr.project_id}`} className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-0.5 w-fit">
                  {pr.project_name} <ExternalLink className="size-3" />
                </Link>
              ) : (
                <div className="text-sm text-muted-foreground">No project</div>
              )}
              {pr.cost_center && <div className="text-[11px] text-muted-foreground">Cost center: {pr.cost_center}</div>}
            </div>

            <div className="flex flex-col gap-1">
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><User className="size-3" /> Requested by</div>
              <div className="text-sm font-medium">{pr.requested_by_name ?? '—'}</div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Calendar className="size-3" /> Need by</div>
              <div className="text-sm font-medium">{formatDate(pr.required_by_date)}</div>
            </div>
          </div>

          {/* Justification */}
          {pr.justification && (
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Justification</div>
              <div>{pr.justification}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inline approval card when pending */}
      {pr.approval_request_id && <ApprovalCard requestId={pr.approval_request_id} />}

      {/* Rejection / cancellation banners */}
      {pr.status === 'rejected' && pr.rejected_at && (
        <div className="rounded-md border border-rose-200 bg-rose-50/50 text-rose-900 px-3 py-2 text-xs">
          <strong>Rejected</strong> on {formatDate(pr.rejected_at)} · reason: {pr.rejection_reason ?? '—'}
        </div>
      )}
      {pr.status === 'cancelled' && pr.cancelled_at && (
        <div className="rounded-md border border-rose-200 bg-rose-50/50 text-rose-900 px-3 py-2 text-xs">
          <strong>Cancelled</strong> on {formatDate(pr.cancelled_at)} · reason: {pr.cancellation_reason ?? '—'}
        </div>
      )}
      {pr.status === 'po_raised' && pr.linked_po_id && pr.linked_po_number && (
        <div className="rounded-md border border-sky-200 bg-sky-50/50 text-sky-900 px-3 py-2 text-xs inline-flex items-center gap-1.5">
          <FileSpreadsheet className="size-3.5" />
          <span>
            PO <Link href={`/procurement/orders/${pr.linked_po_id}`} className="font-mono font-medium hover:underline">{pr.linked_po_number}</Link> raised against this requisition.
          </span>
        </div>
      )}

      {/* Lines */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium inline-flex items-center gap-1.5">
              <ClipboardList className="size-3.5" /> Items requested ({pr.lines.length})
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              Estimated total ₹{formatINR(pr.estimated_value)}
            </div>
          </div>

          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-2 font-medium">#</th>
                  <th className="text-left px-2 py-2 font-medium">Item</th>
                  <th className="text-left px-2 py-2 font-medium">HSN</th>
                  <th className="text-right px-2 py-2 font-medium">Qty</th>
                  <th className="text-right px-2 py-2 font-medium">Est. rate</th>
                  <th className="text-right px-2 py-2 font-medium">Est. value</th>
                  <th className="text-left px-2 py-2 font-medium">Preferred vendor</th>
                </tr>
              </thead>
              <tbody>
                {pr.lines.map((l) => (
                  <tr key={l.id} className="border-t border-border align-top">
                    <td className="px-2 py-2 tabular-nums text-muted-foreground">{l.line_no}</td>
                    <td className="px-2 py-2">
                      <div className="font-medium text-foreground">{l.description}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {l.unit}
                        {l.product_sku && <span className="font-mono ml-1">· {l.product_sku}</span>}
                        {!l.product_id && <span className="ml-1 text-amber-700">· ad-hoc</span>}
                      </div>
                      {l.specifications && (
                        <div className="text-[10px] text-muted-foreground italic mt-0.5">
                          spec: {l.specifications}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 font-mono text-[11px]">{l.hsn_code ?? '—'}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{l.quantity}</td>
                    <td className="px-2 py-2 text-right tabular-nums">₹{formatINR(l.estimated_rate)}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium">₹{formatINR(l.estimated_value)}</td>
                    <td className="px-2 py-2 text-[11px]">
                      {l.preferred_vendor_name ?? <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/40 border-t border-border">
                  <td colSpan={5} className="px-2 py-2 text-right font-medium">Total estimated</td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold">₹{formatINR(pr.estimated_value)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* PR → PO conversion CTA when approved + no PO yet */}
      {pr.status === 'approved' && !pr.linked_po_id && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2 text-sm">
              <FileSpreadsheet className="size-4 text-sky-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-foreground">Ready to raise PO</div>
                <div className="text-muted-foreground text-xs">
                  Pre-fills the PO form from these lines (description, HSN, qty, estimated rate as PO rate). On save the PR flips to <span className="font-mono">po_raised</span>.
                </div>
              </div>
            </div>
            <Link
              href={`/procurement/orders/new?from_pr=${pr.id}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 text-white px-3 py-2 text-sm font-medium hover:bg-sky-700 transition-colors whitespace-nowrap"
            >
              <FileSpreadsheet className="size-4" /> Raise PO from this PR
            </Link>
          </CardContent>
        </Card>
      )}

      {pr.notes && (
        <Card size="sm">
          <CardContent className="flex flex-col gap-1 text-sm">
            <div className="text-xs text-muted-foreground">Internal notes</div>
            <div className="text-xs">{pr.notes}</div>
          </CardContent>
        </Card>
      )}

      <div className="text-[11px] text-muted-foreground">
        Created {formatDate(pr.created_at)}
        {pr.submitted_at && ` · submitted ${formatDate(pr.submitted_at)}`}
        {pr.approved_at && ` · approved ${formatDate(pr.approved_at)}`}
        {pr.approved_by_name && ` by ${pr.approved_by_name}`}
      </div>
    </div>
  )
}
