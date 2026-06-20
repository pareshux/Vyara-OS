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

export type Customer360 = {
  firm: Customer360Firm
  primary_contact: Customer360Contact | null
  contact_count: number
  projects: {
    items: Customer360Project[]
    total: number
    showing: number
  }
}

// How many projects to show on the page before the "Showing X of Y" line.
const PROJECTS_PAGE_SIZE = 10

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

  const [{ data: firmRow }, { count: contactCount }, { data: primaryContact }] = await Promise.all([
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
      .select('id', { count: 'exact', head: true })
      .eq('firm_id', firmId)
      .is('deleted_at', null),
    supabase
      .from('contact')
      .select('id, full_name, role_title, phone, email')
      .eq('firm_id', firmId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  if (!firmRow) return null

  const relationshipTypeJoin = (firmRow.relationship_type as unknown) as
    | { label: string }
    | { label: string }[]
    | null
  const relationshipTypeLabel = Array.isArray(relationshipTypeJoin)
    ? relationshipTypeJoin[0]?.label ?? titleCase(firmRow.type as string)
    : relationshipTypeJoin?.label ?? titleCase(firmRow.type as string)

  // Projects this firm participates in — either as buyer or architect.
  // One query with .or() so the dedup happens at the DB layer and the count
  // is exact (no double-counting for firms playing both roles on a project).
  // buyer_firm_id and architect_firm_id are kept on the row so we can resolve
  // firm_role per row.
  const { data: projectRows, count: projectTotal } = await supabase
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
    .limit(PROJECTS_PAGE_SIZE)

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
    primary_contact: primaryContact
      ? {
          id: primaryContact.id as string,
          full_name: primaryContact.full_name as string,
          role_title: (primaryContact.role_title as string | null) ?? null,
          phone: (primaryContact.phone as string | null) ?? null,
          email: (primaryContact.email as string | null) ?? null,
        }
      : null,
    contact_count: contactCount ?? 0,
    projects: {
      items: mergedItems,
      total,
      showing: mergedItems.length,
    },
  }
}
