// ─── Field-Activity Day read-model ───────────────────────────
// One assembled "what happened today" object for a rep on a given
// date. Consumed by:
//   - /field page (the rep's own day)
//   - /field/team/[userId] (manager drill-down)
//   - future executive scorecard / per-rep monthly rollup
//
// REVIEW-RULE: All cross-capability rollups for a rep-day go through
// here — visits, attendance, vehicle claim, expenses, tasks. The two
// pages that consume this don't directly read expense / activity
// tables. Same pattern as project-progress.ts and visit-detail.ts.
//
// Why: Constitution Principle #0 and Blueprint FLD-015.

import { createClient } from '@/lib/supabase/server'

export type ClaimStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'exported'

export type FieldDayKpis = {
  visits_completed: number
  visits_planned_open: number
  distance_km: number | null      // total_km from attendance
  duration_minutes: number | null // check_out − check_in if both set
  vehicle_claim_amount: number | null
  expense_total: number           // sum of non-cancelled expense rows for the date
  expense_pending: number         // count of submitted, not yet decided
}

export type FieldDayExpense = {
  id: string
  category_label: string
  amount: number
  status: string
  notes: string | null
  subject_type: string | null
  subject_id: string | null
}

export type FieldDayAttendance = {
  attendance_date: string
  status_for_day: string                 // 'on_duty' / 'wfh' / 'leave' / 'holiday'
  check_in_at: string | null
  check_out_at: string | null
  check_in_odometer_km: number | null
  check_out_odometer_km: number | null
  total_km: number | null
  reimbursement_amount: number | null
  claim_status: ClaimStatus
  rejection_reason: string | null
  vehicle_id: string | null
  vehicle_label: string | null
}

export type FieldDay = {
  date: string                            // 'yyyy-MM-dd' IST
  user: {
    id: string
    full_name: string
    role: string
  }
  attendance: FieldDayAttendance | null
  kpis: FieldDayKpis
  expenses: FieldDayExpense[]
}

/**
 * Build the day rollup for one rep on one date.
 * Returns null when the rep doesn't exist or the caller can't see them.
 */
export async function getFieldDay(userId: string, date: string): Promise<FieldDay | null> {
  const supabase = await createClient()

  // 1. Rep profile (RLS scopes to same tenant).
  const { data: rep } = await supabase
    .from('user_profile')
    .select('id, full_name, role')
    .eq('id', userId)
    .maybeSingle()
  if (!rep) return null

  // 2. Attendance row for the date.
  const { data: attRaw } = await supabase
    .from('field_attendance')
    .select(
      `attendance_date, status_for_day, check_in_at, check_out_at,
       check_in_odometer_km, check_out_odometer_km, total_km,
       reimbursement_amount, claim_status, rejection_reason, vehicle_id,
       vehicle:vehicle(id, registration_number)`,
    )
    .eq('user_id', userId)
    .eq('attendance_date', date)
    .is('deleted_at', null)
    .maybeSingle()

  let attendance: FieldDayAttendance | null = null
  if (attRaw) {
    const att = attRaw as unknown as {
      attendance_date: string
      status_for_day: string
      check_in_at: string | null
      check_out_at: string | null
      check_in_odometer_km: number | null
      check_out_odometer_km: number | null
      total_km: number | null
      reimbursement_amount: number | string | null
      claim_status: ClaimStatus
      rejection_reason: string | null
      vehicle_id: string | null
      vehicle: { id: string; registration_number: string } | { id: string; registration_number: string }[] | null
    }
    const vehRow = Array.isArray(att.vehicle) ? att.vehicle[0] ?? null : att.vehicle
    attendance = {
      attendance_date: att.attendance_date,
      status_for_day: att.status_for_day,
      check_in_at: att.check_in_at,
      check_out_at: att.check_out_at,
      check_in_odometer_km: att.check_in_odometer_km,
      check_out_odometer_km: att.check_out_odometer_km,
      total_km: att.total_km,
      reimbursement_amount: att.reimbursement_amount != null ? Number(att.reimbursement_amount) : null,
      claim_status: att.claim_status,
      rejection_reason: att.rejection_reason,
      vehicle_id: att.vehicle_id,
      vehicle_label: vehRow?.registration_number ?? null,
    }
  }

  // 3. Visit counts. We pull just the counts to keep the read cheap;
  // the consuming page renders the visit cards from its own list.
  // - completed visits on the date
  // - planned visits still open on the date (task with type='planned_visit')
  const startOfDay = `${date}T00:00:00+05:30`
  const endOfDay = `${date}T23:59:59+05:30`

  const { count: completedCount } = await supabase
    .from('field_visit')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('state', 'completed')
    .gte('visited_at', startOfDay)
    .lte('visited_at', endOfDay)
    .is('deleted_at', null)

  const { count: plannedOpenCount } = await supabase
    .from('task')
    .select('id', { count: 'exact', head: true })
    .eq('assignee_id', userId)
    .eq('type', 'planned_visit')
    .eq('is_done', false)
    .gte('due_at', startOfDay)
    .lte('due_at', endOfDay)
    .is('deleted_at', null)

  // 4. Expenses logged on the date.
  const { data: expRaw } = await supabase
    .from('expense')
    .select(
      `id, amount, status, notes, subject_type, subject_id,
       category:expense_category!inner(label)`,
    )
    .eq('user_id', userId)
    .eq('expense_date', date)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  const expenses: FieldDayExpense[] = (
    (expRaw ?? []) as unknown as Array<{
      id: string
      amount: number | string
      status: string
      notes: string | null
      subject_type: string | null
      subject_id: string | null
      category: { label: string } | { label: string }[]
    }>
  ).map((e) => {
    const cat = Array.isArray(e.category) ? e.category[0] : e.category
    return {
      id: e.id,
      category_label: cat?.label ?? '—',
      amount: Number(e.amount),
      status: e.status,
      notes: e.notes,
      subject_type: e.subject_type,
      subject_id: e.subject_id,
    }
  })

  // Exclude cancelled rows from the total but include drafts.
  const expenseTotal = expenses
    .filter((e) => e.status !== 'cancelled')
    .reduce((acc, e) => acc + e.amount, 0)
  const expensePending = expenses.filter((e) => e.status === 'submitted').length

  // 5. Day duration from attendance.
  let duration: number | null = null
  if (attendance?.check_in_at && attendance?.check_out_at) {
    const ms = new Date(attendance.check_out_at).getTime() - new Date(attendance.check_in_at).getTime()
    if (ms > 0) duration = Math.round(ms / 60000)
  }

  return {
    date,
    user: { id: rep.id, full_name: rep.full_name, role: rep.role },
    attendance,
    kpis: {
      visits_completed: completedCount ?? 0,
      visits_planned_open: plannedOpenCount ?? 0,
      distance_km: attendance?.total_km ?? null,
      duration_minutes: duration,
      vehicle_claim_amount: attendance?.reimbursement_amount ?? null,
      expense_total: expenseTotal,
      expense_pending: expensePending,
    },
    expenses,
  }
}
