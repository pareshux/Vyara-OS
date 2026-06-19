/**
 * PII scrubbing for observability payloads — Blueprint PLAT-009.
 *
 * Anything destined for an external observability service (Sentry,
 * Axiom, structured logs) goes through scrub() first. Aisensy +
 * WhatsApp payloads contain phone numbers and customer notes;
 * collection dunning messages contain firm names + amounts; voice
 * transcripts contain whatever the rep said aloud. Default deny.
 *
 * Patterns scrubbed (replaced with `<…>` redaction markers):
 *   - Phone numbers (Indian mobile + landline, with/without +91)
 *   - Email addresses
 *   - GSTIN (15-char alphanumeric)
 *   - Aadhaar (12-digit, optional spaces)
 *   - PAN (10-char alphanumeric — letter[5] digit[4] letter)
 *
 * Walked recursively through arrays / objects. Strings are
 * regex-scrubbed; numbers / booleans / nulls pass through. Returns
 * a deep-cloned, PII-stripped copy — never mutates input.
 */

const REDACT_PHONE   = '<phone>'
const REDACT_EMAIL   = '<email>'
const REDACT_GSTIN   = '<gstin>'
const REDACT_AADHAAR = '<aadhaar>'
const REDACT_PAN     = '<pan>'

// Order matters: more-specific patterns first so a GSTIN doesn't
// get partially-matched by a phone-digit regex.
const PATTERNS: Array<{ re: RegExp; replace: string }> = [
  // GSTIN: 15-char alphanumeric (2 digit state + 10 PAN + entity + Z + checksum).
  // Match before any digit-heavy patterns.
  { re: /\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z\d]Z[A-Z\d]\b/g, replace: REDACT_GSTIN },

  // PAN: 5 letters + 4 digits + 1 letter (no spaces).
  { re: /\b[A-Z]{5}\d{4}[A-Z]\b/g, replace: REDACT_PAN },

  // Aadhaar: 12 digits, optional spaces (XXXX XXXX XXXX or XXXXXXXXXXXX).
  { re: /\b\d{4}\s?\d{4}\s?\d{4}\b/g, replace: REDACT_AADHAAR },

  // Email: rfc-ish, intentionally permissive.
  { re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replace: REDACT_EMAIL },

  // Indian mobile with country code: +91-9876543210 / +91 9876543210 / +919876543210.
  { re: /\+?\s?91[-\s]?[6-9]\d{9}\b/g, replace: REDACT_PHONE },

  // Indian mobile without country code: 9876543210 (starts 6/7/8/9).
  { re: /\b[6-9]\d{9}\b/g, replace: REDACT_PHONE },

  // Indian landline with STD code: 011-XXXXXXXX, 022-XXXXXXXX, etc.
  { re: /\b0\d{2,4}[-\s]?\d{6,8}\b/g, replace: REDACT_PHONE },
]

/** Scrub PII from a string. Idempotent. */
export function scrubString(input: string): string {
  let out = input
  for (const { re, replace } of PATTERNS) {
    out = out.replace(re, replace)
  }
  return out
}

/**
 * Deep-walk any value, scrubbing every string node. Arrays + objects
 * recurse; primitives pass through. Returns a new value — never
 * mutates the input.
 *
 * Guard rails for Sentry context payloads:
 *   - Max depth 6 (anything deeper gets summarised as '[deep]')
 *   - Max string length 10_000 (longer gets truncated with marker)
 */
export function scrub<T>(input: T, depth = 0): T {
  if (depth > 6) return '[deep]' as T
  if (input == null) return input
  if (typeof input === 'string') {
    const s = input.length > 10_000 ? input.slice(0, 10_000) + '…[truncated]' : input
    return scrubString(s) as T
  }
  if (typeof input !== 'object') return input
  if (Array.isArray(input)) {
    return input.map((v) => scrub(v, depth + 1)) as T
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    out[k] = scrub(v, depth + 1)
  }
  return out as T
}
