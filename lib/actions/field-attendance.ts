'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getFieldSettings } from '@/lib/tenants/settings'

/** ─────────────────────────────────────────────────────────────
 *  Field Attendance — server actions
 *
 *  One row per (tenant, user, attendance_date). The row carries
 *  the check-in, check-out, vehicle, odometer, and the
 *  auto-computed reimbursement claim.
 *
 *  Date semantics: "today" is computed in Asia/Kolkata so a rep
 *  checking in at 11pm local time gets the right day's row.
 *
 *  Tenant settings (auto_approve_threshold_rupees, working_hours,
 *  geofence_radius_m, …) come from the typed helper in
 *  lib/tenants/settings.ts — schema enforced + cached per render.
 *  ───────────────────────────────────────────────────────────── */

function todayInIST(): string {
  // sv-SE locale formats as YYYY-MM-DD.
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' })
}

async function getActorContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role, full_name')
    .eq('id', user.id)
    .single()
  if (!profile) return null
  return {
    supabase,
    userId: user.id,
    tenantId: profile.tenant_id as string,
    role: profile.role as string,
    fullName: profile.full_name as string,
  }
}

function isAdminish(role: string) { return role === 'admin' || role === 'manager' }

/* ─── Read helpers ──────────────────────────────────────────── */

export type TodayContext = {
  date: string
  attendance: {
    id: string
    status_for_day: 'on_duty' | 'wfh' | 'leave' | 'holiday'
    check_in_at: string | null
    check_in_odometer_km: number | null
    check_out_at: string | null
    check_out_odometer_km: number | null
    vehicle_id: string | null
    total_km: number | null
    rate_applied: number | null
    reimbursement_amount: number | null
    claim_status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'exported'
    submitted_at: string | null
    approved_at: string | null
    rejection_reason: string | null
    notes: string | null
  } | null
  vehicles: Array<{
    id: string
    vehicle_number: string
    type_label: string
    fuel_label: string
    custom_rate_per_km: number | null
    matrix_rate_per_km: number | null
  }>
  autoApproveThresholdRupees: number
  /** Pre-fill suggestion for the rep's next odometer reading. Pulled
   *  from their most recent attendance row (yesterday's check-out, or
   *  their last check-in if that's all there is). null = first day. */
  lastKnownOdometer: number | null
}

export async function getTodayContext(): Promise<TodayContext | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }

  const date = todayInIST()

  // Tenant settings — schema-validated, cached per render.
  const fieldSettings = await getFieldSettings()
  const threshold = fieldSettings.auto_approve_threshold_rupees

  // Last known odometer — for pre-filling the check-in screen across days.
  // We look at the rep's most recent attendance row (today's if it exists,
  // else previous days) and pick whichever odometer was most recently set.
  const { data: priorAttendance } = await ctx.supabase
    .from('field_attendance')
    .select('check_in_odometer_km, check_out_odometer_km, attendance_date')
    .eq('user_id', ctx.userId)
    .is('deleted_at', null)
    .order('attendance_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  const lastKnownOdometer = priorAttendance
    ? (priorAttendance.check_out_odometer_km ?? priorAttendance.check_in_odometer_km ?? null)
    : null

  // Today's attendance row (if any).
  const { data: attRaw } = await ctx.supabase
    .from('field_attendance')
    .select(`
      id, status_for_day, check_in_at, check_in_odometer_km,
      check_out_at, check_out_odometer_km, vehicle_id, total_km,
      rate_applied, reimbursement_amount, claim_status,
      submitted_at, approved_at, rejection_reason, notes
    `)
    .eq('user_id', ctx.userId)
    .eq('attendance_date', date)
    .is('deleted_at', null)
    .maybeSingle()

  // Only the rep's own assigned vehicles. Reps don't pick from a
  // tenant-wide pool every morning — assignment happens in /admin/vehicles.
  const { data: vehicles } = await ctx.supabase
    .from('vehicle')
    .select(`
      id, vehicle_number, vehicle_type_id, fuel_type_id, custom_rate_per_km,
      vehicle_type:vehicle_type_id(label),
      fuel_type:fuel_type_id(label)
    `)
    .eq('is_active', true)
    .eq('assigned_user_id', ctx.userId)
    .is('deleted_at', null)
    .order('vehicle_number')

  // Current matrix rates.
  const { data: rates } = await ctx.supabase
    .from('vehicle_reimbursement_rate')
    .select('vehicle_type_id, fuel_type_id, rate_per_km')
    .is('deleted_at', null)
    .is('effective_to', null)
  const rateMap = new Map<string, number>()
  for (const r of rates ?? []) {
    rateMap.set(`${r.vehicle_type_id}::${r.fuel_type_id}`, Number(r.rate_per_km))
  }

  const vehiclesOut: TodayContext['vehicles'] = (vehicles ?? []).map((v) => {
    const type = Array.isArray(v.vehicle_type) ? v.vehicle_type[0] : v.vehicle_type
    const fuel = Array.isArray(v.fuel_type) ? v.fuel_type[0] : v.fuel_type
    return {
      id: v.id as string,
      vehicle_number: v.vehicle_number as string,
      type_label: (type?.label as string) ?? '—',
      fuel_label: (fuel?.label as string) ?? '—',
      custom_rate_per_km: v.custom_rate_per_km != null ? Number(v.custom_rate_per_km) : null,
      matrix_rate_per_km: rateMap.get(`${v.vehicle_type_id}::${v.fuel_type_id}`) ?? null,
    }
  })

  return {
    date,
    attendance: attRaw
      ? {
          ...attRaw,
          check_in_odometer_km: attRaw.check_in_odometer_km != null ? Number(attRaw.check_in_odometer_km) : null,
          check_out_odometer_km: attRaw.check_out_odometer_km != null ? Number(attRaw.check_out_odometer_km) : null,
          total_km: attRaw.total_km != null ? Number(attRaw.total_km) : null,
          rate_applied: attRaw.rate_applied != null ? Number(attRaw.rate_applied) : null,
          reimbursement_amount: attRaw.reimbursement_amount != null ? Number(attRaw.reimbursement_amount) : null,
        }
      : null,
    vehicles: vehiclesOut,
    autoApproveThresholdRupees: threshold,
    lastKnownOdometer: lastKnownOdometer != null ? Number(lastKnownOdometer) : null,
  }
}

/* ─── Mutations ─────────────────────────────────────────────── */

/**
 * Mark today as WFH / leave / holiday. Creates the row if missing.
 * Does NOT allow flipping a row that already has a check-in.
 */
export async function setDayStatus(
  status: 'on_duty' | 'wfh' | 'leave' | 'holiday',
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }

  const date = todayInIST()
  const { data: existing } = await ctx.supabase
    .from('field_attendance')
    .select('id, check_in_at')
    .eq('user_id', ctx.userId)
    .eq('attendance_date', date)
    .is('deleted_at', null)
    .maybeSingle()

  if (existing?.check_in_at) {
    return { error: 'You\'ve already checked in today. Change status by checking out and then editing the day.' }
  }

  if (existing) {
    const { error } = await ctx.supabase
      .from('field_attendance')
      .update({
        status_for_day: status,
        updated_by: ctx.userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await ctx.supabase
      .from('field_attendance')
      .insert({
        tenant_id: ctx.tenantId,
        user_id: ctx.userId,
        attendance_date: date,
        status_for_day: status,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
    if (error) return { error: error.message }
  }

  revalidatePath('/field')
  revalidatePath('/dashboard')
  return { success: true }
}

/**
 * Check in for the day. Captures vehicle, odometer, geo, optional photo.
 * If the row doesn't exist yet, it's created (status_for_day=on_duty).
 * Idempotent on the day (one check-in per user per date).
 */
export async function checkIn(params: {
  vehicle_id: string | null
  odometer_km: number
  lat: number | null
  lng: number | null
  photo_url?: string | null
}): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!(params.odometer_km >= 0)) return { error: 'Odometer must be ≥ 0' }

  const date = todayInIST()
  const now = new Date().toISOString()

  const { data: existing } = await ctx.supabase
    .from('field_attendance')
    .select('id, check_in_at')
    .eq('user_id', ctx.userId)
    .eq('attendance_date', date)
    .is('deleted_at', null)
    .maybeSingle()

  if (existing?.check_in_at) return { error: 'Already checked in for today' }

  const payload = {
    status_for_day: 'on_duty' as const,
    vehicle_id: params.vehicle_id,
    check_in_at: now,
    check_in_lat: params.lat,
    check_in_lng: params.lng,
    check_in_odometer_km: Math.round(params.odometer_km),
    check_in_photo_url: params.photo_url ?? null,
  }

  if (existing) {
    const { error } = await ctx.supabase
      .from('field_attendance')
      .update({ ...payload, updated_by: ctx.userId, updated_at: now })
      .eq('id', existing.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await ctx.supabase
      .from('field_attendance')
      .insert({
        tenant_id: ctx.tenantId,
        user_id: ctx.userId,
        attendance_date: date,
        ...payload,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
    if (error) return { error: error.message }
  }

  revalidatePath('/field')
  revalidatePath('/dashboard')
  return { success: true }
}

/**
 * Check out for the day. Reads vehicle, looks up effective rate,
 * computes total_km and reimbursement_amount, snapshots the rate so
 * later edits to the matrix don't drift the claim. Auto-approves if
 * the amount falls under the tenant threshold.
 */
export async function checkOut(params: {
  odometer_km: number
  lat: number | null
  lng: number | null
  photo_url?: string | null
  notes?: string | null
}): Promise<{ success: true; amount: number | null; auto_approved: boolean } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!(params.odometer_km >= 0)) return { error: 'Odometer must be ≥ 0' }

  const date = todayInIST()
  const now = new Date().toISOString()

  // Fetch the day's row.
  const { data: row, error: readErr } = await ctx.supabase
    .from('field_attendance')
    .select('id, check_in_at, check_in_odometer_km, check_out_at, vehicle_id')
    .eq('user_id', ctx.userId)
    .eq('attendance_date', date)
    .is('deleted_at', null)
    .maybeSingle()
  if (readErr) return { error: readErr.message }
  if (!row) return { error: 'You haven\'t checked in yet' }
  if (!row.check_in_at) return { error: 'You haven\'t checked in yet' }
  if (row.check_out_at) return { error: 'Already checked out for today' }
  if (row.check_in_odometer_km != null && params.odometer_km < Number(row.check_in_odometer_km)) {
    return { error: 'Check-out odometer must be ≥ check-in odometer' }
  }

  // Block end-of-day if a visit is still live — otherwise it'd be orphaned.
  const { data: inProgressVisit } = await ctx.supabase
    .from('field_visit')
    .select('id')
    .eq('user_id', ctx.userId)
    .eq('state', 'in_progress')
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()
  if (inProgressVisit) {
    return { error: 'Complete or cancel your live visit before ending the day.' }
  }

  // Resolve rate: vehicle.custom_rate > current matrix row > null.
  let rateApplied: number | null = null
  if (row.vehicle_id) {
    const { data: v } = await ctx.supabase
      .from('vehicle')
      .select('custom_rate_per_km, vehicle_type_id, fuel_type_id')
      .eq('id', row.vehicle_id)
      .single()
    if (v?.custom_rate_per_km != null) {
      rateApplied = Number(v.custom_rate_per_km)
    } else if (v) {
      const { data: rate } = await ctx.supabase
        .from('vehicle_reimbursement_rate')
        .select('rate_per_km')
        .eq('vehicle_type_id', v.vehicle_type_id)
        .eq('fuel_type_id', v.fuel_type_id)
        .is('effective_to', null)
        .is('deleted_at', null)
        .maybeSingle()
      if (rate) rateApplied = Number(rate.rate_per_km)
    }
  }

  const checkInKm = row.check_in_odometer_km != null ? Number(row.check_in_odometer_km) : null
  const totalKm = checkInKm != null ? Math.max(0, Math.round(params.odometer_km) - checkInKm) : null
  const amount = rateApplied != null && totalKm != null
    ? Math.round(rateApplied * totalKm * 100) / 100
    : null

  // Auto-approve threshold from tenant settings (typed + cached).
  const { auto_approve_threshold_rupees: threshold } = await getFieldSettings()
  const autoApprove = amount != null && amount <= threshold

  const { error } = await ctx.supabase
    .from('field_attendance')
    .update({
      check_out_at: now,
      check_out_lat: params.lat,
      check_out_lng: params.lng,
      check_out_odometer_km: Math.round(params.odometer_km),
      check_out_photo_url: params.photo_url ?? null,
      rate_applied: rateApplied,
      reimbursement_amount: amount,
      claim_status: autoApprove ? 'approved' : 'draft',
      approved_at: autoApprove ? now : null,
      approved_by: null, // null = system-approved (under threshold)
      notes: params.notes?.trim() || null,
      updated_by: ctx.userId,
      updated_at: now,
    })
    .eq('id', row.id)
  if (error) return { error: error.message }

  revalidatePath('/field')
  revalidatePath('/dashboard')
  return { success: true, amount, auto_approved: autoApprove }
}

/** Move a claim from draft → submitted (rep action). */
export async function submitClaim(): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }

  const date = todayInIST()
  const { data: row } = await ctx.supabase
    .from('field_attendance')
    .select('id, check_out_at, claim_status')
    .eq('user_id', ctx.userId)
    .eq('attendance_date', date)
    .is('deleted_at', null)
    .maybeSingle()
  if (!row) return { error: 'No attendance record for today' }
  if (!row.check_out_at) return { error: 'Check out first before submitting the claim' }
  if (row.claim_status !== 'draft') return { error: 'Claim is no longer in draft' }

  const { error } = await ctx.supabase
    .from('field_attendance')
    .update({
      claim_status: 'submitted',
      submitted_at: new Date().toISOString(),
      updated_by: ctx.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
  if (error) return { error: error.message }

  revalidatePath('/field')
  return { success: true }
}

/* ─── Manager surfaces (used in Step 6) ─────────────────────── */

export async function approveClaim(
  attendanceId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can approve claims' }

  const now = new Date().toISOString()
  const { error } = await ctx.supabase
    .from('field_attendance')
    .update({
      claim_status: 'approved',
      approved_at: now,
      approved_by: ctx.userId,
      rejection_reason: null,
      updated_by: ctx.userId,
      updated_at: now,
    })
    .eq('id', attendanceId)
    .in('claim_status', ['submitted', 'rejected'])
  if (error) return { error: error.message }

  revalidatePath('/field')
  return { success: true }
}

export async function rejectClaim(
  attendanceId: string,
  reason: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only admins or managers can reject claims' }
  if (!reason.trim()) return { error: 'A reason is required' }

  const now = new Date().toISOString()
  const { error } = await ctx.supabase
    .from('field_attendance')
    .update({
      claim_status: 'rejected',
      rejection_reason: reason.trim(),
      approved_at: null,
      approved_by: null,
      updated_by: ctx.userId,
      updated_at: now,
    })
    .eq('id', attendanceId)
    .eq('claim_status', 'submitted')
  if (error) return { error: error.message }

  revalidatePath('/field')
  return { success: true }
}
