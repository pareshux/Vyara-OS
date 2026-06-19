/**
 * Tenant settings — server-side accessors.
 *
 * Wraps the schema-validating parser with a cached DB read so any
 * server component / action gets the typed settings shape in one
 * call. RLS scopes the query to the caller's tenant; no explicit
 * tenant_id filter needed.
 *
 * Kept separate from settings-schema.ts so the Zod schema + types
 * remain importable from client code (the DB import is server-only).
 */
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  parseTenantSettings,
  type TenantSettings,
} from './settings-schema'

/**
 * Fetch and parse the current tenant's settings JSONB.
 * Cached per-render. Falls back to all-defaults if the row is
 * missing or the JSONB is malformed — never throws.
 */
export const getTenantSettings = cache(async (): Promise<TenantSettings> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tenant')
    .select('settings')
    .single()

  const { settings } = parseTenantSettings(data?.settings)
  return settings
})

/** Sugar for the most common access pattern. */
export async function getFieldSettings() {
  return (await getTenantSettings()).field
}

export async function getCodeTemplates() {
  return (await getTenantSettings()).codes
}
