/**
 * Observability capture — Blueprint PLAT-009.
 *
 * Single chokepoint for "something went wrong, the world should know."
 * Callers always go through captureError / captureMessage. The
 * implementation today is a structured console log; the swap to
 * Sentry (or Axiom, or any other vendor) is a one-file change in
 * this module — no caller edits.
 *
 * Why not just `console.error(err)`? Because at the call site we
 * have valuable context (tenant_id, user_id, actionName, entity_id,
 * etc.). Stuffing that into the message string is lossy; passing it
 * as a structured second argument keeps it queryable.
 *
 * All payloads (the error message + the context) are run through
 * lib/observability/scrub.ts so phone / email / GSTIN / Aadhaar /
 * PAN are redacted before they leave the process.
 *
 * Sentry swap path (when @sentry/nextjs lands):
 *   1. npm install @sentry/nextjs
 *   2. Create sentry.client.config.ts / sentry.server.config.ts /
 *      sentry.edge.config.ts at repo root (templates in README.md)
 *   3. Replace the body of captureError / captureMessage below to
 *      call Sentry.captureException / Sentry.captureMessage. Keep
 *      the scrub() wrapper.
 *   4. Wrap next.config.ts with withSentryConfig.
 *   5. Point Inngest's onFailure at captureError.
 */
import { scrub } from './scrub'

/** Context attached to every capture call. Free-form, but these
 *  keys are recognised by the swap-to-Sentry path:
 *  - tenant_id, user_id, role         → Sentry user scope
 *  - action_name                       → Sentry transaction name
 *  - entity_type, entity_id            → Sentry tags
 *  - extra                             → Sentry extra payload
 */
export type CaptureContext = {
  tenant_id?: string | null
  user_id?: string | null
  role?: string | null
  action_name?: string
  entity_type?: string
  entity_id?: string | null
  extra?: Record<string, unknown>
}

function envelope(context?: CaptureContext): Record<string, unknown> {
  if (!context) return {}
  const out: Record<string, unknown> = {}
  if (context.tenant_id) out.tenant_id = context.tenant_id
  if (context.user_id) out.user_id = context.user_id
  if (context.role) out.role = context.role
  if (context.action_name) out.action_name = context.action_name
  if (context.entity_type) out.entity_type = context.entity_type
  if (context.entity_id) out.entity_id = context.entity_id
  if (context.extra) out.extra = scrub(context.extra)
  return out
}

/**
 * Capture an exception. Always returns; never re-throws — callers
 * decide whether to bubble or swallow.
 *
 * Example:
 *   try {
 *     return await someAction(args)
 *   } catch (err) {
 *     captureError(err, { action_name: 'checkIn', tenant_id, user_id })
 *     return { error: 'Could not check in. Try again.' }
 *   }
 */
export function captureError(err: unknown, context?: CaptureContext): void {
  const errObj =
    err instanceof Error
      ? { name: err.name, message: scrub(err.message), stack: err.stack }
      : { name: 'NonError', message: scrub(String(err)), stack: null }

  // Today: structured stderr. Tomorrow: Sentry.captureException.
  // Format chosen for grep-ability + machine-parse-ability in logs.
  // eslint-disable-next-line no-console
  console.error(
    '[capture]',
    JSON.stringify({ kind: 'error', error: errObj, ...envelope(context) }),
  )
}

/**
 * Capture a structured message (no exception). Use for important
 * non-error signals you want surfaced — soft anomalies, rate-limit
 * hits, integration drift, etc.
 *
 * Example:
 *   captureMessage('AI extraction parse_failed', {
 *     entity_type: 'ai_extraction',
 *     entity_id: row.id,
 *     extra: { entity_kind: 'invoice_photo', latency_ms },
 *   })
 */
export function captureMessage(
  message: string,
  context?: CaptureContext,
  level: 'info' | 'warn' | 'error' = 'warn',
): void {
  const payload = {
    kind: 'message',
    level,
    message: scrub(message),
    ...envelope(context),
  }
  // eslint-disable-next-line no-console
  if (level === 'error') console.error('[capture]', JSON.stringify(payload))
  else if (level === 'warn') console.warn('[capture]', JSON.stringify(payload))
  else console.info('[capture]', JSON.stringify(payload))
}
