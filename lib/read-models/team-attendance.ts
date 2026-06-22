/**
 * lib/read-models/team-attendance.ts — per-rep attendance rollup
 * across a date range. Powers /field/team/attendance + the CSV export.
 *
 * Honest scope (Constitution v3 §5):
 * - In scope: field-manager visibility, reimbursement, manager KPIs
 * - Out of scope: payroll computation, leave-balance accounting, HR
 *   performance ledger — those live in the customer's HR system
 *   (Zoho People / Keka / GreytHR / Darwinbox). This rollup is the
 *   data they'd CSV-import into that system, not a replacement.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type AttendancePeriod = 'week' | 'month' | 'custom'

export type PeriodRange = {
  start_date: string  // YYYY-MM-DD (inclusive)
  end_date:   string  // YYYY-MM-DD (inclusive)
  days:       number
  label:      string  // human-readable: "Last 7 days" / "Last 30 days" / "1 May – 22 Jun"
}

export function resolvePeriod(
  period: AttendancePeriod,
  now: Date = new Date(),
  customStart?: string,
  customEnd?: string,
): PeriodRange {
  const ymd = (d: Date) => d.toISOString().slice(0, 10)
  if (period === 'custom') {
    const start = customStart ?? ymd(new Date(now.getTime() - 30 * 86400000))
    const end = customEnd ?? ymd(now)
    const days = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
    const fmt = (s: string) => new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    return { start_date: start, end_date: end, days, label: `${fmt(start)} – ${fmt(end)}` }
  }
  const days = period === 'week' ? 7 : 30
  const start = new Date(now.getTime() - (days - 1) * 86400000)
  return {
    start_date: ymd(start),
    end_date: ymd(now),
    days,
    label: period === 'week' ? 'Last 7 days' : 'Last 30 days',
  }
}

export type RepRollup = {
  user_id: string
  full_name: string
  role: string
  days_on_duty:   number
  days_wfh:       number
  days_leave:     number
  days_holiday:   number
  days_no_record: number   // expected work-days with no attendance row
  total_hours:    number   // sum of (check_out - check_in) for on-duty days with both set
  total_km:       number
  reimbursement_amount: number
  /** Days where the rep checked in but didn't check out (open day OR
   *  forgot to check out). Excluded from total_hours; surfaced as
   *  hygiene signal. */
  days_open:      number
}

export type TeamAttendanceResult = {
  period: PeriodRange
  reps: RepRollup[]
  totals: {
    days_on_duty:   number
    days_wfh:       number
    days_leave:     number
    total_hours:    number
    total_km:       number
    reimbursement_amount: number
  }
}

export async function getTeamAttendance(
  supabase: SupabaseClient,
  period: AttendancePeriod = 'month',
  customStart?: string,
  customEnd?: string,
): Promise<{ ok: true; data: TeamAttendanceResult } | { ok: false; error: string }> {
  // Resolve current user's tenant
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('user_profile').select('tenant_id, role').eq('id', user.id).single()
  if (!profile) return { ok: false, error: 'Profile not found' }
  if (profile.role !== 'admin' && profile.role !== 'manager') {
    return { ok: false, error: 'Manager / admin only' }
  }

  const range = resolvePeriod(period, new Date(), customStart, customEnd)

  // 1. Field-eligible users (admin + manager + sales_engineer)
  const { data: users, error: uErr } = await supabase
    .from('user_profile')
    .select('id, full_name, role')
    .eq('tenant_id', profile.tenant_id)
    .eq('is_active', true)
    .in('role', ['admin', 'manager', 'sales_engineer'])
    .order('full_name')
  if (uErr) return { ok: false, error: uErr.message }

  // 2. Attendance rows in range
  const { data: rows, error: aErr } = await supabase
    .from('field_attendance')
    .select('user_id, attendance_date, status_for_day, check_in_at, check_out_at, total_km, reimbursement_amount')
    .gte('attendance_date', range.start_date)
    .lte('attendance_date', range.end_date)
    .is('deleted_at', null)
  if (aErr) return { ok: false, error: aErr.message }

  type Row = {
    user_id: string; attendance_date: string; status_for_day: string
    check_in_at: string | null; check_out_at: string | null
    total_km: number | null; reimbursement_amount: number | null
  }
  const byUser = new Map<string, Row[]>()
  for (const r of (rows ?? []) as Row[]) {
    const list = byUser.get(r.user_id) ?? []
    list.push(r); byUser.set(r.user_id, list)
  }

  // 3. Roll up per user
  const reps: RepRollup[] = (users ?? []).map((u) => {
    const rs = byUser.get(u.id as string) ?? []
    const r: RepRollup = {
      user_id: u.id as string,
      full_name: u.full_name as string,
      role: u.role as string,
      days_on_duty: 0, days_wfh: 0, days_leave: 0, days_holiday: 0,
      days_no_record: 0, total_hours: 0, total_km: 0,
      reimbursement_amount: 0, days_open: 0,
    }
    for (const row of rs) {
      if (row.status_for_day === 'on_duty') {
        r.days_on_duty += 1
        if (row.check_in_at && row.check_out_at) {
          const ms = new Date(row.check_out_at).getTime() - new Date(row.check_in_at).getTime()
          if (ms > 0) r.total_hours += ms / 3_600_000
        } else if (row.check_in_at && !row.check_out_at) {
          r.days_open += 1
        }
      } else if (row.status_for_day === 'wfh')     r.days_wfh += 1
      else if (row.status_for_day === 'leave')   r.days_leave += 1
      else if (row.status_for_day === 'holiday') r.days_holiday += 1
      r.total_km += Number(row.total_km ?? 0)
      r.reimbursement_amount += Number(row.reimbursement_amount ?? 0)
    }
    // Best-effort "no record" — within the period, days NOT covered by any row.
    // Cheap heuristic: range.days - (attendance rows for this user). Excludes
    // weekends/holidays unless the tenant explicitly logged them as 'holiday'.
    r.days_no_record = Math.max(0, range.days - rs.length)
    return r
  })

  const totals = reps.reduce((acc, r) => ({
    days_on_duty: acc.days_on_duty + r.days_on_duty,
    days_wfh: acc.days_wfh + r.days_wfh,
    days_leave: acc.days_leave + r.days_leave,
    total_hours: acc.total_hours + r.total_hours,
    total_km: acc.total_km + r.total_km,
    reimbursement_amount: acc.reimbursement_amount + r.reimbursement_amount,
  }), { days_on_duty: 0, days_wfh: 0, days_leave: 0, total_hours: 0, total_km: 0, reimbursement_amount: 0 })

  return { ok: true, data: { period: range, reps, totals } }
}

/** CSV serialisation — matches the column set of the on-page table.
 *  Used by both the export route and any future scheduled CSV email. */
export function repsToCsv(reps: RepRollup[]): string {
  const header = [
    'rep_name', 'role',
    'days_on_duty', 'days_wfh', 'days_leave', 'days_holiday', 'days_no_record', 'days_open',
    'total_hours', 'total_km', 'reimbursement_amount',
  ].join(',')
  const lines = reps.map((r) => [
    `"${r.full_name.replace(/"/g, '""')}"`,
    r.role,
    r.days_on_duty, r.days_wfh, r.days_leave, r.days_holiday, r.days_no_record, r.days_open,
    r.total_hours.toFixed(2),
    r.total_km.toFixed(2),
    r.reimbursement_amount.toFixed(2),
  ].join(','))
  return [header, ...lines].join('\n') + '\n'
}
