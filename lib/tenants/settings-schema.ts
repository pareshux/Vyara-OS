/**
 * tenant.settings schema — single source of truth for what's
 * allowed inside the JSONB.
 *
 * Today's settings live as a free-for-all JSONB column on `tenant`
 * (see migration 0001). Reads scattered across the codebase assume
 * shapes without validation. This file stops the drift.
 *
 * Stance: LENIENT for now (`.passthrough()` lets unknown keys
 * survive). At Customer #2 onboarding we tighten to `.strict()` and
 * fix any drift in one PR. Until then, parse failures fall back to
 * defaults and log a warning — never break the app.
 *
 * Code templates: stored as data per Sprint 1.2 decision.
 * Tokens supported by lib/tenants/render-code.ts:
 *   {yyyy}   4-digit year (IST)
 *   {yy}     2-digit year (IST)
 *   {mm}     2-digit month (IST)
 *   {nnnnn}  5-digit zero-padded sequence
 *   {nnnn}   4-digit zero-padded sequence
 *   {nnn}    3-digit zero-padded sequence
 *
 * A template must contain at least one {nnn}/{nnnn}/{nnnnn} token,
 * otherwise every generated code would collide. The Zod refinement
 * enforces this.
 */
import { z } from 'zod'

/* ─── Helpers ───────────────────────────────────────────────── */

/** Template must include a sequence placeholder somewhere. */
const codeTemplate = (label: string) =>
  z
    .string()
    .min(3)
    .refine((tpl) => /\{(nnn|nnnn|nnnnn)\}/.test(tpl), {
      message: `${label} template must include {nnn}, {nnnn}, or {nnnnn} for the sequence`,
    })
    .refine(
      (tpl) => {
        // Catch typos in tokens — only known placeholders allowed.
        const tokens = tpl.match(/\{([^}]+)\}/g) ?? []
        const known = new Set(['yyyy', 'yy', 'mm', 'nnnnn', 'nnnn', 'nnn'])
        return tokens.every((t) => known.has(t.slice(1, -1)))
      },
      { message: `${label} template contains an unknown {token}` },
    )

/* ─── Sub-schemas ───────────────────────────────────────────── */

const FieldSettingsSchema = z
  .object({
    auto_approve_threshold_rupees: z.number().nonnegative().default(500),
    working_hours: z
      .object({
        start_ist: z.number().int().min(0).max(23).default(10),
        end_ist:   z.number().int().min(0).max(23).default(18),
      })
      .default({ start_ist: 10, end_ist: 18 }),
    geofence_radius_m: z.number().int().positive().default(100),
    live_tracking_enabled: z.boolean().default(false),
  })
  .passthrough()

const CodeTemplatesSchema = z
  .object({
    quotation:   codeTemplate('quotation').default('VT-QT-{yyyy}-{nnnn}'),
    sales_order: codeTemplate('sales_order').default('VT-SO-{yyyy}-{nnnn}'),
    invoice:     codeTemplate('invoice').default('VT-INV-{yyyy}-{nnnn}'),
    dispatch:    codeTemplate('dispatch').default('VT-DC-{yyyy}-{nnnn}'),
    lead:        codeTemplate('lead').default('VT-LD-{yyyy}-{nnnn}'),
    dealer:      codeTemplate('dealer').default('VT-DLR-{nnnn}'),
  })
  .passthrough()

/* ─── Top-level schema ──────────────────────────────────────── */
// Note: inner defaults populate fields when input is provided. The
// parseTenantSettings() helper below normalizes a possibly-empty
// input into {field:{}, codes:{}} so the inner defaults kick in
// even when raw is null/undefined.

export const TenantSettingsSchema = z
  .object({
    field: FieldSettingsSchema,
    codes: CodeTemplatesSchema,
  })
  .passthrough() // LENIENT — unknown keys preserved during migration phase

export type TenantSettings = z.infer<typeof TenantSettingsSchema>
export type FieldSettings = z.infer<typeof FieldSettingsSchema>
export type CodeTemplates = z.infer<typeof CodeTemplatesSchema>

/* ─── Parser with graceful fallback ─────────────────────────── */

/**
 * Parse a tenant.settings JSONB value into a strongly-typed object.
 *
 * Never throws. On validation failure we log the error and return
 * the all-defaults shape — the app continues to function, the admin
 * gets a console warning, the next deploy can investigate.
 *
 * Returns `parse_warnings` separately so consumers can surface them
 * in admin UI without polluting the typed payload.
 */
export function parseTenantSettings(raw: unknown): {
  settings: TenantSettings
  warnings: string[]
} {
  // Normalize input shape so the inner-field defaults kick in.
  // A null tenant.settings or a partial one (missing 'field' or
  // 'codes' keys) becomes a well-shaped object that the schema can
  // walk and populate defaults for.
  const rawObj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const normalized = {
    field: (rawObj.field ?? {}) as Record<string, unknown>,
    codes: (rawObj.codes ?? {}) as Record<string, unknown>,
    ...rawObj,
  }
  const result = TenantSettingsSchema.safeParse(normalized)
  if (result.success) {
    return { settings: result.data, warnings: [] }
  }

  const warnings = result.error.issues.map(
    (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
  )
  console.warn('[tenant-settings] parse failed, falling back to defaults:', warnings)
  // All-defaults fallback. Parsing {field:{},codes:{}} populates
  // every nested field from their .default() — guaranteed to succeed.
  return {
    settings: TenantSettingsSchema.parse({ field: {}, codes: {} }),
    warnings,
  }
}

/**
 * Validate a partial patch before writing back to tenant.settings.
 * The merge is done by the caller; we just validate the merged
 * result. Throws on validation failure so the caller knows to
 * surface an error to the user (admin form, API consumer).
 */
export function validateTenantSettingsPatch(
  current: TenantSettings,
  patch: Partial<TenantSettings>,
): TenantSettings {
  const merged = {
    ...current,
    ...patch,
    field: { ...current.field, ...(patch.field ?? {}) },
    codes: { ...current.codes, ...(patch.codes ?? {}) },
  }
  return TenantSettingsSchema.parse(merged)
}
