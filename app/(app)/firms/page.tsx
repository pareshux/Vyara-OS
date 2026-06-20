/**
 * /firms — list of every organisation in the tenant (Blueprint REL-009 Slice 1.5).
 *
 * Filtering: server-side URL params.
 * Signals: 7 parallel bulk queries annotate each row with commercial KPIs + health chips.
 */
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FirmsClient, type FirmRow, type RelationshipTypeOption } from './firms-client'

export const dynamic = 'force-dynamic'

export default async function FirmsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; city?: string; state?: string; attention?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const typeFilter = sp.type ?? null
  const cityFilter = sp.city ?? null
  const stateFilter = sp.state ?? null
  const attentionOnly = sp.attention === 'yes'

  const today = new Date().toISOString().slice(0, 10)
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()
  const freshSince = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  const [
    { data: allFirmRows },
    { data: typeRows },
    { data: allInvoiceRows },
    { data: allOpenQuoteRows },
    { data: allProjectRows },
    { data: staleLeadRows },
    { data: cachedBriefRows },
  ] = await Promise.all([
    supabase
      .from('firm')
      .select(`id, name, type, city, state, phone, gstin,
               relationship_type:relationship_type_id(code, label)`)
      .is('deleted_at', null)
      .order('name'),

    supabase
      .from('relationship_type_master')
      .select('code, label, sort_order')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('sort_order'),

    // ALL invoices per firm (for lifetime_value, outstanding, overdue)
    supabase
      .from('invoice')
      .select('buyer_firm_id, billed_amount, paid_amount, due_date, status, created_at')
      .not('buyer_firm_id', 'is', null)
      .is('deleted_at', null),

    // ALL non-closed quotes (for pipeline_value, pipeline_count, stale_quote signal)
    supabase
      .from('quotation')
      .select('id, status, total, sent_at, created_at, project:project_id(buyer_firm_id, architect_firm_id)')
      .not('status', 'in', '(accepted,rejected,expired)')
      .is('deleted_at', null),

    // ALL projects with owner (for active_project_count, stuck signal, rep_name)
    supabase
      .from('project')
      .select('buyer_firm_id, architect_firm_id, updated_at, current_stage:current_stage_id(is_terminal), owner:owner_id(full_name)')
      .is('deleted_at', null),

    // Open leads not updated in 3 days (stale lead signal only)
    supabase
      .from('lead')
      .select('buyer_firm_id, architect_firm_id, updated_at')
      .lt('updated_at', threeDaysAgo)
      .not('stage', 'in', '(won,lost)')
      .is('deleted_at', null),

    // Cached AI briefs (<24h)
    supabase
      .from('ai_extraction')
      .select('source_storage_path, raw_output')
      .eq('entity_kind', 'firm_brief')
      .gte('created_at', freshSince)
      .order('created_at', { ascending: false }),
  ])

  // ── Invoice KPIs per buyer_firm_id ──────────────────────────────────────────
  type InvoiceRaw = {
    buyer_firm_id: string
    billed_amount: number | null
    paid_amount: number | null
    due_date: string | null
    status: string | null
    created_at: string
  }
  const invoiceKpiByFirm = new Map<string, {
    lifetime_value: number
    outstanding: number
    overdue_outstanding: number
    overdue_days: number
    last_invoice_at: string | null
  }>()
  const CLOSED_STATUSES = new Set(['paid', 'cancelled', 'written_off'])
  for (const inv of (allInvoiceRows ?? []) as unknown as InvoiceRaw[]) {
    const fid = inv.buyer_firm_id
    const billed = inv.billed_amount ?? 0
    const paid = inv.paid_amount ?? 0
    const cur = invoiceKpiByFirm.get(fid) ?? {
      lifetime_value: 0,
      outstanding: 0,
      overdue_outstanding: 0,
      overdue_days: 0,
      last_invoice_at: null,
    }
    cur.lifetime_value += billed
    const rowOutstanding = billed - paid
    if (!CLOSED_STATUSES.has(inv.status ?? '') && rowOutstanding > 0) {
      cur.outstanding += rowOutstanding
      if (inv.due_date && inv.due_date < today) {
        cur.overdue_outstanding += rowOutstanding
        const days = Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000)
        cur.overdue_days = Math.max(cur.overdue_days, days)
      }
    }
    if (!cur.last_invoice_at || inv.created_at > cur.last_invoice_at) {
      cur.last_invoice_at = inv.created_at
    }
    invoiceKpiByFirm.set(fid, cur)
  }

  // ── Quote KPIs per firm (buyer and architect) ───────────────────────────────
  type QuoteRaw = {
    id: string
    status: string | null
    total: number | null
    sent_at: string | null
    created_at: string
    project: { buyer_firm_id: string | null; architect_firm_id: string | null } | { buyer_firm_id: string | null; architect_firm_id: string | null }[] | null
  }
  const quoteKpiByFirm = new Map<string, {
    pipeline_value: number
    pipeline_count: number
    last_quote_at: string | null
    stale_quote_days: number
  }>()
  const PIPELINE_STATUSES = new Set(['draft', 'sent', 'revised'])
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  for (const q_ of (allOpenQuoteRows ?? []) as unknown as QuoteRaw[]) {
    const p = Array.isArray(q_.project) ? q_.project[0] : q_.project
    if (!p) continue
    const touchAt = q_.sent_at ?? q_.created_at
    const firmIds = [p.buyer_firm_id, p.architect_firm_id].filter(Boolean) as string[]
    for (const fid of firmIds) {
      const cur = quoteKpiByFirm.get(fid) ?? {
        pipeline_value: 0,
        pipeline_count: 0,
        last_quote_at: null,
        stale_quote_days: 0,
      }
      if (PIPELINE_STATUSES.has(q_.status ?? '')) {
        cur.pipeline_value += q_.total ?? 0
        cur.pipeline_count += 1
      }
      if (!cur.last_quote_at || touchAt > cur.last_quote_at) {
        cur.last_quote_at = touchAt
      }
      if (q_.status === 'sent' && q_.sent_at && q_.sent_at < sevenDaysAgo) {
        const days = Math.floor((Date.now() - new Date(q_.sent_at).getTime()) / 86400000)
        cur.stale_quote_days = Math.max(cur.stale_quote_days, days)
      }
      quoteKpiByFirm.set(fid, cur)
    }
  }

  // ── Project KPIs per firm (buyer and architect) ─────────────────────────────
  type ProjectRaw = {
    buyer_firm_id: string | null
    architect_firm_id: string | null
    updated_at: string
    current_stage: { is_terminal: boolean } | { is_terminal: boolean }[] | null
    owner: { full_name: string } | { full_name: string }[] | null
  }
  const projectKpiByFirm = new Map<string, {
    active_project_count: number
    stuck_project_days: number
    last_project_at: string | null
    rep_name: string | null
    rep_updated_at: string | null
  }>()
  for (const p of (allProjectRows ?? []) as unknown as ProjectRaw[]) {
    const stage = Array.isArray(p.current_stage) ? p.current_stage[0] : p.current_stage
    const isActive = !stage?.is_terminal
    const o = Array.isArray(p.owner) ? p.owner[0] : p.owner
    const firmIds = [p.buyer_firm_id, p.architect_firm_id].filter(Boolean) as string[]
    for (const fid of firmIds) {
      const cur = projectKpiByFirm.get(fid) ?? {
        active_project_count: 0,
        stuck_project_days: 0,
        last_project_at: null,
        rep_name: null,
        rep_updated_at: null,
      }
      if (isActive) {
        cur.active_project_count += 1
        const days = Math.floor((Date.now() - new Date(p.updated_at).getTime()) / 86400000)
        if (p.updated_at < fourteenDaysAgo) {
          cur.stuck_project_days = Math.max(cur.stuck_project_days, days)
        }
        if (!cur.last_project_at || p.updated_at > cur.last_project_at) {
          cur.last_project_at = p.updated_at
        }
        if (o?.full_name && (!cur.rep_updated_at || p.updated_at > cur.rep_updated_at)) {
          cur.rep_name = o.full_name
          cur.rep_updated_at = p.updated_at
        }
      }
      projectKpiByFirm.set(fid, cur)
    }
  }

  // ── Stale leads per firm ────────────────────────────────────────────────────
  type LeadRaw = { buyer_firm_id: string | null; architect_firm_id: string | null; updated_at: string }
  const staleLeadByFirm = new Map<string, { count: number; days: number }>()
  for (const l of (staleLeadRows ?? []) as unknown as LeadRaw[]) {
    const days = Math.floor((Date.now() - new Date(l.updated_at).getTime()) / 86400000)
    for (const fid of [l.buyer_firm_id, l.architect_firm_id]) {
      if (!fid) continue
      const cur = staleLeadByFirm.get(fid) ?? { count: 0, days: 0 }
      staleLeadByFirm.set(fid, { count: cur.count + 1, days: Math.max(cur.days, days) })
    }
  }

  // ── Cached AI briefs ────────────────────────────────────────────────────────
  const briefByFirm = new Map<string, { health: 'healthy' | 'needs_attention' | 'critical'; headline: string }>()
  for (const row of (cachedBriefRows ?? []) as Array<{ source_storage_path: string; raw_output: string | null }>) {
    const match = row.source_storage_path?.match(/^inline_text:firm_brief:(.+)$/)
    if (!match || !row.raw_output) continue
    try {
      const parsed = JSON.parse(row.raw_output)
      if (parsed?.health && parsed?.headline) {
        const firmId = match[1]
        if (!briefByFirm.has(firmId)) {
          briefByFirm.set(firmId, { health: parsed.health, headline: parsed.headline })
        }
      }
    } catch { /* skip malformed */ }
  }

  // ── Health derivation ───────────────────────────────────────────────────────
  function deriveHealth(signals: FirmRow['signals']): 'healthy' | 'needs_attention' | 'critical' {
    if (signals.overdue && (signals.overdue.days > 45 || signals.overdue.outstanding > 500000)) return 'critical'
    if (signals.overdue || signals.stale_quote || signals.stuck_project || signals.stale_lead) return 'needs_attention'
    return 'healthy'
  }

  // ── Shape firm rows ─────────────────────────────────────────────────────────
  type RawRow = {
    id: string
    name: string
    type: string
    city: string | null
    state: string
    phone: string | null
    gstin: string | null
    relationship_type: { code: string; label: string } | { code: string; label: string }[] | null
  }

  const allFirms: FirmRow[] = ((allFirmRows ?? []) as unknown as RawRow[]).map((f) => {
    const rt = Array.isArray(f.relationship_type) ? f.relationship_type[0] ?? null : f.relationship_type

    const invKpi = invoiceKpiByFirm.get(f.id)
    const quoteKpi = quoteKpiByFirm.get(f.id)
    const projKpi = projectKpiByFirm.get(f.id)

    const overdueSig = invKpi && invKpi.overdue_outstanding > 0
      ? { count: 1, outstanding: invKpi.overdue_outstanding, days: invKpi.overdue_days }
      : undefined

    const staleQuoteSig = quoteKpi && quoteKpi.stale_quote_days > 0
      ? { count: 1, days: quoteKpi.stale_quote_days }
      : undefined

    const stuckProjectSig = projKpi && projKpi.stuck_project_days > 0
      ? { count: 1, days: projKpi.stuck_project_days }
      : undefined

    const signals: FirmRow['signals'] = {
      overdue: overdueSig,
      stale_quote: staleQuoteSig,
      stuck_project: stuckProjectSig,
      stale_lead: staleLeadByFirm.get(f.id),
    }

    // last_touched_at = max of last_invoice_at, last_quote_at, last_project_at
    const dates = [invKpi?.last_invoice_at, quoteKpi?.last_quote_at, projKpi?.last_project_at]
      .filter(Boolean) as string[]
    const last_touched_at = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null

    return {
      id: f.id,
      name: f.name,
      type_code: rt?.code ?? f.type,
      type_label: rt?.label ?? titleCase(f.type),
      city: f.city,
      state: f.state,
      phone: f.phone,
      gstin: f.gstin,
      signals,
      health: briefByFirm.get(f.id)?.health ?? deriveHealth(signals),
      cachedBrief: briefByFirm.get(f.id),
      active_project_count: projKpi?.active_project_count ?? 0,
      pipeline_value: quoteKpi?.pipeline_value ?? 0,
      pipeline_count: quoteKpi?.pipeline_count ?? 0,
      outstanding: invKpi?.outstanding ?? 0,
      overdue_outstanding: invKpi?.overdue_outstanding ?? 0,
      overdue_days: invKpi?.overdue_days ?? 0,
      lifetime_value: invKpi?.lifetime_value ?? 0,
      last_touched_at,
      rep_name: projKpi?.rep_name ?? null,
    }
  })

  // ── Apply filters ───────────────────────────────────────────────────────────
  let firms = allFirms
  if (typeFilter) firms = firms.filter((f) => f.type_code === typeFilter)
  if (cityFilter) firms = firms.filter((f) => f.city === cityFilter)
  if (stateFilter) firms = firms.filter((f) => f.state === stateFilter)
  if (attentionOnly) {
    firms = firms.filter((f) => {
      const s = f.signals
      return s.overdue || s.stale_quote || s.stuck_project || s.stale_lead
    })
  }
  if (q) {
    const needle = q.toLowerCase()
    firms = firms.filter(
      (f) =>
        f.name.toLowerCase().includes(needle) ||
        (f.city?.toLowerCase().includes(needle) ?? false) ||
        (f.phone?.toLowerCase().includes(needle) ?? false) ||
        (f.gstin?.toLowerCase().includes(needle) ?? false)
    )
  }

  // ── Derive filter options ───────────────────────────────────────────────────
  const countByType = new Map<string, number>()
  for (const f of allFirms) countByType.set(f.type_code, (countByType.get(f.type_code) ?? 0) + 1)

  const types: RelationshipTypeOption[] = (typeRows ?? [])
    .filter((t) => countByType.has(t.code as string))
    .map((t) => ({
      code: t.code as string,
      label: `${t.label} (${countByType.get(t.code as string) ?? 0})`,
    }))

  const cityOptions = [
    ...new Set(allFirms.map((f) => f.city).filter((c): c is string => !!c)),
  ].sort().map((c) => ({ value: c, label: c }))

  const stateOptions = [
    ...new Set(allFirms.map((f) => f.state).filter(Boolean)),
  ].sort().map((s) => ({ value: s, label: s }))

  const hasAnySignals = allFirms.some((f) => {
    const s = f.signals
    return s.overdue || s.stale_quote || s.stuck_project || s.stale_lead
  })

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl">
      <FirmsClient
        firms={firms}
        types={types}
        cityOptions={cityOptions}
        stateOptions={stateOptions}
        hasAnySignals={hasAnySignals}
        totalCount={allFirms.length}
      />
    </div>
  )
}

function titleCase(snake: string): string {
  return snake
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
