/**
 * /field/team/attendance — per-rep attendance rollup.
 *
 * Server component. Period picker via URL query (?period=week|month|custom
 * & ?start=&end=). Matches the canonical raw-table chrome from /invoices.
 *
 * Out of scope: payroll computation, leave balances, performance ledger
 * — those live in the customer's HR system; this page produces the
 * CSV they'd import into it.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Users, ChevronRight, FileDown, AlertCircle } from 'lucide-react'
import { getTeamAttendance, type AttendancePeriod } from '@/lib/read-models/team-attendance'
import { ListFilter } from '@/components/app/list-filter'

export const dynamic = 'force-dynamic'

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function fmtHours(h: number): string {
  return `${h.toFixed(1)} h`
}

function fmtINR(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

export default async function AttendanceReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string; q?: string; role?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const period = (['week', 'month', 'custom'].includes(sp.period ?? '') ? sp.period : 'month') as AttendancePeriod

  const result = await getTeamAttendance(supabase, period, sp.start, sp.end)
  if (!result.ok) {
    return (
      <div className="p-4 md:p-6 max-w-6xl">
        <Card><CardContent className="py-5 text-sm text-destructive">{result.error}</CardContent></Card>
      </div>
    )
  }
  const { period: range, reps: allReps, totals: rawTotals } = result.data

  // Server-side filter — search by name (case-insensitive substring) + role select
  const qLower = (sp.q ?? '').trim().toLowerCase()
  const roleFilter = sp.role && sp.role !== '__all__' ? sp.role : null
  const reps = allReps.filter((r) => {
    if (qLower && !r.full_name.toLowerCase().includes(qLower)) return false
    if (roleFilter && r.role !== roleFilter) return false
    return true
  })
  // Recompute totals from the filtered set so the strip + filters agree
  const totals = (qLower || roleFilter)
    ? reps.reduce((acc, r) => ({
        days_on_duty: acc.days_on_duty + r.days_on_duty,
        days_wfh: acc.days_wfh + r.days_wfh,
        days_leave: acc.days_leave + r.days_leave,
        total_hours: acc.total_hours + r.total_hours,
        total_km: acc.total_km + r.total_km,
        reimbursement_amount: acc.reimbursement_amount + r.reimbursement_amount,
      }), { days_on_duty: 0, days_wfh: 0, days_leave: 0, total_hours: 0, total_km: 0, reimbursement_amount: 0 })
    : rawTotals

  const exportHref = `/field/team/attendance/export?period=${period}` +
    (sp.start ? `&start=${sp.start}` : '') +
    (sp.end ? `&end=${sp.end}` : '') +
    (sp.q ? `&q=${encodeURIComponent(sp.q)}` : '') +
    (sp.role ? `&role=${encodeURIComponent(sp.role)}` : '')

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/field" className="hover:text-foreground">Field</Link>
        <ChevronRight className="size-3.5" />
        <Link href="/field/team" className="hover:text-foreground">Team</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">Attendance</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Users className="size-5 text-primary" />
            Attendance report
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {range.label} · {range.start_date} → {range.end_date} · {range.days} days
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Period picker */}
          <form className="flex items-center gap-1.5">
            <PeriodLink current={period} value="week">Week</PeriodLink>
            <PeriodLink current={period} value="month">Month</PeriodLink>
            <PeriodLink current={period} value="custom" customStart={range.start_date} customEnd={range.end_date}>Custom</PeriodLink>
          </form>
          {/* Custom range inputs — render only when period=custom */}
          {period === 'custom' && (
            <form className="flex items-center gap-1">
              <input
                type="date" name="start" defaultValue={range.start_date}
                className="h-8 px-2 text-xs rounded-md border border-border bg-card"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <input
                type="date" name="end" defaultValue={range.end_date}
                className="h-8 px-2 text-xs rounded-md border border-border bg-card"
              />
              <input type="hidden" name="period" value="custom" />
              <Button type="submit" size="sm" variant="outline" className="h-8 text-xs">Go</Button>
            </form>
          )}
          <Link href={exportHref}>
            <Button size="sm" variant="outline">
              <FileDown className="size-4 mr-1.5" />
              Export CSV
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters — search + role */}
      <ListFilter
        searchKey="q"
        searchPlaceholder="Search reps…"
        selects={[
          { key: 'role', label: 'Role', placeholder: 'All roles', options: [
            { value: 'admin',          label: 'Admin' },
            { value: 'manager',        label: 'Manager' },
            { value: 'sales_engineer', label: 'Sales engineer' },
          ]},
        ]}
        keepParams={['period', 'start', 'end']}
      />

      {/* Totals strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <TotalCard label="On-duty days"   value={`${totals.days_on_duty}`} />
        <TotalCard label="WFH days"       value={`${totals.days_wfh}`} />
        <TotalCard label="Leave days"     value={`${totals.days_leave}`} />
        <TotalCard label="Total hours"    value={fmtHours(totals.total_hours)} />
        <TotalCard label="Reimbursement"  value={fmtINR(totals.reimbursement_amount)} />
      </div>

      {/* Rollup table */}
      {reps.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No active reps in the tenant.</CardContent></Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Rep</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">On duty</th>
                <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground md:table-cell whitespace-nowrap">WFH</th>
                <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground md:table-cell whitespace-nowrap">Leave</th>
                <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground lg:table-cell whitespace-nowrap">Holiday</th>
                <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground lg:table-cell whitespace-nowrap">No record</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Total hours</th>
                <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground md:table-cell whitespace-nowrap">Total km</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Reimbursement</th>
              </tr>
            </thead>
            <tbody>
              {reps.map((r) => (
                <tr key={r.user_id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Link href={`/field/team/${r.user_id}`} className="flex items-center gap-2.5 text-foreground hover:text-primary">
                      <div className="flex size-8 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground shrink-0">
                        {initials(r.full_name)}
                      </div>
                      <div>
                        <p className="text-sm font-medium leading-tight">{r.full_name}</p>
                        <p className="text-[10px] uppercase text-muted-foreground tracking-wide">{r.role.replace('_', ' ')}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    <span className="text-foreground font-medium">{r.days_on_duty}</span>
                    {r.days_open > 0 && (
                      <Badge variant="outline" className="ml-1.5 text-[10px] uppercase border-0 bg-amber-50 text-amber-700" title={`${r.days_open} day(s) checked in but never checked out — hours not counted`}>
                        <AlertCircle className="size-2.5 mr-0.5" />
                        {r.days_open} open
                      </Badge>
                    )}
                  </td>
                  <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell whitespace-nowrap">{r.days_wfh || <span className="text-muted-foreground/50">—</span>}</td>
                  <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell whitespace-nowrap">{r.days_leave || <span className="text-muted-foreground/50">—</span>}</td>
                  <td className="hidden px-3 py-2 text-right tabular-nums lg:table-cell whitespace-nowrap">{r.days_holiday || <span className="text-muted-foreground/50">—</span>}</td>
                  <td className="hidden px-3 py-2 text-right tabular-nums lg:table-cell whitespace-nowrap text-muted-foreground">{r.days_no_record}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium whitespace-nowrap">{fmtHours(r.total_hours)}</td>
                  <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell whitespace-nowrap">{r.total_km.toLocaleString('en-IN', { maximumFractionDigits: 0 })} km</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium whitespace-nowrap">{fmtINR(r.reimbursement_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground italic">
        Total hours = sum of (check-out − check-in) for on-duty days where both timestamps are set. Days marked &ldquo;open&rdquo; (checked in but never checked out) are excluded from total hours and surfaced as a hygiene flag. <strong>For payroll, leave-balance accounting, or performance ledger,</strong> export to your HR system (Zoho People / Keka / GreytHR / etc.) via the CSV button — this page is for field-manager visibility, not HR-of-record.
      </p>
    </div>
  )
}

function TotalCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-[10px] uppercase font-medium text-muted-foreground tracking-wide">{label}</p>
      <p className="text-lg font-semibold mt-0.5 tabular-nums">{value}</p>
    </div>
  )
}

function PeriodLink({
  current, value, customStart, customEnd, children,
}: {
  current: AttendancePeriod
  value: 'week' | 'month' | 'custom'
  customStart?: string
  customEnd?: string
  children: React.ReactNode
}) {
  const isActive = current === value
  const href = value === 'custom' && customStart && customEnd
    ? `?period=custom&start=${customStart}&end=${customEnd}`
    : `?period=${value}`
  return (
    <Link
      href={href}
      className={`h-8 px-3 text-xs rounded-md border inline-flex items-center transition-colors ${
        isActive ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted/30'
      }`}
    >
      {children}
    </Link>
  )
}
