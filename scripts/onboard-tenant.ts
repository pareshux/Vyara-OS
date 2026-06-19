#!/usr/bin/env tsx
/**
 * scripts/onboard-tenant.ts — Tenant provisioning CLI · Blueprint PLAT-011.
 *
 * Replaces the manual "open the Supabase dashboard and write SQL" step
 * from the customer onboarding runbook §3. Reads a JSON config, validates
 * it against a Zod schema, then provisions a tenant in three steps:
 *
 *   1. tenant row (with tenant.settings JSON)
 *   2. tenant_feature rows (one per known capability flag)
 *   3. admin auth user + user_profile row
 *
 * The script is **idempotent on tenant slug**: re-runs UPSERT existing
 * tenant/feature rows but never overwrite an existing tenant.id or
 * existing admin user. Safe to re-run after fixing a typo.
 *
 * Auth: requires SUPABASE_SERVICE_ROLE_KEY in env. Never check this key
 * in. Run locally or in CI with the env injected.
 *
 * Run:
 *
 *   tsx scripts/onboard-tenant.ts ./scripts/onboard-tenant-config.example.json
 *
 * (Once package.json lands an "onboard:tenant" script, the form
 *  becomes `npm run onboard:tenant -- <config-path>`.)
 *
 * Output: structured JSON summary on stdout (tenant_id, feature codes
 * applied, admin user_id). Errors → stderr + non-zero exit.
 */
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

// ─── Config schema ─────────────────────────────────────────────────

/**
 * Mirrors lib/tenants/settings-schema.ts (the runtime Zod schema that
 * validates tenant.settings on read). We re-declare a narrower subset
 * here so the onboarding tooling doesn't import app-internal modules
 * (keeps scripts/ runnable without the full Next.js build context).
 *
 * Keep in lockstep with lib/tenants/settings-schema.ts when adding new
 * tenant-configurable keys.
 */
const CodeTemplate = z
  .string()
  .min(3)
  .refine((tpl) => /\{(nnn|nnnn|nnnnn)\}/.test(tpl), {
    message: 'template must include {nnn}, {nnnn}, or {nnnnn} for sequence',
  })

const TenantSettingsSchema = z
  .object({
    codes: z
      .object({
        quotation:   CodeTemplate.default('VT-QT-{yyyy}-{nnnn}'),
        sales_order: CodeTemplate.default('VT-SO-{yyyy}-{nnnn}'),
        invoice:     CodeTemplate.default('VT-INV-{yyyy}-{nnnn}'),
        dispatch:    CodeTemplate.default('VT-DC-{yyyy}-{nnnn}'),
        lead:        CodeTemplate.default('VT-LD-{yyyy}-{nnnn}'),
        dealer:      CodeTemplate.default('VT-DLR-{nnnn}'),
      })
      .passthrough(),
    field: z
      .object({
        auto_approve_threshold_rupees: z.number().nonnegative().default(500),
        working_hours: z
          .object({
            start_ist: z.number().int().min(0).max(23).default(10),
            end_ist:   z.number().int().min(0).max(23).default(18),
          })
          .default({ start_ist: 10, end_ist: 18 }),
      })
      .passthrough(),
  })
  .passthrough()

const FEATURE_CODES = [
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

const OnboardConfigSchema = z.object({
  tenant: z.object({
    name: z.string().min(2),
    slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'slug must be kebab-case'),
    plan: z.enum(['starter', 'pilot', 'tier1', 'tier2']).default('pilot'),
    settings: TenantSettingsSchema,
  }),
  admin: z.object({
    email: z.string().email(),
    password: z.string().min(12, 'password must be ≥12 chars'),
    full_name: z.string().min(2),
    phone: z.string().nullable().default(null),
  }),
  features: z
    .object(
      FEATURE_CODES.reduce(
        (acc, code) => ({ ...acc, [code]: z.boolean().default(true) }),
        {} as Record<string, z.ZodDefault<z.ZodBoolean>>,
      ),
    )
    .passthrough(),
})

type OnboardConfig = z.infer<typeof OnboardConfigSchema>

// ─── Service-role client ───────────────────────────────────────────

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set')
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ─── Steps ─────────────────────────────────────────────────────────

type ServiceClient = ReturnType<typeof getServiceClient>

async function provisionTenant(supabase: ServiceClient, cfg: OnboardConfig): Promise<{
  tenant_id: string
  created: boolean
}> {
  const { data: existing } = await supabase
    .from('tenant')
    .select('id')
    .eq('slug', cfg.tenant.slug)
    .maybeSingle()

  if (existing) {
    // Update settings + name + plan; don't reassign id.
    const { error } = await supabase
      .from('tenant')
      .update({
        name: cfg.tenant.name,
        plan: cfg.tenant.plan,
        settings: cfg.tenant.settings,
      })
      .eq('id', existing.id)
    if (error) throw new Error(`tenant UPDATE failed: ${error.message}`)
    return { tenant_id: existing.id as string, created: false }
  }

  const { data: created, error } = await supabase
    .from('tenant')
    .insert({
      name: cfg.tenant.name,
      slug: cfg.tenant.slug,
      plan: cfg.tenant.plan,
      settings: cfg.tenant.settings,
    })
    .select('id')
    .single()
  if (error || !created) throw new Error(`tenant INSERT failed: ${error?.message ?? 'no row'}`)
  return { tenant_id: created.id as string, created: true }
}

async function provisionFeatureFlags(
  supabase: ServiceClient,
  tenant_id: string,
  features: Record<string, boolean>,
): Promise<string[]> {
  const rows = Object.entries(features).map(([code, is_enabled]) => ({
    tenant_id,
    code,
    is_enabled,
  }))

  // UPSERT on (tenant_id, code) — the unique index from migration 0028.
  const { error } = await supabase.from('tenant_feature').upsert(rows, {
    onConflict: 'tenant_id,code',
  })
  if (error) throw new Error(`tenant_feature UPSERT failed: ${error.message}`)
  return rows.map((r) => r.code)
}

async function provisionAdminUser(
  supabase: ServiceClient,
  tenant_id: string,
  admin: OnboardConfig['admin'],
): Promise<{ user_id: string; created: boolean }> {
  // 1. Auth user — admin API lets us create with a confirmed email
  //    (skip the verification email; the customer admin gets the
  //    password through us out-of-band).
  let userId: string | null = null
  let createdAuth = false

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: admin.email,
    password: admin.password,
    email_confirm: true,
    user_metadata: { full_name: admin.full_name },
  })

  if (createErr) {
    // User already exists → look them up via the listing API.
    if (/already been registered|already exists/i.test(createErr.message)) {
      const { data: list } = await supabase.auth.admin.listUsers({ perPage: 200 })
      const found = list?.users?.find((u) => u.email?.toLowerCase() === admin.email.toLowerCase())
      if (!found) throw new Error(`admin user exists but listUsers couldn't find by email: ${admin.email}`)
      userId = found.id
    } else {
      throw new Error(`auth.admin.createUser failed: ${createErr.message}`)
    }
  } else {
    userId = created.user.id
    createdAuth = true
  }

  if (!userId) throw new Error('admin user_id not resolved')

  // 2. user_profile row. Upsert so re-runs are safe.
  const { error: profileErr } = await supabase.from('user_profile').upsert(
    {
      id: userId,
      tenant_id,
      role: 'admin',
      full_name: admin.full_name,
      phone: admin.phone ?? null,
      is_active: true,
    },
    { onConflict: 'id' },
  )
  if (profileErr) throw new Error(`user_profile UPSERT failed: ${profileErr.message}`)

  return { user_id: userId, created: createdAuth }
}

// ─── Entry point ───────────────────────────────────────────────────

async function main(): Promise<void> {
  const configPath = process.argv[2]
  if (!configPath) {
    console.error('usage: tsx scripts/onboard-tenant.ts <config.json>')
    process.exit(2)
  }

  const raw = await readFile(configPath, 'utf-8')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    console.error(`config JSON parse failed: ${(err as Error).message}`)
    process.exit(2)
  }

  const result = OnboardConfigSchema.safeParse(parsed)
  if (!result.success) {
    console.error('config validation failed:')
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    }
    process.exit(2)
  }
  const cfg = result.data

  const supabase = getServiceClient()

  // Provision in order. Failures abort with the partial state preserved
  // (script is idempotent — fix the issue, re-run).
  const tenant = await provisionTenant(supabase, cfg)
  const featuresApplied = await provisionFeatureFlags(supabase, tenant.tenant_id, cfg.features)
  const adminUser = await provisionAdminUser(supabase, tenant.tenant_id, cfg.admin)

  const summary = {
    ok: true,
    tenant: {
      id: tenant.tenant_id,
      slug: cfg.tenant.slug,
      action: tenant.created ? 'created' : 'updated',
    },
    features: { count: featuresApplied.length, codes: featuresApplied },
    admin: {
      user_id: adminUser.user_id,
      email: cfg.admin.email,
      action: adminUser.created ? 'created' : 'updated',
    },
  }
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((err) => {
  console.error(`onboard-tenant failed: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
