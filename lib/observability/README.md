# `lib/observability` — capture chokepoint for errors + signals

Blueprint **PLAT-009**.

Every "something went wrong" or "this signal matters" call goes through one
of two functions:

```ts
import { captureError, captureMessage } from '@/lib/observability/capture'

captureError(err, {
  action_name: 'field-attendance.checkIn',
  tenant_id, user_id, role,
})

captureMessage('AI extraction parse_failed', {
  entity_type: 'ai_extraction',
  entity_id: row.id,
  extra: { entity_kind: 'invoice_photo', latency_ms },
})
```

All payloads — error messages, stack traces, context fields — are
PII-scrubbed by `scrub.ts` before they leave the process. Phone numbers,
emails, GSTIN, Aadhaar, PAN are redacted automatically.

## What ships today vs what's deferred

| | Today | When `@sentry/nextjs` lands |
|---|---|---|
| Capture functions exist | ✅ | ✅ (unchanged signature) |
| PII scrubbing | ✅ | ✅ (re-used in Sentry `beforeSend`) |
| Server-action wrapper (`withCapture`) | ✅ | ✅ (unchanged) |
| Capture target | structured stderr | Sentry events |
| Source maps | n/a | uploaded on build |
| Tracing | n/a | configurable `tracesSampleRate` |
| Inngest failure handler | n/a | wired to `captureError` |

Callers do not change when the SDK lands. The swap is a one-file edit to
`capture.ts`.

## Sentry swap path (one-time)

1. `npm install --save @sentry/nextjs`
2. Create three config files at repo root:

   ```ts
   // sentry.client.config.ts
   import * as Sentry from '@sentry/nextjs'
   import { scrub } from '@/lib/observability/scrub'

   if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
     Sentry.init({
       dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
       tracesSampleRate: 0.1,
       sendDefaultPii: false,
       beforeSend(event) {
         return scrub(event)
       },
     })
   }
   ```

   `sentry.server.config.ts` and `sentry.edge.config.ts` use the same body.

3. Wrap `next.config.ts`:

   ```ts
   import { withSentryConfig } from '@sentry/nextjs'
   export default withSentryConfig(nextConfig, { silent: true })
   ```

4. Replace the bodies of `captureError` and `captureMessage` in `capture.ts`
   to call `Sentry.captureException` / `Sentry.captureMessage`. Leave the
   `scrub()` wrapping and the context-envelope shape untouched.

5. Add the failure handler to Inngest:

   ```ts
   inngest.createFunction({ id: '...', onFailure: ({ error, event }) =>
     captureError(error, { action_name: event.name }) }, ...)
   ```

6. Env vars:
   - `NEXT_PUBLIC_SENTRY_DSN` — public, set in Vercel
   - `SENTRY_AUTH_TOKEN` — source-map upload, set in Vercel (secret)
   - `SENTRY_ORG`, `SENTRY_PROJECT` — for the upload

The capture call sites added during the no-op phase (e.g. AI extraction
failures) start flowing into Sentry the moment the DSN is set.

## Where it's wired today

- `lib/ai/extract.ts` — AI extraction failures + parse errors (both image
  and text paths).
- More wire-ups land opportunistically as actions are touched. The
  `withCapture` wrapper is preferred for new actions; existing actions
  get wrapped during routine maintenance.
