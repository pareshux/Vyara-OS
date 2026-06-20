'use server'

/**
 * Field Sales — manager/admin team-view server actions.
 *
 * Read-only aggregations that power /field/team and the per-rep
 * drill-down. All gated to admin|manager; sales engineers only ever
 * see their own surfaces.
 */
import { createClient } from '@/lib/supabase/server'

type DayStatus = 'on_duty' | 'wfh' | 'leave' | 'holiday'
type ClaimStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'exported'

function todayInIST(): string {
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
  }
}

function isAdminish(role: string) { return role === 'admin' || role === 'manager' }

/* ─── Team snapshot ─────────────────────────────────────────── */

export type TeamRepRow = {
  user_id: string
  full_name: string
  role: string
  attendance: {
    status_for_day: DayStatus
    check_in_at: string | null
    check_in_lat: number | null
    check_in_lng: number | null
    check_in_odometer_km: number | null
    check_out_at: string | null
    vehicle_label: string | null
    total_km: number | null
    /** Computed in-flight: latest visit odometer − check-in odometer
     *  when no check-out yet. null otherwise. */
    running_km: number | null
    reimbursement_amount: number | null
    claim_status: ClaimStatus
  } | null
  visits_today: number
  in_progress_count: number
  /** Planned-visit tasks due today, assigned to this rep, not yet done. */
  planned_count: number
  last_activity_at: string | null
  /** Latest known coordinates — preferred source is the most recent
   *  visit's lat/lng, falling back to check-in lat/lng. null if neither.
   *  `label` is the reverse-geocoded human-readable address (e.g.
   *  "Bopal Rd, Ahmedabad"); null when geocoding failed or the row
   *  predates the geocoder. */
  latest_location: {
    lat: number
    lng: number
    label: string | null
    source: 'check_in' | 'visit'
  } | null
}

export type TeamSnapshot = {
  date: string
  reps: TeamRepRow[]
}

export async function getTeamSnapshot(date?: string): Promise<TeamSnapshot | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only managers or admins can see the team view' }

  const queryDate = date ?? todayInIST()
  const dayStartIso = new Date(`${queryDate}T00:00:00+05:30`).toISOString()
  const dayEndIso = new Date(`${queryDate}T23:59:59+05:30`).toISOString()

  // 1. All active reps (sales_engineer, manager, admin — everyone who can go on field).
  const { data: users } = await ctx.supabase
    .from('user_profile')
    .select('id, full_name, role')
    .eq('tenant_id', ctx.tenantId)
    .eq('is_active', true)
    .in('role', ['admin', 'manager', 'sales_engineer'])
    .order('full_name')

  if (!users || users.length === 0) return { date: queryDate, reps: [] }
  const userIds = users.map((u) => u.id)

  // 2. Their attendance row for the day (left join semantics — many won't have one).
  const { data: attendance } = await ctx.supabase
    .from('field_attendance')
    .select(`
      user_id, status_for_day, check_in_at, check_in_lat, check_in_lng,
      check_in_location_label, check_out_at, total_km, reimbursement_amount,
      claim_status, updated_at,
      vehicle:vehicle_id(vehicle_number)
    `)
    .eq('attendance_date', queryDate)
    .in('user_id', userIds)
    .is('deleted_at', null)
  const attendanceByUser = new Map<string, NonNullable<typeof attendance>[number]>()
  for (const a of attendance ?? []) attendanceByUser.set(a.user_id as string, a)

  // 3. Visit counts + locations + arrival odometers (today, by user). Single
  //    select to avoid N+1. We pull lat/lng + odometer too so we can compute
  //    latest_location and running_km in-code.
  const { data: todayVisits } = await ctx.supabase
    .from('field_visit')
    .select('user_id, state, updated_at, started_at, lat, lng, location_label, odometer_km_at_arrival')
    .in('user_id', userIds)
    .gte('started_at', dayStartIso)
    .lte('started_at', dayEndIso)
    .is('deleted_at', null)
    .order('started_at', { ascending: true })

  const totalByUser = new Map<string, number>()
  const inProgressByUser = new Map<string, number>()
  const lastActivityByUser = new Map<string, string>()
  const latestVisitLocByUser = new Map<string, { lat: number; lng: number; label: string | null }>()
  const maxVisitOdoByUser = new Map<string, number>()
  for (const v of todayVisits ?? []) {
    const u = v.user_id as string
    totalByUser.set(u, (totalByUser.get(u) ?? 0) + 1)
    if (v.state === 'in_progress') inProgressByUser.set(u, (inProgressByUser.get(u) ?? 0) + 1)
    const existing = lastActivityByUser.get(u)
    if (!existing || (v.updated_at as string) > existing) {
      lastActivityByUser.set(u, v.updated_at as string)
    }
    if (v.lat != null && v.lng != null) {
      // Iteration is in started_at asc order, so the last assignment wins → latest visit.
      latestVisitLocByUser.set(u, {
        lat: Number(v.lat),
        lng: Number(v.lng),
        label: (v.location_label as string | null) ?? null,
      })
    }
    if (v.odometer_km_at_arrival != null) {
      const odo = Number(v.odometer_km_at_arrival)
      const prev = maxVisitOdoByUser.get(u)
      if (prev == null || odo > prev) maxVisitOdoByUser.set(u, odo)
    }
  }

  // 4. Planned visits (today, by user). Same pattern.
  const { data: plannedTasks } = await ctx.supabase
    .from('task')
    .select('assignee_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('type', 'planned_visit')
    .eq('is_done', false)
    .in('assignee_id', userIds)
    .gte('due_at', dayStartIso)
    .lte('due_at', dayEndIso)
    .is('deleted_at', null)
  const plannedByUser = new Map<string, number>()
  for (const t of plannedTasks ?? []) {
    const u = t.assignee_id as string
    plannedByUser.set(u, (plannedByUser.get(u) ?? 0) + 1)
  }

  // We also need check_in_odometer_km on attendance for running-km math.
  const { data: attendanceOdo } = await ctx.supabase
    .from('field_attendance')
    .select('user_id, check_in_odometer_km')
    .eq('attendance_date', queryDate)
    .in('user_id', userIds)
    .is('deleted_at', null)
  const checkInOdoByUser = new Map<string, number>()
  for (const a of attendanceOdo ?? []) {
    if (a.check_in_odometer_km != null) checkInOdoByUser.set(a.user_id as string, Number(a.check_in_odometer_km))
  }

  const reps: TeamRepRow[] = users.map((u) => {
    const att = attendanceByUser.get(u.id)
    const vehicle = att?.vehicle as { vehicle_number?: string } | { vehicle_number?: string }[] | null
    const vehicleLabel = Array.isArray(vehicle) ? vehicle[0]?.vehicle_number ?? null : vehicle?.vehicle_number ?? null
    // last_activity_at: latest of attendance.updated_at and any visit updates
    const attActivity = att?.updated_at as string | undefined
    const visitActivity = lastActivityByUser.get(u.id)
    const last = [attActivity, visitActivity].filter(Boolean).sort().reverse()[0] ?? null

    // Running km — only meaningful between check-in and check-out, and only
    // when at least one visit's arrival odometer is recorded.
    const checkInOdo = checkInOdoByUser.get(u.id) ?? null
    const maxVisitOdo = maxVisitOdoByUser.get(u.id) ?? null
    const isOnDuty = !!att?.check_in_at && !att?.check_out_at
    const runningKm =
      isOnDuty && checkInOdo != null && maxVisitOdo != null
        ? Math.max(0, maxVisitOdo - checkInOdo)
        : null

    // Latest location — prefer the most recent visit pin, fall back to check-in.
    const visitLoc = latestVisitLocByUser.get(u.id)
    let latestLocation: TeamRepRow['latest_location'] = null
    if (visitLoc) {
      latestLocation = {
        lat: visitLoc.lat,
        lng: visitLoc.lng,
        label: visitLoc.label,
        source: 'visit',
      }
    } else if (att?.check_in_lat != null && att?.check_in_lng != null) {
      latestLocation = {
        lat: Number(att.check_in_lat),
        lng: Number(att.check_in_lng),
        label: (att.check_in_location_label as string | null) ?? null,
        source: 'check_in',
      }
    }

    return {
      user_id: u.id as string,
      full_name: u.full_name as string,
      role: u.role as string,
      attendance: att
        ? {
            status_for_day: att.status_for_day as DayStatus,
            check_in_at: (att.check_in_at as string | null) ?? null,
            check_in_lat: att.check_in_lat != null ? Number(att.check_in_lat) : null,
            check_in_lng: att.check_in_lng != null ? Number(att.check_in_lng) : null,
            check_in_odometer_km: checkInOdo,
            check_out_at: (att.check_out_at as string | null) ?? null,
            vehicle_label: vehicleLabel,
            total_km: att.total_km != null ? Number(att.total_km) : null,
            running_km: runningKm,
            reimbursement_amount: att.reimbursement_amount != null ? Number(att.reimbursement_amount) : null,
            claim_status: att.claim_status as ClaimStatus,
          }
        : null,
      visits_today: totalByUser.get(u.id) ?? 0,
      in_progress_count: inProgressByUser.get(u.id) ?? 0,
      planned_count: plannedByUser.get(u.id) ?? 0,
      last_activity_at: last,
      latest_location: latestLocation,
    }
  })

  return { date: queryDate, reps }
}

/* ─── Pending claims ────────────────────────────────────────── */

export type PendingClaim = {
  attendance_id: string
  user_id: string
  full_name: string
  attendance_date: string
  total_km: number | null
  rate_applied: number | null
  reimbursement_amount: number | null
  submitted_at: string | null
  vehicle_label: string | null
}

export async function listPendingClaims(): Promise<{ claims: PendingClaim[] } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: 'Only managers or admins can see pending claims' }

  const { data: rows } = await ctx.supabase
    .from('field_attendance')
    .select(`
      id, user_id, attendance_date, total_km, rate_applied, reimbursement_amount,
      submitted_at,
      user:user_id(full_name),
      vehicle:vehicle_id(vehicle_number)
    `)
    .eq('tenant_id', ctx.tenantId)
    .eq('claim_status', 'submitted')
    .is('deleted_at', null)
    .order('submitted_at', { ascending: true })

  const claims: PendingClaim[] = (rows ?? []).map((r) => {
    const user = Array.isArray(r.user) ? r.user[0] : r.user
    const vehicle = Array.isArray(r.vehicle) ? r.vehicle[0] : r.vehicle
    return {
      attendance_id: r.id as string,
      user_id: r.user_id as string,
      full_name: (user as { full_name?: string } | null)?.full_name ?? '—',
      attendance_date: r.attendance_date as string,
      total_km: r.total_km != null ? Number(r.total_km) : null,
      rate_applied: r.rate_applied != null ? Number(r.rate_applied) : null,
      reimbursement_amount: r.reimbursement_amount != null ? Number(r.reimbursement_amount) : null,
      submitted_at: (r.submitted_at as string | null) ?? null,
      vehicle_label: (vehicle as { vehicle_number?: string } | null)?.vehicle_number ?? null,
    }
  })

  return { claims }
}

/* ─── Rep day detail (drill-down) ───────────────────────────── */

export type RepDayDetail = {
  user: { id: string; full_name: string; role: string }
  date: string
  attendance: {
    id: string
    status_for_day: DayStatus
    check_in_at: string | null
    check_in_lat: number | null
    check_in_lng: number | null
    check_in_odometer_km: number | null
    check_out_at: string | null
    check_out_lat: number | null
    check_out_lng: number | null
    check_out_odometer_km: number | null
    vehicle_label: string | null
    total_km: number | null
    rate_applied: number | null
    reimbursement_amount: number | null
    claim_status: ClaimStatus
    submitted_at: string | null
    approved_at: string | null
    rejection_reason: string | null
    notes: string | null
  } | null
  visits: Array<{
    visit_id: string
    state: 'in_progress' | 'completed'
    visited_at: string
    started_at: string | null
    odometer_km_at_arrival: number | null
    duration_minutes: number | null
    lat: number | null
    lng: number | null
    subject_type: 'project' | 'lead' | 'firm' | 'dealer'
    subject_id: string
    subject_label: string
    contact_id: string | null
    contact_name: string | null
    contact_name_raw: string | null
    contact_phone_raw: string | null
    is_interested: boolean | null
    purpose_label: string | null
    outcome_label: string | null
    notes_text: string | null
  }>
  /** Planned-visit tasks for the day that haven't been started yet
   *  (no field_visit row tied to them via planned_task_id). Lets the
   *  manager see "planned but skipped" without scrolling. */
  planned_open: Array<{
    task_id: string
    title: string
    due_at: string | null
    priority: 'low' | 'medium' | 'high' | 'urgent'
    subject_type: 'project' | 'lead' | 'firm' | 'dealer' | null
    subject_label: string
    contact_name: string | null
  }>
}

export async function getRepDayDetail(
  userId: string,
  date: string,
): Promise<RepDayDetail | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!isAdminish(ctx.role)) return { error: "Only managers or admins can see other reps' day" }

  // Verify the target rep belongs to this tenant.
  const { data: profile } = await ctx.supabase
    .from('user_profile')
    .select('id, full_name, role, tenant_id')
    .eq('id', userId)
    .single()
  if (!profile || profile.tenant_id !== ctx.tenantId) return { error: 'Rep not found' }

  const dayStartIso = new Date(`${date}T00:00:00+05:30`).toISOString()
  const dayEndIso = new Date(`${date}T23:59:59+05:30`).toISOString()

  const [{ data: att }, { data: visits }, { data: plannedTasks }] = await Promise.all([
    ctx.supabase
      .from('field_attendance')
      .select(`
        id, status_for_day, check_in_at, check_in_lat, check_in_lng, check_in_odometer_km,
        check_out_at, check_out_lat, check_out_lng, check_out_odometer_km,
        total_km, rate_applied, reimbursement_amount, claim_status,
        submitted_at, approved_at, rejection_reason, notes,
        vehicle:vehicle_id(vehicle_number)
      `)
      .eq('user_id', userId)
      .eq('attendance_date', date)
      .is('deleted_at', null)
      .maybeSingle(),
    ctx.supabase
      .from('field_visit')
      .select(`
        id, state, started_at, visited_at, odometer_km_at_arrival, duration_minutes, lat, lng,
        project_id, lead_id, firm_id, dealer_id, contact_id,
        contact_name_raw, contact_phone_raw, is_interested, notes_text,
        visit_purpose:visit_purpose_id(label),
        visit_outcome:visit_outcome_id(label),
        contact:contact_id(full_name),
        project:project_id(name),
        lead:lead_id(title),
        firm:firm_id(name),
        dealer:dealer_id(firm:firm_id(name))
      `)
      .eq('user_id', userId)
      .gte('started_at', dayStartIso)
      .lte('started_at', dayEndIso)
      .is('deleted_at', null)
      .order('started_at', { ascending: true }),
    ctx.supabase
      .from('task')
      .select(`
        id, title, due_at, priority, is_done,
        project_id, source_entity_type, source_entity_id, contact_id,
        project:project_id(name),
        contact:contact_id(full_name)
      `)
      .eq('tenant_id', ctx.tenantId)
      .eq('type', 'planned_visit')
      .eq('assignee_id', userId)
      .eq('is_done', false)
      .gte('due_at', dayStartIso)
      .lte('due_at', dayEndIso)
      .is('deleted_at', null)
      .order('due_at', { ascending: true }),
  ])

  const vehicle = Array.isArray(att?.vehicle) ? att?.vehicle[0] : att?.vehicle
  const vehicleLabel = (vehicle as { vehicle_number?: string } | null)?.vehicle_number ?? null

  const visitsOut: RepDayDetail['visits'] = (visits ?? []).map((v) => {
    const subj: { type: RepDayDetail['visits'][number]['subject_type']; id: string } =
      v.project_id ? { type: 'project', id: v.project_id as string } :
      v.lead_id ? { type: 'lead', id: v.lead_id as string } :
      v.firm_id ? { type: 'firm', id: v.firm_id as string } :
      { type: 'dealer', id: v.dealer_id as string }

    const projectName = Array.isArray(v.project) ? v.project[0]?.name : (v.project as { name?: string } | null)?.name
    const leadTitle = Array.isArray(v.lead) ? v.lead[0]?.title : (v.lead as { title?: string } | null)?.title
    const firmName = Array.isArray(v.firm) ? v.firm[0]?.name : (v.firm as { name?: string } | null)?.name
    const dealerRow = Array.isArray(v.dealer) ? v.dealer[0] : v.dealer
    const dealerFirm = Array.isArray((dealerRow as { firm?: unknown })?.firm)
      ? (dealerRow as { firm?: { name?: string }[] }).firm?.[0]
      : (dealerRow as { firm?: { name?: string } } | null)?.firm
    const dealerName = dealerFirm?.name
    const subjectLabel =
      subj.type === 'project' ? (projectName ?? '—') :
      subj.type === 'lead' ? (leadTitle ?? '—') :
      subj.type === 'firm' ? (firmName ?? '—') :
      (dealerName ?? '—')

    const contactName = Array.isArray(v.contact) ? v.contact[0]?.full_name : (v.contact as { full_name?: string } | null)?.full_name
    const purpose = Array.isArray(v.visit_purpose) ? v.visit_purpose[0]?.label : (v.visit_purpose as { label?: string } | null)?.label
    const outcome = Array.isArray(v.visit_outcome) ? v.visit_outcome[0]?.label : (v.visit_outcome as { label?: string } | null)?.label

    return {
      visit_id: v.id as string,
      state: v.state as 'in_progress' | 'completed',
      visited_at: v.visited_at as string,
      started_at: (v.started_at as string | null) ?? null,
      odometer_km_at_arrival: v.odometer_km_at_arrival != null ? Number(v.odometer_km_at_arrival) : null,
      duration_minutes: (v.duration_minutes as number | null) ?? null,
      lat: v.lat != null ? Number(v.lat) : null,
      lng: v.lng != null ? Number(v.lng) : null,
      subject_type: subj.type,
      subject_id: subj.id,
      subject_label: subjectLabel,
      contact_id: (v.contact_id as string | null) ?? null,
      contact_name: contactName ?? null,
      contact_name_raw: (v.contact_name_raw as string | null) ?? null,
      contact_phone_raw: (v.contact_phone_raw as string | null) ?? null,
      is_interested: (v.is_interested as boolean | null) ?? null,
      purpose_label: purpose ?? null,
      outcome_label: outcome ?? null,
      notes_text: (v.notes_text as string | null) ?? null,
    }
  })

  // Resolve subject labels for the planned tasks. Lead/firm/dealer come
  // through source_entity_*; project is on the joined alias.
  const tasks = plannedTasks ?? []
  const leadIds = tasks.filter((t) => t.source_entity_type === 'lead').map((t) => t.source_entity_id as string).filter(Boolean)
  const firmIds = tasks.filter((t) => t.source_entity_type === 'firm').map((t) => t.source_entity_id as string).filter(Boolean)
  const dealerIds = tasks.filter((t) => t.source_entity_type === 'dealer').map((t) => t.source_entity_id as string).filter(Boolean)
  const [{ data: leadRows }, { data: firmRows }, { data: dealerRows }] = await Promise.all([
    leadIds.length ? ctx.supabase.from('lead').select('id, title').in('id', leadIds) : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
    firmIds.length ? ctx.supabase.from('firm').select('id, name').in('id', firmIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    dealerIds.length ? ctx.supabase.from('dealer').select('id, firm:firm_id(name)').in('id', dealerIds) : Promise.resolve({ data: [] as Array<{ id: string; firm: { name: string } | { name: string }[] | null }> }),
  ])
  const leadById = new Map((leadRows ?? []).map((r) => [r.id, r.title] as [string, string]))
  const firmById = new Map((firmRows ?? []).map((r) => [r.id, r.name] as [string, string]))
  const dealerById = new Map(
    (dealerRows ?? []).map((r) => {
      const firm = Array.isArray(r.firm) ? r.firm[0] : r.firm
      return [r.id, firm?.name ?? '—'] as [string, string]
    }),
  )

  const plannedOut: RepDayDetail['planned_open'] = tasks.map((t) => {
    let subjectType: 'project' | 'lead' | 'firm' | 'dealer' | null = null
    let subjectLabel = '—'
    if (t.project_id) {
      subjectType = 'project'
      const proj = Array.isArray(t.project) ? t.project[0] : t.project
      subjectLabel = (proj as { name?: string } | null)?.name ?? '—'
    } else if (t.source_entity_type === 'lead' && t.source_entity_id) {
      subjectType = 'lead'; subjectLabel = leadById.get(t.source_entity_id as string) ?? '—'
    } else if (t.source_entity_type === 'firm' && t.source_entity_id) {
      subjectType = 'firm'; subjectLabel = firmById.get(t.source_entity_id as string) ?? '—'
    } else if (t.source_entity_type === 'dealer' && t.source_entity_id) {
      subjectType = 'dealer'; subjectLabel = dealerById.get(t.source_entity_id as string) ?? '—'
    }
    const contact = Array.isArray(t.contact) ? t.contact[0] : t.contact
    return {
      task_id: t.id as string,
      title: t.title as string,
      due_at: (t.due_at as string | null) ?? null,
      priority: t.priority as 'low' | 'medium' | 'high' | 'urgent',
      subject_type: subjectType,
      subject_label: subjectLabel,
      contact_name: (contact as { full_name?: string } | null)?.full_name ?? null,
    }
  })

  return {
    user: { id: profile.id as string, full_name: profile.full_name as string, role: profile.role as string },
    date,
    attendance: att
      ? {
          id: att.id as string,
          status_for_day: att.status_for_day as DayStatus,
          check_in_at: (att.check_in_at as string | null) ?? null,
          check_in_lat: att.check_in_lat != null ? Number(att.check_in_lat) : null,
          check_in_lng: att.check_in_lng != null ? Number(att.check_in_lng) : null,
          check_in_odometer_km: att.check_in_odometer_km != null ? Number(att.check_in_odometer_km) : null,
          check_out_at: (att.check_out_at as string | null) ?? null,
          check_out_lat: att.check_out_lat != null ? Number(att.check_out_lat) : null,
          check_out_lng: att.check_out_lng != null ? Number(att.check_out_lng) : null,
          check_out_odometer_km: att.check_out_odometer_km != null ? Number(att.check_out_odometer_km) : null,
          vehicle_label: vehicleLabel,
          total_km: att.total_km != null ? Number(att.total_km) : null,
          rate_applied: att.rate_applied != null ? Number(att.rate_applied) : null,
          reimbursement_amount: att.reimbursement_amount != null ? Number(att.reimbursement_amount) : null,
          claim_status: att.claim_status as ClaimStatus,
          submitted_at: (att.submitted_at as string | null) ?? null,
          approved_at: (att.approved_at as string | null) ?? null,
          rejection_reason: (att.rejection_reason as string | null) ?? null,
          notes: (att.notes as string | null) ?? null,
        }
      : null,
    visits: visitsOut,
    planned_open: plannedOut,
  }
}
