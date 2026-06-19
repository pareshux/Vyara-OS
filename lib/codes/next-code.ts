/**
 * Code allocator — Blueprint PLAT-010.
 *
 * Combines two pieces:
 *   1. The per-entity Postgres sequence (existing — see CREATE
 *      SEQUENCE in migrations 0003/0004/0005/0006/0009/0011/0022).
 *   2. The tenant's code template
 *      (tenant.settings.codes.{kind} via lib/tenants/render-code.ts).
 *
 * Use at every entity-creation call site to fill the code BEFORE
 * insert. The existing per-table triggers stay as a safety net so
 * any call site that doesn't migrate keeps working with the
 * Vyara-default 'VT-' prefix.
 *
 * Example:
 *
 *   import { nextCode } from '@/lib/codes/next-code'
 *
 *   const quotation_number = await nextCode(supabase, 'quotation')
 *   const { data } = await supabase
 *     .from('quotation')
 *     .insert({ quotation_number, ... })
 *
 * If `nextCode` returns null (template missing, RPC error, anything),
 * the caller should fall back to omitting the field — the DB
 * trigger fills the Vyara default. Never block creation on a code
 * allocation failure.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCodeTemplates } from '@/lib/tenants/settings'
import { renderCode } from '@/lib/tenants/render-code'
import { captureError } from '@/lib/observability/capture'
import type { Database } from '@/lib/types/database'

// Kinds the migration 0030 RPC whitelists. Keep in lockstep with
// the CASE branches there + the CodeTemplatesSchema in
// lib/tenants/settings-schema.ts.
export type CodeKind =
  | 'quotation'
  | 'sales_order'
  | 'invoice'
  | 'dispatch'
  | 'dealer'
  | 'lead'
  | 'stock_transfer'

/**
 * Render the next code for the given kind, using the current
 * tenant's template and the global per-kind sequence.
 *
 * Returns null on any failure (RPC missing, template missing,
 * unknown kind). Callers should treat null as "let the DB trigger
 * handle it" — never throw / fail the parent insert.
 */
export async function nextCode(
  supabase: SupabaseClient<Database>,
  kind: CodeKind,
): Promise<string | null> {
  try {
    // 1) Get the template. Falls back to the Vyara default if the
    //    tenant hasn't set anything.
    const templates = await getCodeTemplates()
    // Not all kinds have a template entry today (stock_transfer is
    // covered by the trigger only). Skip cleanly in that case.
    const template = (templates as Record<string, string | undefined>)[kind]
    if (!template) return null

    // 2) Allocate the next sequence value via the RPC.
    //    The RPC raises on unknown kinds — we swallow + null-out so
    //    the DB trigger remains authoritative.
    //    Cast: lib/types/database.ts was generated before migration
    //    0030 introduced next_code_sequence; remove this cast on the
    //    next `supabase gen types` regen (PLAT-008 follow-up).
    const { data: seqValue, error } = await (
      supabase.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: number | null; error: { message: string } | null }>
    )('next_code_sequence', { p_kind: kind })
    if (error || typeof seqValue !== 'number') {
      captureError(error ?? new Error('next_code_sequence returned non-number'), {
        action_name: 'codes.nextCode',
        extra: { kind },
      })
      return null
    }

    // 3) Render the template.
    return renderCode(template, seqValue)
  } catch (err) {
    captureError(err, { action_name: 'codes.nextCode', extra: { kind } })
    return null
  }
}
