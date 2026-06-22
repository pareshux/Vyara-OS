/**
 * /procurement/gstr-2b — GSTR-2B reconciliation dashboard.
 *
 * Per-period view of 2B vs books match. Upload + re-reconcile.
 * Honest gap: portal-sync (auto-pull from GSTN API) deferred to P5γ.
 */
import Link from 'next/link'
import { listGstr2bPeriods, getGstr2bPeriodSummary, listGstr2bEntries, type Gstr2bMatchStatus } from '@/lib/actions/gstr-2b'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Gstr2bUploadButton } from './upload-button'
import { Gstr2bReconcileButton } from './reconcile-button'
import { ChevronLeft, Upload, CheckCircle2, AlertTriangle, FileQuestion, ExternalLink } from 'lucide-react'

function formatMoneyShort(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} cr`
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)} L`
  if (n >= 1_000)       return `₹${(n / 1_000).toFixed(1)} k`
  return `₹${n.toFixed(0)}`
}

function formatPeriod(p: string): string {
  const [y, m] = p.split('-')
  const monthName = new Date(parseInt(y), parseInt(m) - 1).toLocaleString('en-IN', { month: 'long' })
  return `${monthName} ${y}`
}

const MATCH_TINT: Record<string, string> = {
  matched:              'bg-emerald-50 text-emerald-800 border-emerald-200',
  amount_mismatch:      'bg-amber-50 text-amber-800 border-amber-200',
  in_2b_not_in_books:   'bg-rose-50 text-rose-800 border-rose-200',
  in_books_not_in_2b:   'bg-rose-50 text-rose-800 border-rose-200',
  unmatched:            'bg-muted text-muted-foreground border-border',
}

interface PageProps {
  searchParams: Promise<{ period?: string; status?: string }>
}

export default async function Gstr2bPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const periods = await listGstr2bPeriods()
  const selectedPeriod = sp.period ?? periods[0]?.period ?? null
  const statusFilter = (sp.status as Gstr2bMatchStatus | undefined) ?? null

  const [summary, entries] = await Promise.all([
    selectedPeriod ? getGstr2bPeriodSummary(selectedPeriod) : Promise.resolve(null),
    selectedPeriod ? listGstr2bEntries(selectedPeriod, statusFilter ? { match_status: statusFilter } : undefined) : Promise.resolve([]),
  ])

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-6xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/procurement" className="hover:text-foreground inline-flex items-center gap-0.5">
          <ChevronLeft className="size-3.5" /> Procurement
        </Link>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">GSTR-2B reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            Match our vendor bills against the 2B drafted by GSTN. ITC eligibility = bill matched + 2B says ITC available.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedPeriod && <Gstr2bReconcileButton period={selectedPeriod} />}
          <Gstr2bUploadButton />
        </div>
      </div>

      {/* Period picker */}
      {periods.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {periods.map((p) => {
            const active = selectedPeriod === p.period
            return (
              <Link
                key={p.period}
                href={`/procurement/gstr-2b?period=${p.period}`}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:bg-muted/40'
                }`}
              >
                {formatPeriod(p.period)} <span className="opacity-70">({p.entry_count})</span>
              </Link>
            )
          })}
        </div>
      )}

      {periods.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Upload className="size-10 text-muted-foreground/50" />
            <div className="text-sm font-medium text-foreground">No GSTR-2B data uploaded yet</div>
            <div className="text-xs text-muted-foreground max-w-md">
              Download the 2B JSON/CSV from gst.gov.in (GST &gt; Returns &gt; GSTR-2B) for any past month,
              then upload here. Portal-sync (auto-pull via GSTN API) lands in P5γ.
            </div>
            <Gstr2bUploadButton />
          </CardContent>
        </Card>
      ) : summary ? (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiTile
              icon={CheckCircle2}
              label="Matched"
              value={summary.matched_count.toString()}
              hint={formatMoneyShort(summary.matched_value)}
              accent="emerald"
            />
            <KpiTile
              icon={AlertTriangle}
              label="Amount mismatch"
              value={summary.amount_mismatch_count.toString()}
              hint="rate / GST drift"
              accent={summary.amount_mismatch_count > 0 ? 'amber' : 'default'}
            />
            <KpiTile
              icon={FileQuestion}
              label="In 2B, not booked"
              value={summary.unmatched_in_2b_count.toString()}
              hint={formatMoneyShort(summary.unmatched_in_2b_value)}
              accent={summary.unmatched_in_2b_count > 0 ? 'rose' : 'default'}
            />
            <KpiTile
              icon={AlertTriangle}
              label="Booked, not in 2B"
              value={summary.in_books_not_in_2b_count.toString()}
              hint={`${formatMoneyShort(summary.in_books_not_in_2b_value)} · ITC blocked`}
              accent={summary.in_books_not_in_2b_count > 0 ? 'rose' : 'default'}
            />
          </div>

          {/* ITC eligibility summary */}
          <Card>
            <CardContent>
              <div className="text-sm font-medium mb-2">ITC eligibility — {formatPeriod(summary.period)}</div>
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold text-emerald-700 tabular-nums">{formatMoneyShort(summary.itc_eligible_value)}</span> claimable
                ({summary.itc_eligible_count} bills) · matched in 2B with ITC available.
                {summary.in_books_not_in_2b_count > 0 && (
                  <span className="text-rose-700 ml-2">
                    {summary.in_books_not_in_2b_count} bills booked but NOT in 2B — chase vendor for filing.
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Entries table with status filter */}
          <Card>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">2B entries · {entries.length}</div>
                <div className="flex flex-wrap gap-1.5">
                  <Link href={`/procurement/gstr-2b?period=${selectedPeriod}`} className={`text-xs px-2 py-0.5 rounded-full border ${!statusFilter ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-muted/40'}`}>All</Link>
                  <Link href={`/procurement/gstr-2b?period=${selectedPeriod}&status=matched`} className={`text-xs px-2 py-0.5 rounded-full border ${statusFilter === 'matched' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-muted/40'}`}>Matched</Link>
                  <Link href={`/procurement/gstr-2b?period=${selectedPeriod}&status=amount_mismatch`} className={`text-xs px-2 py-0.5 rounded-full border ${statusFilter === 'amount_mismatch' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-muted/40'}`}>Amount mismatch</Link>
                  <Link href={`/procurement/gstr-2b?period=${selectedPeriod}&status=in_2b_not_in_books`} className={`text-xs px-2 py-0.5 rounded-full border ${statusFilter === 'in_2b_not_in_books' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-muted/40'}`}>Not booked</Link>
                </div>
              </div>

              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="text-left px-2 py-2 font-medium">Vendor</th>
                      <th className="text-left px-2 py-2 font-medium">GSTIN</th>
                      <th className="text-left px-2 py-2 font-medium">Invoice</th>
                      <th className="text-right px-2 py-2 font-medium">Total (₹)</th>
                      <th className="text-left px-2 py-2 font-medium">Match</th>
                      <th className="text-left px-2 py-2 font-medium">Our bill</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id} className="border-t border-border align-top">
                        <td className="px-2 py-2">{e.vendor_name ?? '—'}</td>
                        <td className="px-2 py-2 font-mono text-[11px]">{e.vendor_gstin}</td>
                        <td className="px-2 py-2">
                          <div className="font-mono text-[11px]">{e.vendor_invoice_no}</div>
                          <div className="text-[10px] text-muted-foreground">{e.vendor_invoice_date}</div>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{e.total.toFixed(2)}</td>
                        <td className="px-2 py-2">
                          <Badge variant="outline" className={`${MATCH_TINT[e.match_status]} text-[10px]`}>
                            {e.match_status.replace(/_/g, ' ')}
                          </Badge>
                          {e.match_notes && (
                            <div className="text-[10px] text-muted-foreground mt-0.5 max-w-[180px]">{e.match_notes}</div>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {e.matched_bill_id && e.matched_bill_number ? (
                            <Link href={`/procurement/bills/${e.matched_bill_id}`} className="text-primary hover:underline font-mono text-[11px] inline-flex items-center gap-0.5">
                              {e.matched_bill_number} <ExternalLink className="size-2.5" />
                            </Link>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* Honest gap */}
      <Card size="sm">
        <CardContent className="text-xs text-muted-foreground">
          <strong>Manual upload path · v1.</strong> Download the 2B from gst.gov.in &gt; Returns &gt; GSTR-2B as CSV
          and upload here. Auto-pull from GSTN API (using saved credentials) is P5γ — schema captures everything
          needed; only the API client wiring is missing.
        </CardContent>
      </Card>
    </div>
  )
}

function KpiTile({ icon: Icon, label, value, hint, accent }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  hint: string
  accent?: 'rose' | 'amber' | 'emerald' | 'default'
}) {
  const valueClass = accent === 'rose' ? 'text-rose-700' : accent === 'amber' ? 'text-amber-700' : accent === 'emerald' ? 'text-emerald-700' : ''
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-0.5">
      <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
        <Icon className="size-3" /> {label}
      </div>
      <div className={`text-lg font-semibold tabular-nums ${valueClass}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </div>
  )
}
