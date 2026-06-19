/**
 * Tenant feature flags — server-side helpers.
 *
 * Two patterns this enables:
 *   1. Conditional rendering: <MaybeRender code="enable_field_sales">
 *   2. Conditional logic in actions: `if (!await isFeatureEnabled('enable_tally_sync')) ...`
 *
 * Semantics (must match 0028_tenant_features.sql):
 *   - Absence of a row → use FEATURE_DEFAULTS[code]. Default for known
 *     codes is `true` so an un-configured tenant gets all features
 *     (backwards-compat with the existing Vyara tenant).
 *   - Row present with is_enabled=false → explicitly OFF for this tenant.
 *
 * Cached per-request via React's cache() so multiple consumers in a
 * single render share one DB hit.
 */
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/* ─── Code registry ─────────────────────────────────────────── */
// Add new codes here as modules / capabilities go behind flags.
// Defaults to `true` unless a module is genuinely opt-in.

export const FEATURE_CODES = [
  'enable_field_sales',
  'enable_dealer_portal',
  'enable_collections',
  'enable_tally_sync',
  'enable_ai_surfaces',
  'enable_inventory',
  'enable_warehouse',
  'enable_dispatches',
  'enable_finance',
  'enable_daily_digest',
] as const

export type FeatureCode = (typeof FEATURE_CODES)[number]

const FEATURE_DEFAULTS: Record<FeatureCode, boolean> = {
  enable_field_sales:   true,
  enable_dealer_portal: true,
  enable_collections:   true,
  enable_tally_sync:    true,
  enable_ai_surfaces:   true,
  enable_inventory:     true,
  enable_warehouse:     true,
  enable_dispatches:    true,
  enable_finance:       true,
  enable_daily_digest:  true,
}

/* ─── Public API ────────────────────────────────────────────── */

export type FeatureState = {
  is_enabled: boolean
  config: Record<string, unknown>
}

export type TenantFeatureMap = Record<FeatureCode, FeatureState>

/**
 * Fetch all feature rows for the current tenant in one round-trip.
 * Cached per-render via React's cache() so multiple consumers in a
 * single render share one DB hit. Returns a fully-populated map —
 * any code without a row falls back to FEATURE_DEFAULTS.
 *
 * RLS scopes the query to the caller's tenant; no explicit tenant_id
 * filter needed (and adding one would just duplicate the policy).
 */
export const getTenantFeatures = cache(async (): Promise<TenantFeatureMap> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tenant_feature')
    .select('code, is_enabled, config')

  // Start from defaults; fill from DB rows.
  const map = {} as TenantFeatureMap
  for (const code of FEATURE_CODES) {
    map[code] = { is_enabled: FEATURE_DEFAULTS[code], config: {} }
  }

  if (error || !data) return map

  for (const row of data) {
    const code = row.code as FeatureCode
    if (!FEATURE_CODES.includes(code)) continue  // unknown code in DB — ignore safely
    map[code] = {
      is_enabled: !!row.is_enabled,
      config: (row.config as Record<string, unknown>) ?? {},
    }
  }
  return map
})

/** Convenience: just the boolean. */
export async function isFeatureEnabled(code: FeatureCode): Promise<boolean> {
  const features = await getTenantFeatures()
  return features[code].is_enabled
}

/** Convenience: just the config bag (often used with isFeatureEnabled). */
export async function getFeatureConfig(code: FeatureCode): Promise<Record<string, unknown>> {
  const features = await getTenantFeatures()
  return features[code].config
}

/**
 * Server Component pattern — pass a slice of features down to client
 * components. Avoids sending the full map (small leak of which codes
 * exist) and keeps client props lean.
 */
export async function pickFeatures<T extends FeatureCode>(
  codes: readonly T[],
): Promise<Record<T, boolean>> {
  const features = await getTenantFeatures()
  const out = {} as Record<T, boolean>
  for (const code of codes) out[code] = features[code].is_enabled
  return out
}
