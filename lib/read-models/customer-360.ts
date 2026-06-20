// ─── Customer 360 read-model ─────────────────────────────────
// One assembled view of "everything we know about this firm" — used by
// the Customer 360 page (Blueprint REL-009).
//
// REVIEW-RULE (mirrors project-progress.ts and visit-detail.ts):
// All cross-capability reads needed for the firm 360 go ONLY through this
// assembler. The page itself, and any downstream consumers (a future
// customer list, manager scorecards) all receive one assembled object.
// New sections that surface on the 360 (Orders, Quotes, Invoices,
// Collections, Visits, Complaints) extend this assembler with one more
// query — never direct table reads in the UI.
//
// Why: Constitution Principle #0. Same shape as project-progress (Slice 2),
// visit-detail (FO-6), field-day (FO-7).
//
// Slice 1 scope: header (firm + relationship type + primary contact +
// contact count) + Projects section (top N by updated_at). Slice 2 adds
// Orders/Quotes/Invoices/Collections. Slice 3 adds Visits/Activities.

import { createClient } from '@/lib/supabase/server'

export type Customer360Firm = {
  id: string
  name: string
  // Legacy TEXT column; kept until call sites all reference the FK.
  type_code: string
  // From relationship_type_master via FK. Falls back to a Title-Cased
  // type_code if the FK is null (pre-REL-006 row).
  relationship_type_label: string
  city: string | null
  state: string
  gstin: string | null
  phone: string | null
  email: string | null
  website: string | null
  notes: string | null
  created_at: string
}

export type Customer360Contact = {
  id: string
  full_name: string
  role_title: string | null
  phone: string | null
  email: string | null
}

export type Customer360Project = {
  id: string
  name: string
  segment: string
  city: string | null
  estimated_value: number | null
  updated_at: string
  current_stage: { id: string; label: string; color: string } | null
  owner: { full_name: string } | null
  // The role this firm plays on this project. A firm can be both buyer and
  // architect on different projects in the same tenant, so we resolve per row.
  firm_role: 'buyer' | 'architect'
}

export type Customer360Order = {
  id: string
  order_number: string
  value: number
  order_date: string
  expected_delivery_at: string | null
  current_stage: { id: string; label: string; color: string } | null
  project: { id: string; name: string } | null
}

export type Customer360Invoice = {
  id: string
  invoice_number: string
  external_invoice_number: string | null
  invoice_date: string
  due_date: string
  total: number
  billed_amount: number
  paid_amount: number
  status: string
  is_running_bill: boolean
  running_bill_seq: number | null
}

export type Customer360Quote = {
  id: string
  quotation_number: string
  status: string
  total: number
  valid_until: string | null
  sent_at: string | null
  created_at: string
  project: { id: string; name: string } | null
}

export type Customer360Collection = {
  id: string
  invoice_id: string
  invoice_number: string
  invoice_date: string
  due_date: string
  billed_amount: number
  paid_amount: number
  outstanding: number
  current_stage: { id: string; label: string; color: string } | null
  last_dunning_at: string | null
  next_action_at: string | null
}

export type Customer360Kpis = {
  // Computed across all projects this firm participates in (capped at the
  // total we fetched — for Vyara today total is small enough that the page
  // load returns everything; if a tenant ever crosses thousands the assembler
  // gets a dedicated aggregate query).
  total_estimated_value: number
  active_project_count: number
  last_touched_at: string | null
}

export type Customer360 = {
  firm: Customer360Firm
  // Primary contact = first contact of the firm by created_at. Kept for the
  // header card alongside `contacts` so the page doesn't have to pick.
  primary_contact: Customer360Contact | null
  contacts: Customer360Contact[]
  contact_count: number
  projects: {
    items: Customer360Project[]
    total: number
    showing: number
  }
  orders: {
    items: Customer360Order[]
    total: number
    showing: number
    total_value: number
    active_count: number
  }
  invoices: {
    items: Customer360Invoice[]
    total: number
    showing: number
    total_outstanding: number
    overdue_count: number
  }
  quotes: {
    items: Customer360Quote[]
    total: number
    showing: number
    total_value: number
    open_count: number
  }
  collections: {
    items: Customer360Collection[]
    total: number
    showing: number
    total_outstanding: number
    overdue_count: number
  }
  kpis: Customer360Kpis
}

// How many items to show per tab before the "Showing X of Y" line.
const PROJECTS_PAGE_SIZE = 10
const ORDERS_PAGE_SIZE = 10
const INVOICES_PAGE_SIZE = 10
const QUOTES_PAGE_SIZE = 10
const COLLECTIONS_PAGE_SIZE = 10

function titleCase(snake: string): string {
  return snake
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// Returns null if the firm doesn't exist (or is soft-deleted, or RLS hides it).
// The page renders notFound() in that case.
export async function getCustomer360(firmId: string): Promise<Customer360 | null> {
  const supabase = await createClient()

  // Capped at 100 because a firm with 100+ live contacts is the kind of edge
  // case that needs its own paged surface — not a slice-1 concern.
  const CONTACTS_CAP = 100

  const [{ data: firmRow }, { data: contactRows, count: contactCount }] = await Promise.all([
    supabase
      .from('firm')
      .select(
        `id, name, type, city, state, gstin, phone, email, website, notes, created_at,
         relationship_type:relationship_type_id(label)`
      )
      .eq('id', firmId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('contact')
      .select('id, full_name, role_title, phone, email', { count: 'exact' })
      .eq('firm_id', firmId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(CONTACTS_CAP),
  ])

  if (!firmRow) return null

  const contacts: Customer360Contact[] = (contactRows ?? []).map((c) => ({
    id: c.id as string,
    full_name: c.full_name as string,
    role_title: (c.role_title as string | null) ?? null,
    phone: (c.phone as string | null) ?? null,
    email: (c.email as string | null) ?? null,
  }))
  const primary_contact = contacts[0] ?? null

  const relationshipTypeJoin = (firmRow.relationship_type as unknown) as
    | { label: string }
    | { label: string }[]
    | null
  const relationshipTypeLabel = Array.isArray(relationshipTypeJoin)
    ? relationshipTypeJoin[0]?.label ?? titleCase(firmRow.type as string)
    : relationshipTypeJoin?.label ?? titleCase(firmRow.type as string)

  // Phase 1 — all reads that don't depend on IDs from other queries.
  //
  // Projects: one capped list (for the Projects tab) + one uncapped aggregate
  // (for KPIs + to extract project IDs used by the Quotes query in Phase 2).
  // The aggregate includes `id` so Phase 2 can build the IN list without an
  // extra round-trip.
  //
  // Orders: same two-query pattern as projects.
  //
  // Invoices: same pattern. The aggregate includes `id`, `billed_amount`,
  // `paid_amount`, `due_date`, `status` so we can compute outstanding/overdue
  // KPIs and build the invoice ID list for the Collections query in Phase 2.
  const [
    { data: projectRows, count: projectTotal },
    { data: projectAggRows },
    { data: orderRows, count: orderTotal },
    { data: orderAggRows },
    { data: invoiceRows, count: invoiceTotal },
    { data: invoiceAggRows },
  ] = await Promise.all([
    supabase
      .from('project')
      .select(
        `id, name, segment, city, estimated_value, updated_at,
         buyer_firm_id, architect_firm_id,
         current_stage:current_stage_id(id, label, color),
         owner:owner_id(full_name)`,
        { count: 'exact' }
      )
      .or(`buyer_firm_id.eq.${firmId},architect_firm_id.eq.${firmId}`)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(PROJECTS_PAGE_SIZE),
    // Uncapped — provides KPIs + project IDs for Phase 2 quotes query.
    supabase
      .from('project')
      .select(
        `id, estimated_value, updated_at,
         current_stage:current_stage_id(is_terminal)`
      )
      .or(`buyer_firm_id.eq.${firmId},architect_firm_id.eq.${firmId}`)
      .is('deleted_at', null),
    supabase
      .from('sales_order')
      .select(
        `id, order_number, value, order_date, expected_delivery_at,
         current_stage:current_stage_id(id, label, color),
         project:project_id(id, name)`,
        { count: 'exact' }
      )
      .eq('buyer_firm_id', firmId)
      .is('deleted_at', null)
      .order('order_date', { ascending: false })
      .limit(ORDERS_PAGE_SIZE),
    supabase
      .from('sales_order')
      .select(`value, current_stage:current_stage_id(is_terminal)`)
      .eq('buyer_firm_id', firmId)
      .is('deleted_at', null),
    supabase
      .from('invoice')
      .select(
        `id, invoice_number, external_invoice_number,
         invoice_date, due_date, total, billed_amount, paid_amount,
         status, is_running_bill, running_bill_seq`,
        { count: 'exact' }
      )
      .eq('buyer_firm_id', firmId)
      .is('deleted_at', null)
      .order('invoice_date', { ascending: false })
      .limit(INVOICES_PAGE_SIZE),
    // Uncapped — provides outstanding/overdue KPIs + invoice IDs for Phase 2.
    supabase
      .from('invoice')
      .select(`id, billed_amount, paid_amount, due_date, status`)
      .eq('buyer_firm_id', firmId)
      .is('deleted_at', null),
  ])

  // ── KPI rollup across all projects ──────────────────────────────────────────
  type ProjectAggRow = {
    id: string
    estimated_value: number | null
    updated_at: string
    current_stage: { is_terminal: boolean } | { is_terminal: boolean }[] | null
  }
  let total_estimated_value = 0
  let active_project_count = 0
  let last_touched_at: string | null = null
  const projectIds: string[] = []
  for (const row of ((projectAggRows ?? []) as unknown as ProjectAggRow[])) {
    projectIds.push(row.id)
    total_estimated_value += row.estimated_value ?? 0
    const stage = Array.isArray(row.current_stage) ? row.current_stage[0] ?? null : row.current_stage
    if (stage && !stage.is_terminal) active_project_count++
    if (!last_touched_at || row.updated_at > last_touched_at) last_touched_at = row.updated_at
  }

  // ── Projects shaping ─────────────────────────────────────────────────────────
  type ProjectRow = {
    id: string
    name: string
    segment: string
    city: string | null
    estimated_value: number | null
    updated_at: string
    buyer_firm_id: string | null
    architect_firm_id: string | null
    current_stage: { id: string; label: string; color: string } | { id: string; label: string; color: string }[] | null
    owner: { full_name: string } | { full_name: string }[] | null
  }

  const mergedItems = ((projectRows ?? []) as unknown as ProjectRow[]).map<Customer360Project>((p) => ({
    id: p.id,
    name: p.name,
    segment: p.segment,
    city: p.city,
    estimated_value: p.estimated_value,
    updated_at: p.updated_at,
    current_stage: Array.isArray(p.current_stage) ? (p.current_stage[0] ?? null) : p.current_stage,
    owner: Array.isArray(p.owner) ? (p.owner[0] ?? null) : p.owner,
    // Buyer is the more material role when the firm plays both parts.
    firm_role: p.buyer_firm_id === firmId ? 'buyer' : 'architect',
  }))
  const total = projectTotal ?? mergedItems.length

  // ── Orders shaping ───────────────────────────────────────────────────────────
  type OrderRow = {
    id: string
    order_number: string
    value: number
    order_date: string
    expected_delivery_at: string | null
    current_stage: { id: string; label: string; color: string } | { id: string; label: string; color: string }[] | null
    project: { id: string; name: string } | { id: string; name: string }[] | null
  }
  const orderItems = ((orderRows ?? []) as unknown as OrderRow[]).map<Customer360Order>((o) => ({
    id: o.id,
    order_number: o.order_number,
    value: o.value,
    order_date: o.order_date,
    expected_delivery_at: o.expected_delivery_at,
    current_stage: Array.isArray(o.current_stage) ? (o.current_stage[0] ?? null) : o.current_stage,
    project: Array.isArray(o.project) ? (o.project[0] ?? null) : o.project,
  }))

  type OrderAggRow = {
    value: number | null
    current_stage: { is_terminal: boolean } | { is_terminal: boolean }[] | null
  }
  let total_order_value = 0
  let active_order_count = 0
  for (const row of ((orderAggRows ?? []) as unknown as OrderAggRow[])) {
    total_order_value += row.value ?? 0
    const stage = Array.isArray(row.current_stage) ? row.current_stage[0] ?? null : row.current_stage
    if (stage && !stage.is_terminal) active_order_count++
  }

  // ── Invoices shaping ─────────────────────────────────────────────────────────
  type InvoiceRow = {
    id: string
    invoice_number: string
    external_invoice_number: string | null
    invoice_date: string
    due_date: string
    total: number
    billed_amount: number
    paid_amount: number
    status: string
    is_running_bill: boolean
    running_bill_seq: number | null
  }
  const invoiceItems = ((invoiceRows ?? []) as unknown as InvoiceRow[]).map<Customer360Invoice>((i) => ({
    id: i.id,
    invoice_number: i.invoice_number,
    external_invoice_number: i.external_invoice_number,
    invoice_date: i.invoice_date,
    due_date: i.due_date,
    total: i.total,
    billed_amount: i.billed_amount,
    paid_amount: i.paid_amount,
    status: i.status,
    is_running_bill: i.is_running_bill,
    running_bill_seq: i.running_bill_seq,
  }))

  // Compute invoice KPIs and extract all invoice IDs from the uncapped agg.
  type InvoiceAggRow = {
    id: string
    billed_amount: number
    paid_amount: number
    due_date: string
    status: string
  }
  const CLOSED_STATUSES = new Set(['paid', 'cancelled', 'written_off'])
  const today = new Date().toISOString().slice(0, 10)
  let invoice_total_outstanding = 0
  let invoice_overdue_count = 0
  const invoiceIds: string[] = []
  for (const row of ((invoiceAggRows ?? []) as unknown as InvoiceAggRow[])) {
    invoiceIds.push(row.id)
    if (!CLOSED_STATUSES.has(row.status)) {
      const outstanding = (row.billed_amount ?? 0) - (row.paid_amount ?? 0)
      if (outstanding > 0) invoice_total_outstanding += outstanding
      if (row.due_date < today) invoice_overdue_count++
    }
  }

  // ── Phase 2: Quotes + Collections (depend on IDs from Phase 1) ───────────────
  // Run both in parallel; skip each if the ID list is empty (avoids a PostgREST
  // error on `.in('col', [])` which sends `?col=in.()` and returns nothing but
  // is safer to guard).

  const [
    { data: quoteRows, count: quoteTotal },
    { data: quoteAggRows },
    { data: collectionRows, count: collectionTotal },
  ] = await Promise.all([
    projectIds.length > 0
      ? supabase
          .from('quotation')
          .select(
            `id, quotation_number, status, total, valid_until, sent_at, created_at,
             project:project_id(id, name)`,
            { count: 'exact' }
          )
          .in('project_id', projectIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(QUOTES_PAGE_SIZE)
      : Promise.resolve({ data: [] as unknown[], count: 0, error: null }),
    projectIds.length > 0
      ? supabase
          .from('quotation')
          .select(`total, status`)
          .in('project_id', projectIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    invoiceIds.length > 0
      ? supabase
          .from('collection')
          .select(
            `id, invoice_id, last_dunning_at, next_action_at,
             current_stage:current_stage_id(id, label, color),
             invoice:invoice_id(id, invoice_number, invoice_date, due_date,
                                billed_amount, paid_amount)`,
            { count: 'exact' }
          )
          .in('invoice_id', invoiceIds)
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
          .limit(COLLECTIONS_PAGE_SIZE)
      : Promise.resolve({ data: [] as unknown[], count: 0, error: null }),
  ])

  // ── Quotes shaping ───────────────────────────────────────────────────────────
  const OPEN_QUOTE_STATUSES = new Set(['draft', 'sent', 'revised'])
  type QuoteRow = {
    id: string
    quotation_number: string
    status: string
    total: number
    valid_until: string | null
    sent_at: string | null
    created_at: string
    project: { id: string; name: string } | { id: string; name: string }[] | null
  }
  const quoteItems = ((quoteRows ?? []) as unknown as QuoteRow[]).map<Customer360Quote>((q) => ({
    id: q.id,
    quotation_number: q.quotation_number,
    status: q.status,
    total: q.total,
    valid_until: q.valid_until,
    sent_at: q.sent_at,
    created_at: q.created_at,
    project: Array.isArray(q.project) ? (q.project[0] ?? null) : q.project,
  }))

  type QuoteAggRow = { total: number | null; status: string }
  let quote_total_value = 0
  let quote_open_count = 0
  for (const row of ((quoteAggRows ?? []) as unknown as QuoteAggRow[])) {
    quote_total_value += row.total ?? 0
    if (OPEN_QUOTE_STATUSES.has(row.status)) quote_open_count++
  }

  // ── Collections shaping ──────────────────────────────────────────────────────
  type CollectionRow = {
    id: string
    invoice_id: string
    last_dunning_at: string | null
    next_action_at: string | null
    current_stage: { id: string; label: string; color: string } | { id: string; label: string; color: string }[] | null
    invoice:
      | { id: string; invoice_number: string; invoice_date: string; due_date: string; billed_amount: number; paid_amount: number }
      | { id: string; invoice_number: string; invoice_date: string; due_date: string; billed_amount: number; paid_amount: number }[]
      | null
  }
  const collectionItems = ((collectionRows ?? []) as unknown as CollectionRow[]).map<Customer360Collection>((c) => {
    const inv = Array.isArray(c.invoice) ? (c.invoice[0] ?? null) : c.invoice
    const billed = inv?.billed_amount ?? 0
    const paid = inv?.paid_amount ?? 0
    return {
      id: c.id,
      invoice_id: c.invoice_id,
      invoice_number: inv?.invoice_number ?? '',
      invoice_date: inv?.invoice_date ?? '',
      due_date: inv?.due_date ?? '',
      billed_amount: billed,
      paid_amount: paid,
      outstanding: Math.max(0, billed - paid),
      current_stage: Array.isArray(c.current_stage) ? (c.current_stage[0] ?? null) : c.current_stage,
      last_dunning_at: c.last_dunning_at,
      next_action_at: c.next_action_at,
    }
  })

  // Collections aggregate: derived from invoiceAggRows (already have all the
  // needed fields — avoids an extra query just for the totals).
  let collection_total_outstanding = invoice_total_outstanding
  let collection_overdue_count = invoice_overdue_count

  return {
    firm: {
      id: firmRow.id as string,
      name: firmRow.name as string,
      type_code: firmRow.type as string,
      relationship_type_label: relationshipTypeLabel,
      city: (firmRow.city as string | null) ?? null,
      state: (firmRow.state as string) ?? 'Gujarat',
      gstin: (firmRow.gstin as string | null) ?? null,
      phone: (firmRow.phone as string | null) ?? null,
      email: (firmRow.email as string | null) ?? null,
      website: (firmRow.website as string | null) ?? null,
      notes: (firmRow.notes as string | null) ?? null,
      created_at: firmRow.created_at as string,
    },
    primary_contact,
    contacts,
    contact_count: contactCount ?? contacts.length,
    projects: {
      items: mergedItems,
      total,
      showing: mergedItems.length,
    },
    orders: {
      items: orderItems,
      total: orderTotal ?? orderItems.length,
      showing: orderItems.length,
      total_value: total_order_value,
      active_count: active_order_count,
    },
    invoices: {
      items: invoiceItems,
      total: invoiceTotal ?? invoiceItems.length,
      showing: invoiceItems.length,
      total_outstanding: invoice_total_outstanding,
      overdue_count: invoice_overdue_count,
    },
    quotes: {
      items: quoteItems,
      total: quoteTotal ?? quoteItems.length,
      showing: quoteItems.length,
      total_value: quote_total_value,
      open_count: quote_open_count,
    },
    collections: {
      items: collectionItems,
      total: collectionTotal ?? collectionItems.length,
      showing: collectionItems.length,
      total_outstanding: collection_total_outstanding,
      overdue_count: collection_overdue_count,
    },
    kpis: {
      total_estimated_value,
      active_project_count,
      last_touched_at,
    },
  }
}
