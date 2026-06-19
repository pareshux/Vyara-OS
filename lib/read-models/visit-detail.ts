// ─── Visit detail read-model ─────────────────────────────────
// One assembled view of "everything tied to this visit" — used by
// the Visit Hub page (FO-6 / Blueprint FLD-014).
//
// REVIEW-RULE (mirrors lib/read-models/project-progress.ts):
// All cross-capability reads needed for the visit hub go ONLY through
// this assembler. The page itself, any visit-detail subcomponents, and
// downstream consumers (manager team detail, mobile visit card) all
// receive one assembled object. New modules that surface on a visit
// (Complaints, Orders booked from visit) extend this assembler with
// one more query — never direct table reads in a UI component.
//
// Why: Constitution Principle #0. Tested in Slice 2 with
// project-progress; same shape repeats here.

import { createClient } from '@/lib/supabase/server'

export type VisitSubject = {
  type: 'project' | 'lead' | 'firm' | 'dealer'
  id: string
  label: string
  // Optional follow-on hrefs the Visit Hub can render as quick-links
  // back to the subject's detail page.
  href: string
}

export type VisitAttachmentSummary = {
  id: string
  kind: 'photo' | 'document' | 'voice_note' | 'signature' | 'receipt'
  mime_type: string
  storage_path: string
  title: string | null
  created_at: string
}

export type VisitExpenseSummary = {
  id: string
  expense_date: string
  category_label: string
  amount: number
  status: string
  notes: string | null
}

export type VisitActivityRow = {
  id: string
  kind: string
  payload: Record<string, unknown> | null
  actor_user_id: string | null
  actor_name: string | null
  created_at: string
}

export type VisitTaskRow = {
  id: string
  title: string
  due_at: string | null
  is_done: boolean
  priority: string
  assignee_id: string | null
  assignee_name: string | null
}

export type VisitDetail = {
  id: string
  tenant_id: string
  user_id: string
  user_name: string | null
  attendance_id: string | null

  // Lifecycle
  state: 'in_progress' | 'completed'
  visited_at: string | null
  started_at: string | null
  duration_minutes: number | null

  // Subject + people
  subject: VisitSubject | null
  contact: {
    id: string | null
    name: string | null
    phone: string | null
  }
  contact_name_raw: string | null
  contact_phone_raw: string | null

  // Purpose / outcome
  purpose: { id: string; label: string; category: string | null } | null
  outcome: { id: string; label: string; requires_followup: boolean } | null

  // Stamp
  lat: number | null
  lng: number | null
  location_label: string | null
  odometer_km_at_arrival: number | null

  // Content
  notes_text: string | null
  is_interested: boolean | null

  // Cross-capability rollups
  attachments: VisitAttachmentSummary[]
  expenses: VisitExpenseSummary[]
  expenses_total: number
  activities: VisitActivityRow[]
  tasks: VisitTaskRow[]

  created_at: string
}

/**
 * Build the full visit detail. Returns null when the visit
 * doesn't exist or the caller can't see it (RLS-filtered).
 */
export async function getVisitDetail(visitId: string): Promise<VisitDetail | null> {
  const supabase = await createClient()

  // 1. Core visit row + joined masters.
  const { data: vRaw } = await supabase
    .from('field_visit')
    .select(
      `id, tenant_id, attendance_id, user_id, visited_at, started_at, state,
       duration_minutes, visit_purpose_id, visit_outcome_id,
       project_id, lead_id, firm_id, dealer_id, contact_id,
       lat, lng, location_label, notes_text, is_interested,
       contact_name_raw, contact_phone_raw, odometer_km_at_arrival,
       created_at,
       user:user_profile!field_visit_user_id_fkey(full_name),
       purpose:visit_purpose(id, label, category),
       outcome:visit_outcome(id, label, requires_followup),
       contact:contact(id, name, phone)`,
    )
    .eq('id', visitId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!vRaw) return null

  const v = vRaw as unknown as {
    id: string
    tenant_id: string
    attendance_id: string | null
    user_id: string
    visited_at: string | null
    started_at: string | null
    state: 'in_progress' | 'completed'
    duration_minutes: number | null
    visit_purpose_id: string | null
    visit_outcome_id: string | null
    project_id: string | null
    lead_id: string | null
    firm_id: string | null
    dealer_id: string | null
    contact_id: string | null
    lat: number | null
    lng: number | null
    location_label: string | null
    notes_text: string | null
    is_interested: boolean | null
    contact_name_raw: string | null
    contact_phone_raw: string | null
    odometer_km_at_arrival: number | null
    created_at: string
    user: { full_name: string | null } | { full_name: string | null }[] | null
    purpose: { id: string; label: string; category: string | null } | { id: string; label: string; category: string | null }[] | null
    outcome: { id: string; label: string; requires_followup: boolean } | { id: string; label: string; requires_followup: boolean }[] | null
    contact: { id: string; name: string | null; phone: string | null } | { id: string; name: string | null; phone: string | null }[] | null
  }
  const userRow = Array.isArray(v.user) ? v.user[0] ?? null : v.user
  const purposeRow = Array.isArray(v.purpose) ? v.purpose[0] ?? null : v.purpose
  const outcomeRow = Array.isArray(v.outcome) ? v.outcome[0] ?? null : v.outcome
  const contactRow = Array.isArray(v.contact) ? v.contact[0] ?? null : v.contact

  // 2. Resolve subject label + href. Subject is whichever of the 4
  // FKs is set; the read-model fans out a tiny query per type.
  let subject: VisitSubject | null = null
  if (v.project_id) {
    const { data } = await supabase
      .from('project')
      .select('id, name')
      .eq('id', v.project_id)
      .maybeSingle()
    if (data) subject = { type: 'project', id: data.id, label: data.name, href: `/projects/${data.id}` }
  } else if (v.lead_id) {
    const { data } = await supabase
      .from('lead')
      .select('id, title')
      .eq('id', v.lead_id)
      .maybeSingle()
    if (data) subject = { type: 'lead', id: data.id, label: data.title, href: `/leads/${data.id}` }
  } else if (v.firm_id) {
    const { data } = await supabase
      .from('firm')
      .select('id, name')
      .eq('id', v.firm_id)
      .maybeSingle()
    if (data) subject = { type: 'firm', id: data.id, label: data.name, href: `/contacts?firm=${data.id}` }
  } else if (v.dealer_id) {
    const { data } = await supabase
      .from('dealer')
      .select('id, name')
      .eq('id', v.dealer_id)
      .maybeSingle()
    if (data) subject = { type: 'dealer', id: data.id, label: data.name, href: `/dealers/${data.id}` }
  }

  // 3. Attachments tied to this visit.
  const { data: attRaw } = await supabase
    .from('attachment')
    .select('id, kind, mime_type, storage_path, title, created_at')
    .eq('entity_type', 'field_visit')
    .eq('entity_id', v.id)
    .order('created_at', { ascending: false })
  const attachments = ((attRaw ?? []) as VisitAttachmentSummary[])

  // 4. Expenses tied to this visit.
  const { data: expRaw } = await supabase
    .from('expense')
    .select(
      `id, expense_date, amount, status, notes,
       category:expense_category!inner(label)`,
    )
    .eq('subject_type', 'field_visit')
    .eq('subject_id', v.id)
    .is('deleted_at', null)
    .order('expense_date', { ascending: false })
  const expenses: VisitExpenseSummary[] = (
    (expRaw ?? []) as unknown as Array<{
      id: string
      expense_date: string
      amount: number | string
      status: string
      notes: string | null
      category: { label: string } | { label: string }[]
    }>
  ).map((e) => {
    const cat = Array.isArray(e.category) ? e.category[0] : e.category
    return {
      id: e.id,
      expense_date: e.expense_date,
      category_label: cat?.label ?? '—',
      amount: Number(e.amount),
      status: e.status,
      notes: e.notes,
    }
  })
  const expensesTotal = expenses.reduce((acc, e) => acc + e.amount, 0)

  // 5. Activity timeline for this visit. Activities use polymorphic
  // (entity_type, entity_id) too; the visit subject's timeline lives
  // on the subject, not the visit, so we pull only activities written
  // specifically on the visit row (audit / system events).
  const { data: actRaw } = await supabase
    .from('activity')
    .select(
      `id, kind, payload, actor_user_id, created_at,
       actor:user_profile!activity_actor_user_id_fkey(full_name)`,
    )
    .eq('entity_type', 'field_visit')
    .eq('entity_id', v.id)
    .order('created_at', { ascending: false })
    .limit(50)
  const activities: VisitActivityRow[] = (
    (actRaw ?? []) as unknown as Array<{
      id: string
      kind: string
      payload: Record<string, unknown> | null
      actor_user_id: string | null
      created_at: string
      actor: { full_name: string | null } | { full_name: string | null }[] | null
    }>
  ).map((a) => {
    const actorRow = Array.isArray(a.actor) ? a.actor[0] ?? null : a.actor
    return {
      id: a.id,
      kind: a.kind,
      payload: a.payload,
      actor_user_id: a.actor_user_id,
      actor_name: actorRow?.full_name ?? null,
      created_at: a.created_at,
    }
  })

  // 6. Follow-up tasks created from this visit. Tasks store the visit
  // id either as source_entity_(type,id) or via project_id. For v1 we
  // search by source_entity_id (the visit completion path writes one).
  const { data: taskRaw } = await supabase
    .from('task')
    .select(
      `id, title, due_at, is_done, priority, assignee_id,
       assignee:user_profile!task_assignee_id_fkey(full_name)`,
    )
    .eq('source_entity_type', 'field_visit')
    .eq('source_entity_id', v.id)
    .is('deleted_at', null)
    .order('due_at', { ascending: true, nullsFirst: false })
  const tasks: VisitTaskRow[] = (
    (taskRaw ?? []) as unknown as Array<{
      id: string
      title: string
      due_at: string | null
      is_done: boolean
      priority: string
      assignee_id: string | null
      assignee: { full_name: string | null } | { full_name: string | null }[] | null
    }>
  ).map((t) => {
    const assigneeRow = Array.isArray(t.assignee) ? t.assignee[0] ?? null : t.assignee
    return {
      id: t.id,
      title: t.title,
      due_at: t.due_at,
      is_done: t.is_done,
      priority: t.priority,
      assignee_id: t.assignee_id,
      assignee_name: assigneeRow?.full_name ?? null,
    }
  })

  return {
    id: v.id,
    tenant_id: v.tenant_id,
    user_id: v.user_id,
    user_name: userRow?.full_name ?? null,
    attendance_id: v.attendance_id,
    state: v.state,
    visited_at: v.visited_at,
    started_at: v.started_at,
    duration_minutes: v.duration_minutes,
    subject,
    contact: {
      id: contactRow?.id ?? null,
      name: contactRow?.name ?? null,
      phone: contactRow?.phone ?? null,
    },
    contact_name_raw: v.contact_name_raw,
    contact_phone_raw: v.contact_phone_raw,
    purpose: purposeRow,
    outcome: outcomeRow,
    lat: v.lat,
    lng: v.lng,
    location_label: v.location_label,
    odometer_km_at_arrival: v.odometer_km_at_arrival,
    notes_text: v.notes_text,
    is_interested: v.is_interested,
    attachments,
    expenses,
    expenses_total: expensesTotal,
    activities,
    tasks,
    created_at: v.created_at,
  }
}
