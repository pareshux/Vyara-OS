'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { reverseGeocode } from '@/lib/geo/reverse-geocode'

/** ─────────────────────────────────────────────────────────────
 *  Field Visit lifecycle — server actions
 *
 *  Three states modelled across two tables:
 *    - planned   : task row (type='planned_visit'); no field_visit yet
 *    - in_progress : field_visit row, state='in_progress', started_at set
 *    - completed : field_visit row, state='completed', visited_at + form
 *
 *  Subject (Project / Lead / Firm / Dealer) lives on:
 *    - task (planned)      : project_id OR (source_entity_type + source_entity_id)
 *    - field_visit         : project_id / lead_id / firm_id / dealer_id
 *                            (one of, num_nonnulls()=1 constraint)
 *
 *  Activity event: on completion we write an activity row of type='visit'
 *  on the subject (entity_type=subject_type, entity_id=subject_id) so the
 *  visit lands on that object's timeline without cross-module writes.
 *  ───────────────────────────────────────────────────────────── */

type SubjectType = 'project' | 'lead' | 'firm' | 'dealer'

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
    fullName: profile.full_name as string,
  }
}

function isAdminish(role: string) { return role === 'admin' || role === 'manager' }

function subjectFromTask(task: {
  project_id: string | null
  source_entity_type: string | null
  source_entity_id: string | null
}): { type: SubjectType | null; id: string | null } {
  if (task.project_id) return { type: 'project', id: task.project_id }
  if (
    task.source_entity_type &&
    task.source_entity_id &&
    (task.source_entity_type === 'lead' ||
      task.source_entity_type === 'firm' ||
      task.source_entity_type === 'dealer')
  ) {
    return { type: task.source_entity_type, id: task.source_entity_id }
  }
  return { type: null, id: null }
}

function subjectFromVisit(v: {
  project_id: string | null
  lead_id: string | null
  firm_id: string | null
  dealer_id: string | null
}): { type: SubjectType; id: string } | null {
  if (v.project_id) return { type: 'project', id: v.project_id }
  if (v.lead_id) return { type: 'lead', id: v.lead_id }
  if (v.firm_id) return { type: 'firm', id: v.firm_id }
  if (v.dealer_id) return { type: 'dealer', id: v.dealer_id }
  return null
}

/* ─── Reads ─────────────────────────────────────────────────── */

export type TodayPlanItem = {
  task_id: string
  title: string
  description: string | null
  due_at: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  subject_type: SubjectType | null
  subject_id: string | null
  subject_label: string
  contact_id: string | null
  contact_name: string | null
  is_done: boolean
  created_by_me: boolean
}

/**
 * Today's planned visits for the current user, plus their visit history
 * for today (in_progress + completed). The "today" cutoff is Asia/Kolkata.
 */
export type TodayVisitsContext = {
  date: string
  in_progress: Array<{
    visit_id: string
    started_at: string
    odometer_km_at_arrival: number | null
    subject_type: SubjectType
    subject_id: string
    subject_label: string
    contact_id: string | null
    planned_task_id: string | null
    lat: number | null
    lng: number | null
    location_label: string | null
  }>
  planned: TodayPlanItem[]
  completed: Array<{
    visit_id: string
    visited_at: string
    started_at: string | null
    odometer_km_at_arrival: number | null
    duration_minutes: number | null
    subject_type: SubjectType
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
}

export async function getTodayVisitsContext(): Promise<TodayVisitsContext | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const date = todayInIST()
  const dayStartIso = new Date(`${date}T00:00:00+05:30`).toISOString()
  const dayEndIso = new Date(`${date}T23:59:59+05:30`).toISOString()

  // 1. Planned visits (tasks). Subject label needs joins per subject type.
  const { data: rawTasks } = await ctx.supabase
    .from('task')
    .select(`
      id, title, description, due_at, priority, is_done, created_by_id,
      project_id, source_entity_type, source_entity_id, contact_id,
      project:project_id(name),
      contact:contact_id(name)
    `)
    .eq('type', 'planned_visit')
    .eq('assignee_id', ctx.userId)
    .is('deleted_at', null)
    .lte('due_at', dayEndIso)
    .gte('due_at', dayStartIso)
    .order('due_at', { ascending: true })

  const tasks = rawTasks ?? []

  // Resolve lead / firm / dealer labels in batch (only if any tasks point at them).
  const leadIds = tasks.filter((t) => t.source_entity_type === 'lead').map((t) => t.source_entity_id!).filter(Boolean)
  const firmIds = tasks.filter((t) => t.source_entity_type === 'firm').map((t) => t.source_entity_id!).filter(Boolean)
  const dealerIds = tasks.filter((t) => t.source_entity_type === 'dealer').map((t) => t.source_entity_id!).filter(Boolean)

  const [{ data: leadRows }, { data: firmRows }, { data: dealerRows }] = await Promise.all([
    leadIds.length
      ? ctx.supabase.from('lead').select('id, title').in('id', leadIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
    firmIds.length
      ? ctx.supabase.from('firm').select('id, name').in('id', firmIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    dealerIds.length
      ? ctx.supabase.from('dealer').select('id, name').in('id', dealerIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ])
  const leadById = new Map((leadRows ?? []).map((r) => [r.id, r.title] as [string, string]))
  const firmById = new Map((firmRows ?? []).map((r) => [r.id, r.name] as [string, string]))
  const dealerById = new Map((dealerRows ?? []).map((r) => [r.id, r.name] as [string, string]))

  const planned: TodayPlanItem[] = tasks.map((t) => {
    const subject = subjectFromTask(t)
    const projectName = Array.isArray(t.project) ? t.project[0]?.name : (t.project as { name?: string } | null)?.name
    const contactName = Array.isArray(t.contact) ? t.contact[0]?.name : (t.contact as { name?: string } | null)?.name
    let subjectLabel = '—'
    if (subject.type === 'project') subjectLabel = projectName ?? '—'
    else if (subject.type === 'lead' && subject.id) subjectLabel = leadById.get(subject.id) ?? '—'
    else if (subject.type === 'firm' && subject.id) subjectLabel = firmById.get(subject.id) ?? '—'
    else if (subject.type === 'dealer' && subject.id) subjectLabel = dealerById.get(subject.id) ?? '—'
    return {
      task_id: t.id as string,
      title: t.title as string,
      description: t.description as string | null,
      due_at: t.due_at as string | null,
      priority: t.priority as TodayPlanItem['priority'],
      subject_type: subject.type,
      subject_id: subject.id,
      subject_label: subjectLabel,
      contact_id: (t.contact_id as string | null) ?? null,
      contact_name: contactName ?? null,
      is_done: t.is_done as boolean,
      created_by_me: t.created_by_id === ctx.userId,
    }
  })

  // 2. Today's field_visit rows (in_progress + completed).
  const { data: visits } = await ctx.supabase
    .from('field_visit')
    .select(`
      id, started_at, visited_at, odometer_km_at_arrival, duration_minutes, state,
      planned_task_id, project_id, lead_id, firm_id, dealer_id, contact_id,
      notes_text, contact_name_raw, contact_phone_raw, is_interested,
      lat, lng, location_label,
      visit_purpose:visit_purpose_id(label),
      visit_outcome:visit_outcome_id(label),
      contact:contact_id(name),
      project:project_id(name),
      lead:lead_id(title),
      firm:firm_id(name),
      dealer:dealer_id(name)
    `)
    .eq('user_id', ctx.userId)
    .gte('started_at', dayStartIso)
    .lte('started_at', dayEndIso)
    .is('deleted_at', null)
    .order('started_at', { ascending: true })

  const inProgress: TodayVisitsContext['in_progress'] = []
  const completed: TodayVisitsContext['completed'] = []
  for (const v of visits ?? []) {
    const subject = subjectFromVisit(v)
    if (!subject) continue
    const projectName = Array.isArray(v.project) ? v.project[0]?.name : (v.project as { name?: string } | null)?.name
    const leadTitle = Array.isArray(v.lead) ? v.lead[0]?.title : (v.lead as { title?: string } | null)?.title
    const firmName = Array.isArray(v.firm) ? v.firm[0]?.name : (v.firm as { name?: string } | null)?.name
    const dealerName = Array.isArray(v.dealer) ? v.dealer[0]?.name : (v.dealer as { name?: string } | null)?.name
    const subjectLabel =
      subject.type === 'project' ? (projectName ?? '—') :
      subject.type === 'lead' ? (leadTitle ?? '—') :
      subject.type === 'firm' ? (firmName ?? '—') :
      (dealerName ?? '—')
    const contactName = Array.isArray(v.contact) ? v.contact[0]?.name : (v.contact as { name?: string } | null)?.name

    if (v.state === 'in_progress') {
      inProgress.push({
        visit_id: v.id as string,
        started_at: v.started_at as string,
        odometer_km_at_arrival: v.odometer_km_at_arrival != null ? Number(v.odometer_km_at_arrival) : null,
        subject_type: subject.type,
        subject_id: subject.id,
        subject_label: subjectLabel,
        contact_id: (v.contact_id as string | null) ?? null,
        planned_task_id: (v.planned_task_id as string | null) ?? null,
        lat: v.lat != null ? Number(v.lat) : null,
        lng: v.lng != null ? Number(v.lng) : null,
        location_label: (v.location_label as string | null) ?? null,
      })
    } else {
      const purposeLabel = Array.isArray(v.visit_purpose) ? v.visit_purpose[0]?.label : (v.visit_purpose as { label?: string } | null)?.label
      const outcomeLabel = Array.isArray(v.visit_outcome) ? v.visit_outcome[0]?.label : (v.visit_outcome as { label?: string } | null)?.label
      completed.push({
        visit_id: v.id as string,
        visited_at: v.visited_at as string,
        started_at: (v.started_at as string | null) ?? null,
        odometer_km_at_arrival: v.odometer_km_at_arrival != null ? Number(v.odometer_km_at_arrival) : null,
        duration_minutes: (v.duration_minutes as number | null) ?? null,
        subject_type: subject.type,
        subject_id: subject.id,
        subject_label: subjectLabel,
        contact_id: (v.contact_id as string | null) ?? null,
        contact_name: contactName ?? null,
        contact_name_raw: (v.contact_name_raw as string | null) ?? null,
        contact_phone_raw: (v.contact_phone_raw as string | null) ?? null,
        is_interested: (v.is_interested as boolean | null) ?? null,
        purpose_label: purposeLabel ?? null,
        outcome_label: outcomeLabel ?? null,
        notes_text: (v.notes_text as string | null) ?? null,
      })
    }
  }

  return { date, planned, in_progress: inProgress, completed }
}

/* ─── Subject search (for plan-visit + ad-hoc visit pickers) ── */

export type SubjectSearchHit = {
  type: SubjectType
  id: string
  label: string
  sublabel: string | null
}

/**
 * Search across Project / Lead / Firm / Dealer in parallel. Returns
 * top hits per type so the picker shows a mixed list. Empty query
 * returns the most recently-touched items (recent-first ordering).
 */
export async function searchVisitSubjects(
  query: string,
  limit = 8,
): Promise<{ hits: SubjectSearchHit[] } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }

  const q = query.trim()
  const like = q ? `%${q}%` : null

  const [{ data: projects }, { data: leads }, { data: firms }, { data: dealers }] = await Promise.all([
    (like
      ? ctx.supabase.from('project').select('id, name, city').ilike('name', like).limit(limit)
      : ctx.supabase.from('project').select('id, name, city').order('updated_at', { ascending: false }).limit(limit)
    ).then((r) => ({ data: r.data as Array<{ id: string; name: string; city: string | null }> | null })),
    (like
      ? ctx.supabase.from('lead').select('id, title, city').ilike('title', like).limit(limit)
      : ctx.supabase.from('lead').select('id, title, city').order('updated_at', { ascending: false }).limit(limit)
    ).then((r) => ({ data: r.data as Array<{ id: string; title: string; city: string | null }> | null })),
    (like
      ? ctx.supabase.from('firm').select('id, name, type').ilike('name', like).limit(limit)
      : ctx.supabase.from('firm').select('id, name, type').order('updated_at', { ascending: false }).limit(limit)
    ).then((r) => ({ data: r.data as Array<{ id: string; name: string; type: string }> | null })),
    (like
      ? ctx.supabase.from('dealer').select('id, name, city').ilike('name', like).limit(limit)
      : ctx.supabase.from('dealer').select('id, name, city').order('updated_at', { ascending: false }).limit(limit)
    ).then((r) => ({ data: r.data as Array<{ id: string; name: string; city: string | null }> | null })),
  ])

  const hits: SubjectSearchHit[] = [
    ...(projects ?? []).map((p) => ({ type: 'project' as SubjectType, id: p.id, label: p.name, sublabel: p.city })),
    ...(leads ?? []).map((l) => ({ type: 'lead' as SubjectType, id: l.id, label: l.title, sublabel: l.city })),
    ...(firms ?? []).map((f) => ({ type: 'firm' as SubjectType, id: f.id, label: f.name, sublabel: f.type })),
    ...(dealers ?? []).map((d) => ({ type: 'dealer' as SubjectType, id: d.id, label: d.name, sublabel: d.city })),
  ]
  return { hits }
}

/* ─── Visit purpose / outcome master lookups (for forms) ────── */

export async function listVisitMasters(): Promise<
  | { purposes: Array<{ id: string; label: string }>; outcomes: Array<{ id: string; label: string; requires_followup: boolean }> }
  | { error: string }
> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const [{ data: purposes }, { data: outcomes }] = await Promise.all([
    ctx.supabase
      .from('visit_purpose')
      .select('id, label, sort_order')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order'),
    ctx.supabase
      .from('visit_outcome')
      .select('id, label, sort_order, requires_followup')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order'),
  ])
  return {
    purposes: (purposes ?? []).map((p) => ({ id: p.id, label: p.label })),
    outcomes: (outcomes ?? []).map((o) => ({
      id: o.id,
      label: o.label,
      requires_followup: !!o.requires_followup,
    })),
  }
}

/* ─── Mutations ─────────────────────────────────────────────── */

/**
 * Create a planned visit (task). Rep self-plans by default; manager can
 * also assign to a rep — params.assignee_id falls back to current user.
 */
export async function createPlannedVisit(params: {
  title: string
  description?: string | null
  due_at: string // ISO
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  subject_type: SubjectType
  subject_id: string
  contact_id?: string | null
  assignee_id?: string | null
}): Promise<{ task_id: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!params.title.trim()) return { error: 'Title is required' }

  const assigneeId = params.assignee_id ?? ctx.userId
  // Reps may only plan visits for themselves; managers/admins may assign.
  if (assigneeId !== ctx.userId && !isAdminish(ctx.role)) {
    return { error: 'Only managers can assign visits to others' }
  }

  const taskRow: Record<string, unknown> = {
    tenant_id: ctx.tenantId,
    type: 'planned_visit',
    title: params.title.trim(),
    description: params.description?.trim() || null,
    due_at: params.due_at,
    priority: params.priority ?? 'medium',
    assignee_id: assigneeId,
    created_by_id: ctx.userId,
    contact_id: params.contact_id ?? null,
  }

  if (params.subject_type === 'project') {
    taskRow.project_id = params.subject_id
  } else {
    taskRow.source_entity_type = params.subject_type
    taskRow.source_entity_id = params.subject_id
  }

  const { data, error } = await ctx.supabase
    .from('task')
    .insert(taskRow)
    .select('id')
    .single()
  if (error) return { error: error.message }

  revalidatePath('/field')
  revalidatePath('/tasks')
  return { task_id: data.id }
}

/**
 * Start a visit. Creates a field_visit row in state='in_progress'.
 * If planned_task_id is supplied, the visit inherits the task's subject;
 * otherwise the caller passes subject_type + subject_id explicitly.
 * Caller passes odometer reading + GPS at the arrival moment.
 */
export async function startVisit(params: {
  planned_task_id?: string | null
  subject_type?: SubjectType
  subject_id?: string
  contact_id?: string | null
  odometer_km_at_arrival: number
  lat: number | null
  lng: number | null
}): Promise<{ visit_id: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!(params.odometer_km_at_arrival >= 0)) return { error: 'Odometer must be ≥ 0' }

  // Block starting a new visit if one is already in_progress for this rep.
  // Exception: if the open visit was started > 12h ago it's almost
  // certainly a stale "rep closed the tab mid-visit" row, not a real
  // ongoing visit. Auto-soft-cancel it and let the new arrival proceed.
  // We log the reason so the audit trail explains the cleanup.
  const STALE_VISIT_THRESHOLD_MS = 12 * 60 * 60 * 1000
  const { data: live } = await ctx.supabase
    .from('field_visit')
    .select('id, started_at')
    .eq('user_id', ctx.userId)
    .eq('state', 'in_progress')
    .is('deleted_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (live) {
    const ageMs = live.started_at
      ? Date.now() - new Date(live.started_at).getTime()
      : 0
    if (ageMs > STALE_VISIT_THRESHOLD_MS) {
      const nowIso = new Date().toISOString()
      await ctx.supabase
        .from('field_visit')
        .update({
          deleted_at: nowIso,
          notes_text:
            '[auto-recovered: visit was left open for >12h; soft-cancelled when rep started a new one]',
          updated_at: nowIso,
          updated_by: ctx.userId,
        })
        .eq('id', live.id)
    } else {
      return { error: 'You already have a visit in progress — complete or cancel it first' }
    }
  }

  let subjectType = params.subject_type
  let subjectId = params.subject_id
  let contactId = params.contact_id ?? null

  if (params.planned_task_id) {
    const { data: task, error: taskErr } = await ctx.supabase
      .from('task')
      .select('id, type, project_id, source_entity_type, source_entity_id, contact_id, assignee_id, is_done')
      .eq('id', params.planned_task_id)
      .is('deleted_at', null)
      .single()
    if (taskErr || !task) return { error: 'Planned visit not found' }
    if (task.type !== 'planned_visit') return { error: 'Task is not a planned visit' }
    if (task.is_done) return { error: 'This planned visit was already completed' }
    if (task.assignee_id !== ctx.userId && !isAdminish(ctx.role)) {
      return { error: 'This visit was assigned to someone else' }
    }
    const subj = subjectFromTask(task)
    if (!subj.type || !subj.id) return { error: 'Planned visit has no subject' }
    subjectType = subj.type
    subjectId = subj.id
    if (!contactId) contactId = (task.contact_id as string | null) ?? null
  }

  if (!subjectType || !subjectId) return { error: 'Subject is required' }

  // Today's attendance row gives us attendance_id (so the visit groups under the day).
  const date = todayInIST()
  const { data: att } = await ctx.supabase
    .from('field_attendance')
    .select('id')
    .eq('user_id', ctx.userId)
    .eq('attendance_date', date)
    .is('deleted_at', null)
    .maybeSingle()

  const now = new Date().toISOString()
  // Reverse-geocode the arrival point so the UI shows "Bopal Rd,
  // Ahmedabad" rather than coords. Fails gracefully (label stays null
  // and the UI falls back to the Maps deep-link).
  const geo = await reverseGeocode(params.lat, params.lng)

  const insertRow: Record<string, unknown> = {
    tenant_id: ctx.tenantId,
    attendance_id: att?.id ?? null,
    user_id: ctx.userId,
    state: 'in_progress',
    started_at: now,
    visited_at: now,            // refined on completion; non-null required for queries
    odometer_km_at_arrival: Math.round(params.odometer_km_at_arrival),
    lat: params.lat,
    lng: params.lng,
    location_label: geo?.label ?? null,
    contact_id: contactId,
    planned_task_id: params.planned_task_id ?? null,
    created_by: ctx.userId,
    updated_by: ctx.userId,
  }
  if (subjectType === 'project') insertRow.project_id = subjectId
  else if (subjectType === 'lead') insertRow.lead_id = subjectId
  else if (subjectType === 'firm') insertRow.firm_id = subjectId
  else if (subjectType === 'dealer') insertRow.dealer_id = subjectId

  const { data, error } = await ctx.supabase
    .from('field_visit')
    .insert(insertRow)
    .select('id')
    .single()
  if (error) return { error: error.message }

  revalidatePath('/field')
  return { visit_id: data.id }
}

/**
 * Complete a visit: fill the form data, flip state to 'completed', write
 * the activity row on the subject Business Object, mark the planned task
 * done if linked.
 */
export async function completeVisit(
  visitId: string,
  params: {
    visit_purpose_id?: string | null
    visit_outcome_id?: string | null
    contact_id?: string | null
    contact_name_raw?: string | null
    contact_phone_raw?: string | null
    is_interested?: boolean | null
    notes_text?: string | null
    photo_urls?: string[]
    duration_minutes?: number | null
  },
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }

  // Load the in-progress visit (RLS scopes to own/team).
  const { data: visit, error: readErr } = await ctx.supabase
    .from('field_visit')
    .select(`
      id, user_id, state, started_at, planned_task_id,
      project_id, lead_id, firm_id, dealer_id
    `)
    .eq('id', visitId)
    .is('deleted_at', null)
    .single()
  if (readErr || !visit) return { error: 'Visit not found' }
  if (visit.user_id !== ctx.userId && !isAdminish(ctx.role)) {
    return { error: 'Not your visit' }
  }
  if (visit.state !== 'in_progress') return { error: 'Visit is not in progress' }

  const now = new Date().toISOString()
  const duration =
    params.duration_minutes ??
    (visit.started_at ? Math.max(0, Math.round((Date.now() - new Date(visit.started_at).getTime()) / 60_000)) : null)

  const { error } = await ctx.supabase
    .from('field_visit')
    .update({
      state: 'completed',
      visited_at: now,
      duration_minutes: duration,
      visit_purpose_id: params.visit_purpose_id ?? null,
      visit_outcome_id: params.visit_outcome_id ?? null,
      contact_id: params.contact_id ?? null,
      contact_name_raw: params.contact_name_raw?.trim() || null,
      contact_phone_raw: params.contact_phone_raw?.trim() || null,
      is_interested: params.is_interested ?? null,
      notes_text: params.notes_text?.trim() || null,
      photo_urls: params.photo_urls ?? [],
      updated_by: ctx.userId,
      updated_at: now,
    })
    .eq('id', visitId)
  if (error) return { error: error.message }

  // Mark the planned task done (if any).
  if (visit.planned_task_id) {
    await ctx.supabase
      .from('task')
      .update({ is_done: true, done_at: now, updated_at: now })
      .eq('id', visit.planned_task_id)
  }

  // Activity event on the subject Business Object.
  const subject = subjectFromVisit(visit)
  if (subject) {
    // For project subject, denormalised project_id on activity for fast project-timeline queries.
    const projectIdForActivity = subject.type === 'project' ? subject.id : null
    await ctx.supabase.from('activity').insert({
      tenant_id: ctx.tenantId,
      entity_type: subject.type,
      entity_id: subject.id,
      project_id: projectIdForActivity,
      type: 'visit',
      actor_id: ctx.userId,
      content: {
        visit_id: visitId,
        actor_name: ctx.fullName,
        duration_minutes: duration,
        notes: params.notes_text?.trim() || null,
        purpose_id: params.visit_purpose_id ?? null,
        outcome_id: params.visit_outcome_id ?? null,
        contact_id: params.contact_id ?? null,
        contact_name_raw: params.contact_name_raw?.trim() || null,
        contact_phone_raw: params.contact_phone_raw?.trim() || null,
        is_interested: params.is_interested ?? null,
        from_planned_task: !!visit.planned_task_id,
      },
    })
  }

  revalidatePath('/field')
  if (subject?.type === 'project') revalidatePath(`/projects/${subject.id}`)
  if (subject?.type === 'lead') revalidatePath(`/leads/${subject.id}`)
  if (subject?.type === 'dealer') revalidatePath(`/dealers/${subject.id}`)
  return { success: true }
}

/** Cancel an in-progress visit. Soft-delete; reason captured in notes. */
export async function cancelVisit(visitId: string, reason: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!reason.trim()) return { error: 'A reason is required' }

  const { data: visit } = await ctx.supabase
    .from('field_visit')
    .select('id, user_id, state')
    .eq('id', visitId)
    .is('deleted_at', null)
    .single()
  if (!visit) return { error: 'Visit not found' }
  if (visit.user_id !== ctx.userId && !isAdminish(ctx.role)) {
    return { error: 'Not your visit' }
  }
  if (visit.state !== 'in_progress') return { error: 'Visit is not in progress' }

  const now = new Date().toISOString()
  const { error } = await ctx.supabase
    .from('field_visit')
    .update({
      deleted_at: now,
      notes_text: `Cancelled: ${reason.trim()}`,
      updated_by: ctx.userId,
      updated_at: now,
    })
    .eq('id', visitId)
  if (error) return { error: error.message }

  revalidatePath('/field')
  return { success: true }
}
