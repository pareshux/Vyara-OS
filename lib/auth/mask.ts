/**
 * Sensitive-column mask helper — Blueprint PLAT-007.
 *
 * Per Constitution §7: certain columns are masked from
 * role='sales_engineer' at the application layer. RLS scopes
 * WHICH rows you can read; this helper scopes WHICH COLUMNS of
 * those rows surface to the client.
 *
 * Why not DB-level column masking? Postgres does not support
 * per-role column visibility cleanly; column-level RLS exists
 * but is brittle and breaks joins. App-layer masking is the
 * pragmatic pattern.
 *
 * Why a helper, not "just remember to do it"? Convention has
 * already failed once (a /* @TODO mask */ comment in one action
 * for a year). A helper turns mask omissions into review-able
 * absence-of-call-site, not invisible-default-pass-through.
 *
 * SENSITIVE table → column mapping (kept in sync with the
 * Constitution; review whenever a column is added that
 * exposes margin, cost, discount, or business valuation):
 *   product        → base_price
 *   quotation      → discount_pct
 *   quotation_line → discount_pct
 *   project        → order_value
 *
 * Limitations (be aware):
 *   1. Shallow only. Nested objects are not walked — if a join
 *      returns { project: { order_value: ... } }, the inner
 *      object must be masked separately. Add walkers later if
 *      we need them.
 *   2. Aggregations are NOT covered. A query like
 *      SUM(base_price) → caller must guard the aggregate at
 *      the action level.
 *   3. The role string is whatever the caller passes — usually
 *      from getActorContext().role. There's no automatic
 *      "current user" lookup; callers wire it explicitly so the
 *      data flow is visible at the call site.
 */

/** Tables → columns to null out for masked roles. */
const SENSITIVE_BY_TABLE: Record<string, readonly string[]> = {
  product:        ['base_price'],
  quotation:      ['discount_pct'],
  quotation_line: ['discount_pct'],
  project:        ['order_value'],
}

/** Roles that see the masked view. Add roles here as they emerge
 *  (e.g. a future 'auditor_external' role). */
const MASKED_ROLES: ReadonlySet<string> = new Set(['sales_engineer'])

/** Pure check — no row work. Useful when an action wants to
 *  branch its query (e.g. skip a join entirely) for masked roles. */
export function isMaskedRole(role: string | null | undefined): boolean {
  return !!role && MASKED_ROLES.has(role)
}

/** Type-preserving row mask. Returns the row unchanged when the
 *  role is unmasked or when the table has no sensitive columns. */
export function maskRow<T>(
  role: string | null | undefined,
  table: string,
  row: T,
): T {
  if (row == null || typeof row !== 'object') return row
  if (!isMaskedRole(role)) return row
  const cols = SENSITIVE_BY_TABLE[table]
  if (!cols || cols.length === 0) return row

  const out = { ...(row as Record<string, unknown>) }
  for (const col of cols) {
    if (col in out) out[col] = null
  }
  return out as T
}

/** Array convenience. Cheap fast-path when nothing's masked. */
export function maskRows<T>(
  role: string | null | undefined,
  table: string,
  rows: T[] | null | undefined,
): T[] {
  if (!rows || rows.length === 0) return rows ?? []
  if (!isMaskedRole(role)) return rows
  const cols = SENSITIVE_BY_TABLE[table]
  if (!cols || cols.length === 0) return rows
  return rows.map((r) => maskRow(role, table, r))
}

/** Diagnostic: which columns would this role have masked on this
 *  table? Used by UI to render "—" with a tooltip explaining why
 *  the field is hidden, instead of an opaque blank. */
export function maskedColumnsFor(
  role: string | null | undefined,
  table: string,
): readonly string[] {
  if (!isMaskedRole(role)) return []
  return SENSITIVE_BY_TABLE[table] ?? []
}

/* ─── Audit helper (for grep / CI) ───────────────────────────────
 *
 * To find code paths that SELECT a sensitive column without going
 * through this helper, run:
 *
 *   grep -rn "select.*order_value\|select.*base_price\|select.*discount_pct" \
 *     app/ lib/actions/ lib/read-models/ | grep -v "maskRow\|maskRows"
 *
 * Each hit is a candidate for wrapping the return value in
 * maskRow/maskRows. The grep is intentionally fuzzy — clean up
 * false positives manually.
 *
 * Usage pattern in server actions:
 *
 *   const ctx = await getActorContext()
 *   const { data: projects } = await ctx.supabase.from('project')
 *     .select('id, name, order_value, ...')
 *   return maskRows(ctx.role, 'project', projects)
 *
 * Usage pattern in pages (Server Components):
 *
 *   const { data: profile } = await supabase
 *     .from('user_profile').select('role').eq('id', user.id).single()
 *   const projects = maskRows(profile?.role, 'project', rawProjects)
 *
 * ───────────────────────────────────────────────────────────── */
