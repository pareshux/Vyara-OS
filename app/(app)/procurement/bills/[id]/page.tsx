/**
 * /procurement/bills/[id] — Vendor Bill detail with 3-way match results.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getVendorBill, type LineMatchStatus } from '@/lib/actions/vendor-bills'
import { listVendorPayments } from '@/lib/actions/vendor-payments'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ApprovalCard } from '@/components/approval/approval-card'
import { BillWorkflowActions } from './workflow-actions'
import { ChevronLeft, ExternalLink, Building2, Receipt, FileSignature, AlertTriangle, CheckCircle2, Eye, Banknote, FileCheck2 } from 'lucide-react'
import { IrnForm } from './irn-form'

function formatINR(n: number) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function isOverdue(due: string | null): boolean {
  if (!due) return false
  return new Date(due) < new Date(new Date().toISOString().slice(0, 10))
}

const STATUS_TINT: Record<string, string> = {
  draft:       'bg-muted text-muted-foreground border-border',
  submitted:   'bg-amber-50 text-amber-800 border-amber-200',
  approved:    'bg-sky-50 text-sky-800 border-sky-200',
  partly_paid: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  paid:        'bg-emerald-50 text-emerald-800 border-emerald-200',
  cancelled:   'bg-rose-50 text-rose-800 border-rose-200',
}

const BILL_MATCH_TINT: Record<string, string> = {
  pending:      'bg-muted text-muted-foreground border-border',
  matched:      'bg-emerald-50 text-emerald-800 border-emerald-200',
  under_review: 'bg-amber-50 text-amber-800 border-amber-200',
  mismatched:   'bg-rose-50 text-rose-800 border-rose-200',
}

const LINE_MATCH_TINT: Record<LineMatchStatus, string> = {
  pending:        'bg-muted text-muted-foreground border-border',
  matched:        'bg-emerald-50 text-emerald-800 border-emerald-200',
  qty_over:       'bg-rose-50 text-rose-800 border-rose-200',
  rate_mismatch:  'bg-amber-50 text-amber-800 border-amber-200',
  hsn_mismatch:   'bg-amber-50 text-amber-800 border-amber-200',
  gst_mismatch:   'bg-amber-50 text-amber-800 border-amber-200',
  unlinked:       'bg-muted text-muted-foreground border-border',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function VendorBillDetailPage({ params }: PageProps) {
  const { id } = await params
  const [bill, payments] = await Promise.all([
    getVendorBill(id),
    listVendorPayments({ bill_id: id, limit: 50 }),
  ])
  if (!bill) notFound()

  const interstate = bill.lines.some((l) => l.is_interstate)
  const cgstTotal = bill.lines.reduce((s, l) => s + Number(l.cgst_amount || 0), 0)
  const sgstTotal = bill.lines.reduce((s, l) => s + Number(l.sgst_amount || 0), 0)
  const igstTotal = bill.lines.reduce((s, l) => s + Number(l.igst_amount || 0), 0)

  const overdue = (bill.status === 'approved' || bill.status === 'partly_paid') && isOverdue(bill.due_date)
  const mismatchedLineCount = bill.lines.filter((l) => ['qty_over', 'rate_mismatch', 'hsn_mismatch', 'gst_mismatch'].includes(l.match_status)).length

  const canPay = (bill.status === 'approved' || bill.status === 'partly_paid') && bill.amount_outstanding > 0

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/procurement" className="hover:text-foreground">Procurement</Link>
        <span>/</span>
        <Link href="/procurement/bills" className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> Vendor bills
        </Link>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-semibold tracking-tight font-mono">{bill.bill_number}</h1>
                <Badge variant="outline" className={`${STATUS_TINT[bill.status] ?? STATUS_TINT.draft} text-[11px] font-medium`}>
                  {bill.status.replace(/_/g, ' ')}
                </Badge>
                <Badge variant="outline" className={`${BILL_MATCH_TINT[bill.match_status]} text-[11px] inline-flex items-center gap-1`}>
                  {bill.match_status === 'matched' && <CheckCircle2 className="size-3" />}
                  {bill.match_status === 'mismatched' && <AlertTriangle className="size-3" />}
                  {bill.match_status === 'under_review' && <Eye className="size-3" />}
                  3-way · {bill.match_status.replace(/_/g, ' ')}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                Vendor invoice <span className="font-mono">{bill.vendor_invoice_no}</span> dated {formatDate(bill.vendor_invoice_date)}
                {bill.received_at && ` · received ${formatDate(bill.received_at)}`}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {canPay && (
                <Link
                  href={`/procurement/payments/new?vendor=${bill.vendor_id}&bill=${bill.id}`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-emerald-700 transition-colors"
                >
                  <Banknote className="size-4" /> Pay vendor
                </Link>
              )}
              <BillWorkflowActions billId={bill.id} status={bill.status} matchStatus={bill.match_status} />
            </div>
          </div>

          {/* Money + due summary */}
          <div className="grid md:grid-cols-4 gap-3 pt-2 border-t border-border">
            <Cell label="Total" value={`₹${formatINR(bill.total)}`} />
            <Cell label="Paid" value={`₹${formatINR(bill.amount_paid)}`} />
            <Cell label="Outstanding" value={`₹${formatINR(bill.amount_outstanding)}`} accent={bill.amount_outstanding > 0 ? 'foreground' : 'muted'} />
            <Cell
              label="Due"
              value={bill.due_date ? formatDate(bill.due_date) : '—'}
              accent={overdue ? 'rose' : 'foreground'}
              hint={overdue ? 'OVERDUE' : null}
            />
          </div>

          {/* Vendor + PO/GRN linkage */}
          <div className="grid md:grid-cols-3 gap-4 pt-2 border-t border-border">
            <div className="flex flex-col gap-1">
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Building2 className="size-3" /> Vendor</div>
              <div className="text-sm font-medium">{bill.vendor_name ?? '—'}</div>
              {bill.vendor_gstin && <div className="text-[11px] text-muted-foreground">GSTIN <span className="font-mono">{bill.vendor_gstin}</span></div>}
              {bill.vendor_msme_status && bill.vendor_msme_status !== 'not_msme' && (
                <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-[10px] w-fit">
                  MSME · {bill.vendor_msme_status}
                </Badge>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-xs text-muted-foreground">Against PO</div>
              {bill.po_id && bill.po_number ? (
                <Link href={`/procurement/orders/${bill.po_id}`} className="text-sm font-mono text-primary hover:underline inline-flex items-center gap-0.5 w-fit">
                  {bill.po_number} <ExternalLink className="size-3" />
                </Link>
              ) : (
                <div className="text-sm text-muted-foreground">Direct (no PO link)</div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-xs text-muted-foreground">Against GRN</div>
              {bill.grn_id && bill.grn_number ? (
                <Link href={`/procurement/grns/${bill.grn_id}`} className="text-sm font-mono text-primary hover:underline inline-flex items-center gap-0.5 w-fit">
                  {bill.grn_number} <ExternalLink className="size-3" />
                </Link>
              ) : (
                <div className="text-sm text-muted-foreground">—</div>
              )}
            </div>
          </div>

          {/* MSME 45-day reminder */}
          {bill.vendor_msme_status && bill.vendor_msme_status !== 'not_msme' && bill.received_at && (
            <div className="rounded-md border border-amber-200 bg-amber-50/50 text-amber-900 px-3 py-2 text-xs inline-flex items-start gap-1.5">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              <span>
                MSMED Act 2006 — payment within <strong>45 days</strong> from {formatDate(bill.received_at)}.
                FIN-020 (P2β) will surface the dues report; for now, set the due date accordingly.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* IRN + GSTR-2B status card */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="text-sm font-medium inline-flex items-center gap-1.5">
            <FileCheck2 className="size-3.5" /> E-invoice IRN + GSTR-2B reconciliation
          </div>
          <IrnForm billId={bill.id} existingIrn={bill.irn_no} existingValidatedAt={bill.irn_validated_at} />
          <div className="pt-2 border-t border-border text-xs flex items-center gap-3 flex-wrap">
            <span className="text-muted-foreground">GSTR-2B:</span>
            {bill.gstr_2b_status === 'matched' && (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="size-3" /> Matched in {bill.gstr_2b_period} · ITC eligible
              </span>
            )}
            {bill.gstr_2b_status === 'not_in_2b' && (
              <span className="inline-flex items-center gap-1 text-rose-700">
                <AlertTriangle className="size-3" /> Booked but not in {bill.gstr_2b_period} · ITC blocked · chase vendor
              </span>
            )}
            {bill.gstr_2b_status === 'mismatched' && (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <AlertTriangle className="size-3" /> Amount mismatch with {bill.gstr_2b_period}
              </span>
            )}
            {(!bill.gstr_2b_status || bill.gstr_2b_status === 'pending') && (
              <span className="text-muted-foreground">Pending — upload the period&apos;s 2B at <Link href="/procurement/gstr-2b" className="text-primary hover:underline">/procurement/gstr-2b</Link></span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Inline approval card */}
      {bill.approval_request_id && <ApprovalCard requestId={bill.approval_request_id} />}

      {bill.cancelled_at && bill.cancellation_reason && (
        <div className="rounded-md border border-rose-200 bg-rose-50/50 text-rose-900 px-3 py-2 text-xs">
          Cancelled on {formatDate(bill.cancelled_at)} · reason: {bill.cancellation_reason}
        </div>
      )}

      {/* Lines — 3-way match grid */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Lines ({bill.lines.length})</div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {mismatchedLineCount > 0 && <span className="text-rose-700">{mismatchedLineCount} flagged</span>}
              {mismatchedLineCount === 0 && bill.match_status === 'matched' && <span className="text-emerald-700">clean match</span>}
            </div>
          </div>

          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-2 font-medium">Description</th>
                  <th className="text-right px-2 py-2 font-medium">Bill qty</th>
                  <th className="text-right px-2 py-2 font-medium">Bill rate</th>
                  <th className="text-right px-2 py-2 font-medium">PO rate</th>
                  <th className="text-left px-2 py-2 font-medium">HSN</th>
                  <th className="text-right px-2 py-2 font-medium">GST</th>
                  <th className="text-right px-2 py-2 font-medium">Total</th>
                  <th className="text-left px-2 py-2 font-medium">Match</th>
                </tr>
              </thead>
              <tbody>
                {bill.lines.map((l) => {
                  const tint = LINE_MATCH_TINT[l.match_status]
                  const rateDelta = l.po_line_rate != null ? Number(l.rate) - Number(l.po_line_rate) : 0
                  return (
                    <tr key={l.id} className="border-t border-border align-top">
                      <td className="px-2 py-2">
                        <div className="font-medium text-foreground">{l.description}</div>
                        <div className="text-[10px] text-muted-foreground tabular-nums">
                          {l.unit}
                          {l.po_line_description && l.po_line_description !== l.description && (
                            <span className="ml-1">· PO: {l.po_line_description}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{l.quantity}</td>
                      <td className="px-2 py-2 text-right tabular-nums">₹{formatINR(l.rate)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                        {l.po_line_rate != null ? `₹${formatINR(l.po_line_rate)}` : '—'}
                        {rateDelta !== 0 && l.match_status === 'rate_mismatch' && (
                          <div className={rateDelta > 0 ? 'text-amber-700 text-[10px]' : 'text-emerald-700 text-[10px]'}>
                            {rateDelta > 0 ? `+₹${rateDelta.toFixed(2)}` : `−₹${Math.abs(rateDelta).toFixed(2)}`}/unit
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 font-mono text-[11px]">
                        {l.hsn_code ?? '—'}
                        {l.po_line_hsn_code && l.hsn_code !== l.po_line_hsn_code && (
                          <div className="text-amber-700 text-[10px]">PO: {l.po_line_hsn_code}</div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{l.gst_rate_pct}%</td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium">₹{formatINR(l.amount_total)}</td>
                      <td className="px-2 py-2">
                        <Badge variant="outline" className={`${tint} text-[10px] font-medium whitespace-nowrap`}>
                          {l.match_status.replace(/_/g, ' ')}
                        </Badge>
                        {l.match_notes && (
                          <div className="text-[10px] text-muted-foreground mt-1 max-w-[200px]">{l.match_notes}</div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Totals + meta */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card size="sm">
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="text-sm font-medium mb-1 inline-flex items-center gap-1.5">
              <Receipt className="size-3.5" /> Totals (from vendor invoice)
            </div>
            <Row label="Subtotal (taxable)" value={`₹${formatINR(bill.subtotal)}`} />
            {bill.discount_amount > 0 && <Row label="Discount" value={`− ₹${formatINR(bill.discount_amount)}`} />}
            {interstate ? (
              <Row label="IGST" value={`₹${formatINR(igstTotal)}`} />
            ) : (
              <>
                <Row label="CGST" value={`₹${formatINR(cgstTotal)}`} />
                <Row label="SGST" value={`₹${formatINR(sgstTotal)}`} />
              </>
            )}
            {bill.round_off !== 0 && <Row label="Round off" value={`${bill.round_off >= 0 ? '+' : ''}₹${formatINR(bill.round_off)}`} />}
            <div className="border-t border-border my-1" />
            <Row label="Grand total" value={`₹${formatINR(bill.total)}`} bold />
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="text-sm font-medium mb-1 inline-flex items-center gap-1.5">
              <FileSignature className="size-3.5" /> Dates + addresses
            </div>
            <TermRow label="Bill date" value={formatDate(bill.bill_date)} />
            <TermRow label="Vendor inv date" value={formatDate(bill.vendor_invoice_date)} />
            <TermRow label="Received on" value={bill.received_at ? formatDate(bill.received_at) : '—'} />
            <TermRow label="Due date" value={bill.due_date ? formatDate(bill.due_date) : '—'} />
            {bill.vendor_address_snapshot && (
              <div className="mt-2 text-[11px] text-muted-foreground border-t border-border pt-2">
                <div className="font-medium text-foreground mb-0.5">Vendor address</div>
                {bill.vendor_address_snapshot}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payments against this bill */}
      {payments.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium inline-flex items-center gap-1.5">
                <Banknote className="size-3.5" /> Payments ({payments.length})
              </div>
              <Link href={`/procurement/payments?bill=${bill.id}`} className="text-xs text-muted-foreground hover:text-foreground">View all →</Link>
            </div>
            <div className="flex flex-col gap-1.5">
              {payments.map((p) => {
                const allocation = p.allocation_count > 0 ? p.gross_amount / p.allocation_count : p.gross_amount
                // Note: for display we show full payment net; the actual allocation to this specific bill
                // can be looked up via getVendorPayment(p.id) — for the inline card we keep it simple.
                void allocation
                const statusTint = p.status === 'posted' ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : p.status === 'cancelled' ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : 'bg-muted text-muted-foreground border-border'
                return (
                  <Link
                    key={p.id}
                    href={`/procurement/payments/${p.id}`}
                    className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 hover:bg-muted/30 transition-colors"
                  >
                    <span className="font-mono text-xs">{p.payment_number}</span>
                    <Badge variant="outline" className={`${statusTint} text-[10px] font-medium`}>{p.status}</Badge>
                    <Badge variant="outline" className="text-[10px] uppercase">{p.payment_mode}</Badge>
                    {p.tds_section && (
                      <Badge variant="outline" className="bg-rose-50 text-rose-800 border-rose-200 text-[10px]">
                        TDS {p.tds_section} · {p.tds_pct}%
                      </Badge>
                    )}
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {formatDate(p.payment_date)}{p.reference_no && <> · <span className="font-mono">{p.reference_no}</span></>}
                    </span>
                    <span className="text-xs flex-1 text-right text-foreground font-medium tabular-nums">net ₹{formatINR(p.net_amount)}</span>
                    <ExternalLink className="size-3 text-muted-foreground" />
                  </Link>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {bill.notes && (
        <Card size="sm">
          <CardContent className="flex flex-col gap-1 text-sm">
            <div className="text-xs text-muted-foreground">Internal notes</div>
            <div className="text-xs">{bill.notes}</div>
          </CardContent>
        </Card>
      )}

      <div className="text-[11px] text-muted-foreground">
        Created {formatDate(bill.created_at)}
        {bill.submitted_at && ` · submitted ${formatDate(bill.submitted_at)}`}
        {bill.approved_at && ` · approved ${formatDate(bill.approved_at)}`}
        {bill.match_run_at && ` · 3-way match ran ${formatDate(bill.match_run_at)}`}
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
    <div className="grid grid-cols-[110px_1fr] gap-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-xs tabular-nums">{value}</span>
    </div>
  )
}

function Cell({ label, value, accent, hint }: { label: string; value: string; accent?: 'rose' | 'foreground' | 'muted'; hint?: string | null }) {
  const valueClass = accent === 'rose' ? 'text-rose-700' : accent === 'muted' ? 'text-muted-foreground' : ''
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${valueClass}`}>{value}</div>
      {hint && <div className="text-[10px] text-rose-700 font-medium">{hint}</div>}
    </div>
  )
}
