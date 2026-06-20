/**
 * /firms — list of every organisation in the tenant (Blueprint REL-009 Slice 1.5).
 *
 * Filtering: server-side URL params.
 * Signals: 4 parallel bulk queries (overdue invoices, stale sent quotes,
 *   stuck projects, stale leads) annotate each row with health chips.
 * New filters: city, state, needs_attention (any signal present).
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
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()

  const freshSince = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  const [
    { data: allFirmRows },
    { data: typeRows },
    { data: overdueInvoiceRows },
    { data: staleQuoteRows },
    { data: stuckProjectRows },
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

    // Overdue invoices: due < today, not closed
    supabase
      .from('invoice')
      .select('buyer_firm_id, billed_amount, paid_amount, due_date')
      .not('buyer_firm_id', 'is', null)
      .not('status', 'in', '(paid,cancelled,written_off)')
      .lt('due_date', today)
      .is('deleted_at', null),

    // Sent quotes with no response > 7 days old (need project.buyer/architect firm)
    supabase
      .from('quotation')
      .select('id, sent_at, total, project:project_id(buyer_firm_id, architect_firm_id)')
      .eq('status', 'sent')
      .lt('sent_at', sevenDaysAgo)
      .is('deleted_at', null),

    // Active projects not updated in 14 days
    supabase
      .from('project')
      .select('buyer_firm_id, architect_firm_id, updated_at, current_stage:current_stage_id(is_terminal)')
      .lt('updated_at', fourteenDaysAgo)
      .is('deleted_at', null),

    // Open leads not updated in 3 days
    supabase
      .from('lead')
      .select('buyer_firm_id, architect_firm_id, updated_at')
      .lt('updated_at', threeDaysAgo)
      .not('stage', 'in', '(won,lost)')
      .is('deleted_at', null),

    // Cached AI briefs (<24h) — one query, no new AI calls
    supabase
      .from('ai_extraction')
      .select('source_storage_path, raw_output')
      .eq('entity_kind', 'firm_brief')
      .gte('created_at', freshSince)
      .order('created_at', { ascending: false }),
  ])

  // ── Build per-firm signal maps ──────────────────────────────────────────────

  // Overdue invoice totals per buyer firm
  const overdueByFirm = new Map<string, { count: number; outstanding: number; days: number }>()
  for (const inv of (overdueInvoiceRows ?? []) as Array<{ buyer_firm_id: string; billed_amount: number; paid_amount: number; due_date: string }>) {
    const fid = inv.buyer_firm_id
    const outstanding = (inv.billed_amount ?? 0) - (inv.paid_amount ?? 0)
    if (outstanding <= 0) continue
    const days = Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000)
    const cur = overdueByFirm.get(fid) ?? { count: 0, outstanding: 0, days: 0 }
    overdueByFirm.set(fid, { count: cur.count + 1, outstanding: cur.outstanding + outstanding, days: Math.max(cur.days, days) })
  }

  // Stale sent quotes per firm (via project buyer/architect)
  const staleQuoteByFirm = new Map<string, { count: number; days: number }>()
  type QuoteRaw = { sent_at: string | null; project: { buyer_firm_id: string | null; architect_firm_id: string | null } | { buyer_firm_id: string | null; architect_firm_id: string | null }[] | null }
  for (const q_ of (staleQuoteRows ?? []) as unknown as QuoteRaw[]) {
    const p = Array.isArray(q_.project) ? q_.project[0] : q_.project
    if (!p) continue
    const days = q_.sent_at ? Math.floor((Date.now() - new Date(q_.sent_at).getTime()) / 86400000) : 0
    for (const fid of [p.buyer_firm_id, p.architect_firm_id]) {
      if (!fid) continue
      const cur = staleQuoteByFirm.get(fid) ?? { count: 0, days: 0 }
      staleQuoteByFirm.set(fid, { count: cur.count + 1, days: Math.max(cur.days, days) })
    }
  }

  // Stuck projects per firm
  const stuckProjectByFirm = new Map<string, { count: number; days: number }>()
  type ProjectRaw = { buyer_firm_id: string | null; architect_firm_id: string | null; updated_at: string; current_stage: { is_terminal: boolean } | { is_terminal: boolean }[] | null }
  for (const p of (stuckProjectRows ?? []) as unknown as ProjectRaw[]) {
    const stage = Array.isArray(p.current_stage) ? p.current_stage[0] : p.current_stage
    if (stage?.is_terminal) continue
    const days = Math.floor((Date.now() - new Date(p.updated_at).getTime()) / 86400000)
    for (const fid of [p.buyer_firm_id, p.architect_firm_id]) {
      if (!fid) continue
      const cur = stuckProjectByFirm.get(fid) ?? { count: 0, days: 0 }
      stuckProjectByFirm.set(fid, { count: cur.count + 1, days: Math.max(cur.days, days) })
    }
  }

  // Stale leads per firm
  const staleLeadByFirm = new Map<string, { count: number; days: number }>()
  type LeadRaw = { buyer_firm_id: string | null; architect_firm_id: string | null; updated_at: string }
  for (const l of (staleLeadRows ?? []) as unknown as LeadRaw[]) {
    const days = Math.floor((Date.now() - new Date(l.updated_at).getTime()) / 86400000)
    for (const fid of [l.buyer_firm_id, l.architect_firm_id]) {
      if (!fid) continue
      const cur = staleLeadByFirm.get(fid) ?? { count: 0, days: 0 }
      staleLeadByFirm.set(fid, { count: cur.count + 1, days: Math.max(cur.days, days) })
    }
  }

  // Cached AI briefs keyed by firm ID (extracted from source_storage_path)
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

  // Derived health from signals (rule-based, mirrors Claude's classification logic)
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
    const signals: FirmRow['signals'] = {
      overdue: overdueByFirm.get(f.id),
      stale_quote: staleQuoteByFirm.get(f.id),
      stuck_project: stuckProjectByFirm.get(f.id),
      stale_lead: staleLeadByFirm.get(f.id),
    }
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
