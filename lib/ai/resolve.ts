/**
 * Resolve AI-extracted raw text against the live database.
 *
 * Used by the dispatch-diary review UI to take "Greenvista 2026" or "VT-SO-
 * 2026-0099" or "Paver 200x100 Natural" and surface candidate rows from
 * sales_order / product that the user can confirm with one click.
 *
 * Strategy:
 *   - Exact VT-SO-YYYY-NNNN format → highest confidence
 *   - Exact `order_number` / `sku_code` match → high confidence
 *   - ilike substring on order_number or project/buyer name → medium
 *   - ilike substring on sku_code / product.name → medium
 *
 * Designed to be safe on missing pg_trgm extension — we do not assume any
 * non-default extensions are installed. Fuzzy = `ilike '%term%'`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const VYARA_ORDER_REGEX = /VT-SO-\d{4}-\d{4,}/i

export type OrderCandidate = {
  id: string
  order_number: string
  project_name: string | null
  buyer_name: string | null
  value: number
  score: number // [0..1]
  match_kind: 'exact_number' | 'fuzzy_number' | 'fuzzy_project' | 'fuzzy_buyer'
}

export async function resolveOrderNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
  raw: string | null | undefined
): Promise<OrderCandidate[]> {
  if (!raw) return []
  const term = raw.trim()
  // Reject very short terms — they fuzzy-match anything containing those
  // characters and produce confidently-wrong suggestions. Minimum 4 chars,
  // which is enough for tail of an order number (e.g. "0099") or a project
  // name token but rejects "02", "PO", "1" etc.
  if (term.length < 4) return []

  // 1) Exact VT-SO-... match
  const match = term.match(VYARA_ORDER_REGEX)
  if (match) {
    const exact = await fetchOrdersByNumber(supabase, match[0].toUpperCase(), { exact: true })
    if (exact.length > 0) {
      return exact.map((o) => ({ ...o, score: 1, match_kind: 'exact_number' as const }))
    }
  }

  // 2) Fuzzy on order_number itself (catches "VT-SO-26-99" sort of typos)
  const numberRows = await fetchOrdersByNumber(supabase, term, { exact: false })
  const numberHits: OrderCandidate[] = numberRows.map((o) => ({
    ...o,
    score: 0.75,
    match_kind: 'fuzzy_number' as const,
  }))

  // 3) Fuzzy on project name + buyer firm name
  // Two-pass since Supabase doesn't make multi-table-fuzzy easy in one query.
  const tokens = term.split(/[\s,/-]+/).filter((t) => t.length >= 3)
  const fuzzyTerm = tokens[0] ?? term

  const { data: projectMatches } = await supabase
    .from('sales_order')
    .select(
      `id, order_number, value,
       project:project_id!inner(id, name),
       buyer:buyer_firm_id(id, name)`
    )
    .is('deleted_at', null)
    .ilike('project.name', `%${fuzzyTerm}%`)
    .order('created_at', { ascending: false })
    .limit(5)

  const projectHits: OrderCandidate[] = (projectMatches ?? []).map((o) => {
    const p = Array.isArray(o.project) ? o.project[0] : o.project
    const b = Array.isArray(o.buyer) ? o.buyer[0] : o.buyer
    return {
      id: o.id,
      order_number: o.order_number,
      project_name: p?.name ?? null,
      buyer_name: b?.name ?? null,
      value: Number(o.value),
      score: 0.6,
      match_kind: 'fuzzy_project' as const,
    }
  })

  const { data: buyerMatches } = await supabase
    .from('sales_order')
    .select(
      `id, order_number, value,
       project:project_id(id, name),
       buyer:buyer_firm_id!inner(id, name)`
    )
    .is('deleted_at', null)
    .ilike('buyer.name', `%${fuzzyTerm}%`)
    .order('created_at', { ascending: false })
    .limit(5)

  const buyerHits: OrderCandidate[] = (buyerMatches ?? []).map((o) => {
    const p = Array.isArray(o.project) ? o.project[0] : o.project
    const b = Array.isArray(o.buyer) ? o.buyer[0] : o.buyer
    return {
      id: o.id,
      order_number: o.order_number,
      project_name: p?.name ?? null,
      buyer_name: b?.name ?? null,
      value: Number(o.value),
      score: 0.5,
      match_kind: 'fuzzy_buyer' as const,
    }
  })

  // De-duplicate by id, keep highest score
  const merged = new Map<string, OrderCandidate>()
  for (const list of [numberHits, projectHits, buyerHits]) {
    for (const hit of list) {
      const existing = merged.get(hit.id)
      if (!existing || hit.score > existing.score) {
        merged.set(hit.id, hit)
      }
    }
  }
  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

async function fetchOrdersByNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
  term: string,
  opts: { exact: boolean }
): Promise<Omit<OrderCandidate, 'score' | 'match_kind'>[]> {
  let query = supabase
    .from('sales_order')
    .select(
      `id, order_number, value,
       project:project_id(id, name),
       buyer:buyer_firm_id(id, name)`
    )
    .is('deleted_at', null)
  query = opts.exact ? query.eq('order_number', term) : query.ilike('order_number', `%${term}%`)
  const { data } = await query.order('created_at', { ascending: false }).limit(5)
  return (data ?? []).map((o) => {
    const p = Array.isArray(o.project) ? o.project[0] : o.project
    const b = Array.isArray(o.buyer) ? o.buyer[0] : o.buyer
    return {
      id: o.id,
      order_number: o.order_number,
      project_name: p?.name ?? null,
      buyer_name: b?.name ?? null,
      value: Number(o.value),
    }
  })
}

// ─── SKU resolution ─────────────────────────────────────────────────────────

export type SKUCandidate = {
  id: string
  sku_code: string
  name: string
  unit: string
  score: number
  match_kind: 'exact_code' | 'fuzzy_code' | 'fuzzy_name'
}

export async function resolveSKU(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
  raw: string | null | undefined
): Promise<SKUCandidate[]> {
  if (!raw) return []
  const term = raw.trim()
  // Reject very short terms; see resolveOrderNumber for rationale.
  if (term.length < 3) return []

  // 1) Exact sku_code match — case-insensitive
  const { data: exactRows } = await supabase
    .from('product')
    .select('id, sku_code, name, unit')
    .is('deleted_at', null)
    .ilike('sku_code', term)
    .limit(3)

  const exactHits: SKUCandidate[] = (exactRows ?? []).map((p) => ({
    id: p.id,
    sku_code: p.sku_code,
    name: p.name,
    unit: p.unit,
    score: 1,
    match_kind: 'exact_code' as const,
  }))

  // 2) Fuzzy on sku_code
  const { data: codeRows } = await supabase
    .from('product')
    .select('id, sku_code, name, unit')
    .is('deleted_at', null)
    .ilike('sku_code', `%${term}%`)
    .limit(5)

  const codeHits: SKUCandidate[] = (codeRows ?? []).map((p) => ({
    id: p.id,
    sku_code: p.sku_code,
    name: p.name,
    unit: p.unit,
    score: 0.7,
    match_kind: 'fuzzy_code' as const,
  }))

  // 3) Token-based fuzzy on product name — pick the longest token (more selective)
  const tokens = term.split(/[\s,/-]+/).filter((t) => t.length >= 3)
  const longest = tokens.sort((a, b) => b.length - a.length)[0] ?? term

  const { data: nameRows } = await supabase
    .from('product')
    .select('id, sku_code, name, unit')
    .is('deleted_at', null)
    .ilike('name', `%${longest}%`)
    .limit(5)

  const nameHits: SKUCandidate[] = (nameRows ?? []).map((p) => {
    // Boost score when more tokens match the name
    const matched = tokens.filter((t) => p.name.toLowerCase().includes(t.toLowerCase())).length
    const score = Math.min(0.85, 0.5 + matched * 0.1)
    return {
      id: p.id,
      sku_code: p.sku_code,
      name: p.name,
      unit: p.unit,
      score,
      match_kind: 'fuzzy_name' as const,
    }
  })

  const merged = new Map<string, SKUCandidate>()
  for (const list of [exactHits, codeHits, nameHits]) {
    for (const hit of list) {
      const existing = merged.get(hit.id)
      if (!existing || hit.score > existing.score) {
        merged.set(hit.id, hit)
      }
    }
  }
  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

// ─── Buyer firm resolution ──────────────────────────────────────────────────

export type BuyerFirmCandidate = {
  id: string
  name: string
  gstin: string | null
  city: string | null
  type: string
  score: number
  match_kind: 'exact_gstin' | 'exact_name' | 'fuzzy_name'
}

/**
 * Resolve a buyer firm from raw invoice text.
 * Priority:
 *   1. GSTIN exact match (unambiguous when present)
 *   2. Name exact (case-insensitive)
 *   3. Name fuzzy (ilike on longest token)
 */
export async function resolveBuyerFirm(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
  rawName: string | null | undefined,
  rawGstin: string | null | undefined
): Promise<BuyerFirmCandidate[]> {
  const hits: BuyerFirmCandidate[] = []

  // 1) GSTIN — strongest signal
  const gstin = (rawGstin ?? '').trim().toUpperCase()
  if (gstin.length === 15) {
    const { data } = await supabase
      .from('firm')
      .select('id, name, gstin, city, type')
      .is('deleted_at', null)
      .eq('gstin', gstin)
      .limit(2)
    for (const f of data ?? []) {
      hits.push({
        id: f.id,
        name: f.name,
        gstin: f.gstin,
        city: f.city,
        type: f.type,
        score: 1,
        match_kind: 'exact_gstin',
      })
    }
  }

  const name = (rawName ?? '').trim()
  if (name) {
    // 2) Exact name (case-insensitive)
    const { data: exactRows } = await supabase
      .from('firm')
      .select('id, name, gstin, city, type')
      .is('deleted_at', null)
      .ilike('name', name)
      .limit(3)
    for (const f of exactRows ?? []) {
      hits.push({
        id: f.id,
        name: f.name,
        gstin: f.gstin,
        city: f.city,
        type: f.type,
        score: 0.85,
        match_kind: 'exact_name',
      })
    }

    // 3) Fuzzy name on longest token (≥3 chars)
    const tokens = name.split(/[\s,/-]+/).filter((t) => t.length >= 3)
    const longest = tokens.sort((a, b) => b.length - a.length)[0]
    if (longest) {
      const { data: fuzzyRows } = await supabase
        .from('firm')
        .select('id, name, gstin, city, type')
        .is('deleted_at', null)
        .ilike('name', `%${longest}%`)
        .limit(5)
      for (const f of fuzzyRows ?? []) {
        const matchedTokens = tokens.filter((t) =>
          f.name.toLowerCase().includes(t.toLowerCase())
        ).length
        const score = Math.min(0.8, 0.5 + matchedTokens * 0.1)
        hits.push({
          id: f.id,
          name: f.name,
          gstin: f.gstin,
          city: f.city,
          type: f.type,
          score,
          match_kind: 'fuzzy_name',
        })
      }
    }
  }

  const merged = new Map<string, BuyerFirmCandidate>()
  for (const h of hits) {
    const ex = merged.get(h.id)
    if (!ex || h.score > ex.score) merged.set(h.id, h)
  }
  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

// ─── Project resolution ────────────────────────────────────────────────────

export type ProjectCandidate = {
  id: string
  name: string
  segment: string
  city: string | null
  score: number
  match_kind: 'exact_name' | 'fuzzy_name'
}

export async function resolveProject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
  raw: string | null | undefined
): Promise<ProjectCandidate[]> {
  if (!raw) return []
  const term = raw.trim()
  if (term.length < 4) return []

  const hits: ProjectCandidate[] = []

  // 1) Exact name
  const { data: exactRows } = await supabase
    .from('project')
    .select('id, name, segment, city')
    .is('deleted_at', null)
    .ilike('name', term)
    .limit(3)
  for (const p of exactRows ?? []) {
    hits.push({
      id: p.id,
      name: p.name,
      segment: p.segment,
      city: p.city,
      score: 0.95,
      match_kind: 'exact_name',
    })
  }

  // 2) Fuzzy on longest token
  const tokens = term.split(/[\s,/-]+/).filter((t) => t.length >= 3)
  const longest = tokens.sort((a, b) => b.length - a.length)[0] ?? term
  const { data: fuzzyRows } = await supabase
    .from('project')
    .select('id, name, segment, city')
    .is('deleted_at', null)
    .ilike('name', `%${longest}%`)
    .limit(5)
  for (const p of fuzzyRows ?? []) {
    const matchedTokens = tokens.filter((t) =>
      p.name.toLowerCase().includes(t.toLowerCase())
    ).length
    const score = Math.min(0.85, 0.5 + matchedTokens * 0.1)
    hits.push({
      id: p.id,
      name: p.name,
      segment: p.segment,
      city: p.city,
      score,
      match_kind: 'fuzzy_name',
    })
  }

  const merged = new Map<string, ProjectCandidate>()
  for (const h of hits) {
    const ex = merged.get(h.id)
    if (!ex || h.score > ex.score) merged.set(h.id, h)
  }
  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

// ─── Contact resolution (existing contact dedupe) ──────────────────────────
//
// When extracting a business card, we want to surface "this contact already
// exists in your contacts — link rather than duplicate" before creating a new
// row. Priority:
//   1. Phone exact (normalized) — strongest dedupe signal
//   2. Email exact (case-insensitive)
//   3. Name fuzzy

export type ContactCandidate = {
  id: string
  full_name: string
  role_title: string | null
  phone: string | null
  email: string | null
  firm_id: string | null
  firm_name: string | null
  score: number
  match_kind: 'exact_phone' | 'exact_email' | 'exact_name' | 'fuzzy_name'
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10) return null
  // Indian mobile — last 10 digits is the canonical form for matching
  return digits.slice(-10)
}

export async function resolveContact(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
  rawName: string | null | undefined,
  rawPhone: string | null | undefined,
  rawEmail: string | null | undefined
): Promise<ContactCandidate[]> {
  const hits: ContactCandidate[] = []

  // 1) Phone match — normalize to last 10 digits, search anywhere in stored phone
  const phoneNormalized = normalizePhone(rawPhone)
  if (phoneNormalized) {
    const { data } = await supabase
      .from('contact')
      .select('id, full_name, role_title, phone, email, firm_id, firm:firm_id(name)')
      .is('deleted_at', null)
      .ilike('phone', `%${phoneNormalized}%`)
      .limit(3)
    for (const c of data ?? []) {
      const firm = Array.isArray(c.firm) ? c.firm[0] : c.firm
      hits.push({
        id: c.id,
        full_name: c.full_name,
        role_title: c.role_title,
        phone: c.phone,
        email: c.email,
        firm_id: c.firm_id,
        firm_name: (firm as { name: string } | null)?.name ?? null,
        score: 1,
        match_kind: 'exact_phone',
      })
    }
  }

  // 2) Email match
  const email = (rawEmail ?? '').trim().toLowerCase()
  if (email && email.includes('@')) {
    const { data } = await supabase
      .from('contact')
      .select('id, full_name, role_title, phone, email, firm_id, firm:firm_id(name)')
      .is('deleted_at', null)
      .ilike('email', email)
      .limit(3)
    for (const c of data ?? []) {
      const firm = Array.isArray(c.firm) ? c.firm[0] : c.firm
      hits.push({
        id: c.id,
        full_name: c.full_name,
        role_title: c.role_title,
        phone: c.phone,
        email: c.email,
        firm_id: c.firm_id,
        firm_name: (firm as { name: string } | null)?.name ?? null,
        score: 0.95,
        match_kind: 'exact_email',
      })
    }
  }

  // 3) Name fuzzy
  const name = (rawName ?? '').trim()
  if (name.length >= 4) {
    const tokens = name.split(/[\s,/-]+/).filter((t) => t.length >= 3)
    const longest = tokens.sort((a, b) => b.length - a.length)[0]
    if (longest) {
      const { data } = await supabase
        .from('contact')
        .select('id, full_name, role_title, phone, email, firm_id, firm:firm_id(name)')
        .is('deleted_at', null)
        .ilike('full_name', `%${longest}%`)
        .limit(5)
      for (const c of data ?? []) {
        const firm = Array.isArray(c.firm) ? c.firm[0] : c.firm
        const matchedTokens = tokens.filter((t) =>
          c.full_name.toLowerCase().includes(t.toLowerCase())
        ).length
        const score = Math.min(0.8, 0.5 + matchedTokens * 0.1)
        const isExact = c.full_name.toLowerCase() === name.toLowerCase()
        hits.push({
          id: c.id,
          full_name: c.full_name,
          role_title: c.role_title,
          phone: c.phone,
          email: c.email,
          firm_id: c.firm_id,
          firm_name: (firm as { name: string } | null)?.name ?? null,
          score: isExact ? 0.85 : score,
          match_kind: isExact ? 'exact_name' : 'fuzzy_name',
        })
      }
    }
  }

  // Dedupe by id, keep highest score
  const merged = new Map<string, ContactCandidate>()
  for (const h of hits) {
    const ex = merged.get(h.id)
    if (!ex || h.score > ex.score) merged.set(h.id, h)
  }
  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}
