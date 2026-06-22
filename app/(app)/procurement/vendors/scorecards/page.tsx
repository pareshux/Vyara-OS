/**
 * /procurement/vendors/scorecards — Vendor performance scorecards (P6 lite).
 *
 * One row per vendor per FY: PO count, total spend, on-time %, qty
 * acceptance %, mismatch count, outstanding. Auto-graded A/B/C/unrated
 * via the read-model helpers. FY toggle via ?fy= query param.
 *
 * Vendors with no activity in the FY are filtered out at the view level.
 */
import Link from 'next/link'
import {
  getVendorScorecards,
  currentFyStartYear,
  type VendorScorecardRow,
} from '@/lib/read-models/vendor-scorecard'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, Award, Building2, AlertCircle, Trophy } from 'lucide-react'

function fmtMoneyShort(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} cr`
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)} k`
  return `₹${n.toFixed(0)}`
}

const GRADE_META: Record<VendorScorecardRow['grade'], { label: string; bg: string; border: string; text: string }> = {
  A: { label: 'A · Excellent', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800' },
  B: { label: 'B · Good', bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-800' },
  C: { label: 'C · Needs attention', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800' },
  unrated: { label: 'Unrated', bg: 'bg-stone-50', border: 'border-stone-200', text: 'text-stone-700' },
}

function fyLabel(start: number) {
  return `FY ${start}-${String(start + 1).slice(-2)}`
}

export default async function VendorScorecardsPage(props: { searchParams: Promise<{ fy?: string }> }) {
  const params = await props.searchParams
  const fy = params.fy ? parseInt(params.fy, 10) : currentFyStartYear()
  const snapshot = await getVendorScorecards(fy)
  const { rows, totals } = snapshot

  // Build FY options: current FY + 2 prior
  const fyOptions = [currentFyStartYear(), currentFyStartYear() - 1, currentFyStartYear() - 2]

  return (
    <div className="px-4 py-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/procurement"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" /> Procurement
          </Link>
          <h1 className="text-2xl font-semibold mt-1">Vendor scorecards</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Performance summary per vendor for {fyLabel(fy)} — derived from PO + GRN + bill activity.
          </p>
        </div>
        <div className="flex gap-1">
          {fyOptions.map((y) => (
            <Link
              key={y}
              href={`/procurement/vendors/scorecards?fy=${y}`}
              className={`px-3 py-1.5 text-xs rounded-md border ${
                y === fy
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-muted'
              }`}
            >
              {fyLabel(y)}
            </Link>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Vendors with activity" value={totals.vendor_count.toString()} icon={<Building2 className="size-4" />} />
        <KpiCard label="Total spend" value={fmtMoneyShort(totals.total_spend)} icon={<Award className="size-4" />} />
        <KpiCard
          label="Avg on-time delivery"
          value={totals.avg_on_time_pct !== null ? `${totals.avg_on_time_pct}%` : '—'}
          subtle={totals.avg_on_time_pct === null ? 'no PO has expected_delivery_at yet' : undefined}
        />
        <KpiCard
          label="Avg acceptance"
          value={totals.avg_acceptance_pct !== null ? `${totals.avg_acceptance_pct}%` : '—'}
          subtle={totals.avg_acceptance_pct === null ? 'no GRN qty received yet' : undefined}
        />
      </div>

      {/* Grade rollup */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold mb-3">Vendor grades · {fyLabel(fy)}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <GradeTile label="A · Excellent" count={totals.grade_a_count} bg="bg-emerald-50" border="border-emerald-200" text="text-emerald-800" />
            <GradeTile label="B · Good" count={totals.grade_b_count} bg="bg-sky-50" border="border-sky-200" text="text-sky-800" />
            <GradeTile label="C · Needs attention" count={totals.grade_c_count} bg="bg-amber-50" border="border-amber-200" text="text-amber-800" />
            <GradeTile label="MSME vendors" count={totals.msme_vendor_count} sublabel={fmtMoneyShort(totals.msme_vendor_spend)} bg="bg-violet-50" border="border-violet-200" text="text-violet-800" />
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
            Grade A: on-time ≥ 90% · acceptance ≥ 98% · zero mismatched bills. Grade B: on-time ≥ 70% · acceptance ≥ 95%. Grade C: anything below. Vendors with no measurable activity show as unrated.
          </p>
        </CardContent>
      </Card>

      {/* Vendor rows */}
      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            <Building2 className="size-8 mx-auto mb-2 opacity-40" />
            No vendor activity in {fyLabel(fy)}. Raise a PO or post a GRN to start building the scorecard.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">#</th>
                    <th className="text-left px-4 py-2.5 font-medium">Vendor</th>
                    <th className="text-center px-3 py-2.5 font-medium">Grade</th>
                    <th className="text-right px-3 py-2.5 font-medium">POs</th>
                    <th className="text-right px-3 py-2.5 font-medium">PO value</th>
                    <th className="text-right px-3 py-2.5 font-medium">GRNs</th>
                    <th className="text-right px-3 py-2.5 font-medium">On-time</th>
                    <th className="text-right px-3 py-2.5 font-medium">Acceptance</th>
                    <th className="text-right px-3 py-2.5 font-medium">Bills</th>
                    <th className="text-right px-3 py-2.5 font-medium">Mismatched</th>
                    <th className="text-right px-3 py-2.5 font-medium">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r, i) => {
                    const grade = GRADE_META[r.grade]
                    return (
                      <tr key={r.vendor_id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                          <div className="flex items-center gap-1.5">
                            {i < 3 && <Trophy className={`size-3.5 ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-stone-400' : 'text-orange-700'}`} />}
                            {i + 1}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{r.vendor_name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {r.msme_status && r.msme_status !== 'not_msme' && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-violet-200 bg-violet-50 text-violet-700">
                                MSME · {r.msme_status}
                              </Badge>
                            )}
                            {r.gstin && <span className="font-mono text-[10px] text-muted-foreground">{r.gstin}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 text-[11px] rounded border ${grade.bg} ${grade.border} ${grade.text}`}>
                            {r.grade}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.po_count}</td>
                        <td className="px-3 py-3 text-right tabular-nums font-medium">{fmtMoneyShort(r.po_value)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.grn_count}</td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {r.on_time_pct !== null ? (
                            <span className={r.on_time_pct >= 90 ? 'text-emerald-700 font-medium' : r.on_time_pct >= 70 ? 'text-sky-700' : 'text-amber-700'}>
                              {r.on_time_pct}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {r.acceptance_pct !== null ? (
                            <span className={r.acceptance_pct >= 98 ? 'text-emerald-700 font-medium' : r.acceptance_pct >= 95 ? 'text-sky-700' : 'text-amber-700'}>
                              {r.acceptance_pct}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.bill_count}</td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {r.mismatched_count > 0 ? (
                            <span className="inline-flex items-center gap-1 text-amber-700">
                              <AlertCircle className="size-3" /> {r.mismatched_count}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">0</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {r.outstanding_total > 0 ? (
                            <span className="text-rose-700">{fmtMoneyShort(r.outstanding_total)}</span>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
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
      )}

      <p className="text-[11px] text-muted-foreground text-center">
        Vendors ranked by PO value in {fyLabel(fy)}. Grading thresholds tune per industry — adjust in the read-model
        (<span className="font-mono">lib/read-models/vendor-scorecard.ts</span>) if Tier-2 customers want softer bands.
      </p>
    </div>
  )
}

function KpiCard({ label, value, subtle, icon }: { label: string; value: string; subtle?: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {subtle && <div className="text-[10px] text-muted-foreground mt-1">{subtle}</div>}
      </CardContent>
    </Card>
  )
}

function GradeTile({ label, count, sublabel, bg, border, text }: { label: string; count: number; sublabel?: string; bg: string; border: string; text: string }) {
  return (
    <div className={`${bg} border ${border} rounded-md p-3`}>
      <div className={`text-xs ${text} font-medium`}>{label}</div>
      <div className="text-xl font-semibold tabular-nums mt-1">{count}</div>
      {sublabel && <div className="text-[11px] text-muted-foreground mt-0.5">{sublabel}</div>}
    </div>
  )
}
