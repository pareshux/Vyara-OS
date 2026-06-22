/**
 * /procurement/payments/[id] — Vendor payment detail.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getVendorPayment } from '@/lib/actions/vendor-payments'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PaymentWorkflowActions } from './workflow-actions'
import { ChevronLeft, ExternalLink, Building2, Calculator, Banknote, AlertTriangle, Printer } from 'lucide-react'

function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STATUS_TINT: Record<string, string> = {
  draft:     'bg-muted text-muted-foreground border-border',
  posted:    'bg-emerald-50 text-emerald-800 border-emerald-200',
  cancelled: 'bg-rose-50 text-rose-800 border-rose-200',
}

const MODE_TINT: Record<string, string> = {
  neft:          'bg-sky-50 text-sky-800 border-sky-200',
  rtgs:          'bg-indigo-50 text-indigo-800 border-indigo-200',
  cheque:        'bg-amber-50 text-amber-800 border-amber-200',
  upi:           'bg-violet-50 text-violet-800 border-violet-200',
  cash:          'bg-stone-50 text-stone-800 border-stone-200',
  bg_adjustment: 'bg-muted text-muted-foreground border-border',
  on_account:    'bg-muted text-muted-foreground border-border',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PaymentDetailPage({ params }: PageProps) {
  const { id } = await params
  const payment = await getVendorPayment(id)
  if (!payment) notFound()

  const isMsme = payment.vendor_msme_status && payment.vendor_msme_status !== 'not_msme'

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/procurement" className="hover:text-foreground">Procurement</Link>
        <span>/</span>
        <Link href="/procurement/payments" className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> Payments
        </Link>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-semibold tracking-tight font-mono">{payment.payment_number}</h1>
                <Badge variant="outline" className={`${STATUS_TINT[payment.status] ?? STATUS_TINT.draft} text-[11px] font-medium`}>
                  {payment.status}
                </Badge>
                <Badge variant="outline" className={`${MODE_TINT[payment.payment_mode] ?? MODE_TINT.cash} text-[11px] uppercase`}>
                  {payment.payment_mode}
                </Badge>
                {payment.tds_section && (
                  <Badge variant="outline" className="bg-rose-50 text-rose-800 border-rose-200 text-[11px]">
                    TDS {payment.tds_section} · {payment.tds_pct}%
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                Paid {formatDate(payment.payment_date)}
                {payment.reference_no && <> · ref <span className="font-mono">{payment.reference_no}</span></>}
                {payment.bank_account_used && <> · from {payment.bank_account_used}</>}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {payment.status !== 'draft' && payment.status !== 'cancelled' && (
                <Link
                  href={`/procurement/payments/${payment.id}/voucher`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted/40 transition-colors"
                >
                  <Printer className="size-4" /> Print voucher
                </Link>
              )}
              {payment.status === 'posted' && payment.tds_amount > 0 && (
                <Link
                  href={`/procurement/payments/${payment.id}/form-16a`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 text-rose-800 px-3 py-1.5 text-sm font-medium hover:bg-rose-100 transition-colors"
                >
                  <Printer className="size-4" /> Form 16A
                </Link>
              )}
              <PaymentWorkflowActions paymentId={payment.id} status={payment.status} />
            </div>
          </div>

          {/* Money tiles */}
          <div className="grid md:grid-cols-4 gap-3 pt-2 border-t border-border">
            <MoneyCell label="Gross" value={`₹${formatINR(payment.gross_amount)}`} />
            <MoneyCell label="TDS deducted" value={`₹${formatINR(payment.tds_amount)}`} accent={payment.tds_amount > 0 ? 'rose' : 'muted'} />
            <MoneyCell label="Net to vendor" value={`₹${formatINR(payment.net_amount)}`} accent="emerald" />
            <MoneyCell label="Allocations" value={payment.allocations.length.toString()} />
          </div>

          {/* Vendor block */}
          <div className="grid md:grid-cols-2 gap-4 pt-2 border-t border-border">
            <div className="flex flex-col gap-1">
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Building2 className="size-3" /> Vendor</div>
              <div className="text-sm font-medium">{payment.vendor_name ?? '—'}</div>
              <div className="text-[11px] text-muted-foreground space-y-0.5">
                {payment.vendor_gstin && <div>GSTIN <span className="font-mono">{payment.vendor_gstin}</span></div>}
                {payment.vendor_pan ? (
                  <div>PAN <span className="font-mono">{payment.vendor_pan}</span></div>
                ) : (
                  <div className="text-rose-700">No PAN — §206AA higher-rate TDS applies</div>
                )}
                {isMsme && (
                  <div>
                    <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-[10px]">
                      MSME · {payment.vendor_msme_status}
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Calculator className="size-3" /> TDS deposit</div>
              {payment.tds_amount > 0 ? (
                <>
                  <div className="text-sm">
                    ₹{formatINR(payment.tds_amount)} under {payment.tds_section}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Deposit by 7th of next month (Income Tax Act).
                    Quarterly 26Q + Form 16A per vendor in P3β.
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">No TDS deducted on this payment.</div>
              )}
            </div>
          </div>

          {/* MSME 45-day breach reminder */}
          {isMsme && payment.status === 'draft' && (
            <div className="rounded-md border border-amber-200 bg-amber-50/50 text-amber-900 px-3 py-2 text-xs inline-flex items-start gap-1.5">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              <span>MSME vendor — payment within 45 days of supply is mandatory. Posting this payment closes the bills it covers.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {payment.cancelled_at && payment.cancellation_reason && (
        <div className="rounded-md border border-rose-200 bg-rose-50/50 text-rose-900 px-3 py-2 text-xs">
          Cancelled on {formatDate(payment.cancelled_at)} · reason: {payment.cancellation_reason}
        </div>
      )}

      {payment.status === 'reversed' && payment.reversed_at && (
        <div className="rounded-md border border-rose-200 bg-rose-50/50 text-rose-900 px-3 py-2 text-xs">
          <strong>Payment reversed</strong> on {formatDate(payment.reversed_at)} · reason: {payment.reversal_reason ?? '—'}.
          Bills covered by this voucher were restored to outstanding; the voucher is retained for audit only.
        </div>
      )}

      {/* Allocations */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="text-sm font-medium inline-flex items-center gap-1.5">
            <Banknote className="size-3.5" /> Bills settled ({payment.allocations.length})
          </div>

          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-2 font-medium">Bill number</th>
                  <th className="text-left px-2 py-2 font-medium">Vendor invoice</th>
                  <th className="text-right px-2 py-2 font-medium">Bill total</th>
                  <th className="text-right px-2 py-2 font-medium">Allocated to this payment</th>
                </tr>
              </thead>
              <tbody>
                {payment.allocations.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-2 py-2">
                      <Link href={`/procurement/bills/${a.bill_id}`} className="font-mono text-xs text-primary hover:underline inline-flex items-center gap-0.5">
                        {a.bill_number ?? a.bill_id} <ExternalLink className="size-3" />
                      </Link>
                    </td>
                    <td className="px-2 py-2 font-mono">{a.vendor_invoice_no ?? '—'}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{a.bill_total != null ? `₹${formatINR(a.bill_total)}` : '—'}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium">₹{formatINR(a.allocated_amount)}</td>
                  </tr>
                ))}
                <tr className="bg-muted/40 border-t border-border">
                  <td colSpan={3} className="px-2 py-2 text-right font-medium">Total allocated</td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold">₹{formatINR(payment.gross_amount)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {payment.notes && (
        <Card size="sm">
          <CardContent className="flex flex-col gap-1 text-sm">
            <div className="text-xs text-muted-foreground">Internal notes</div>
            <div className="text-xs">{payment.notes}</div>
          </CardContent>
        </Card>
      )}

      <div className="text-[11px] text-muted-foreground">
        Created {formatDate(payment.created_at)}
        {payment.posted_at && ` · posted ${formatDate(payment.posted_at)}`}
      </div>
    </div>
  )
}

function MoneyCell({ label, value, accent }: { label: string; value: string; accent?: 'rose' | 'emerald' | 'muted' }) {
  const valueClass = accent === 'rose' ? 'text-rose-700' : accent === 'emerald' ? 'text-emerald-700' : accent === 'muted' ? 'text-muted-foreground' : ''
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${valueClass}`}>{value}</div>
    </div>
  )
}
