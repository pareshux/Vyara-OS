/**
 * Code template renderer.
 *
 * Customer-facing entity codes (quotation number, invoice number,
 * dealer code, etc.) are formatted from templates stored in
 * tenant.settings.codes.* (see settings-schema.ts).
 *
 * Tokens (see schema for the canonical list):
 *   {yyyy}   4-digit year (IST)
 *   {yy}     2-digit year (IST)
 *   {mm}     2-digit month (IST)
 *   {nnnnn}  5-digit zero-padded sequence
 *   {nnnn}   4-digit zero-padded sequence
 *   {nnn}    3-digit zero-padded sequence
 *
 * Date is always IST — auto-numbered codes that span midnight UTC
 * (between 18:30Z and 00:00Z next day) need to reflect the local
 * calendar, not the server's.
 *
 * NOTE: this util produces the FORMATTED string. It does not
 * allocate sequence numbers — that's the caller's job (today via
 * Postgres sequences in module-specific triggers; Sprint 1.7 will
 * unify this).
 */

const TOKEN_REPLACERS: Array<{ re: RegExp; fn: (seq: number, date: Date) => string }> = [
  // Order matters: longer sequence tokens before shorter ones so
  // {nnnnn} doesn't get partially matched by {nnnn}.
  { re: /\{nnnnn\}/g, fn: (n) => n.toString().padStart(5, '0') },
  { re: /\{nnnn\}/g,  fn: (n) => n.toString().padStart(4, '0') },
  { re: /\{nnn\}/g,   fn: (n) => n.toString().padStart(3, '0') },
  // Date tokens.
  { re: /\{yyyy\}/g,  fn: (_, d) => istParts(d).yyyy },
  { re: /\{yy\}/g,    fn: (_, d) => istParts(d).yy },
  { re: /\{mm\}/g,    fn: (_, d) => istParts(d).mm },
]

function istParts(date: Date): { yyyy: string; yy: string; mm: string } {
  // sv-SE locale gives YYYY-MM-DD; we slice the parts out.
  // toLocaleDateString with a numeric timeZone gives the IST calendar.
  const iso = date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' })
  // iso === '2026-06-19' for example
  const [yyyy, mm] = iso.split('-')
  return { yyyy, yy: yyyy.slice(-2), mm }
}

/**
 * Render a code template with the given sequence number and date.
 *
 * Example:
 *   renderCode('VT-QT-{yyyy}-{nnnn}', 42) → 'VT-QT-2026-0042'
 *   renderCode('NT/{yy}/{nnnnn}',     7)  → 'NT/26/00007'
 *
 * @param template — string from tenant.settings.codes.{kind}
 * @param sequenceNumber — the next sequence value the caller allocated
 * @param date — optional, defaults to now. Useful for backfills and
 *               for deterministic tests.
 */
export function renderCode(
  template: string,
  sequenceNumber: number,
  date: Date = new Date(),
): string {
  let out = template
  for (const { re, fn } of TOKEN_REPLACERS) {
    out = out.replace(re, () => fn(sequenceNumber, date))
  }
  return out
}
