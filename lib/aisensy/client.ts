/**
 * AiSensy WhatsApp client — Slice 2 dunning channel.
 *
 * Real integration: if AISENSY_API_KEY and AISENSY_API_URL are set, we
 * POST to AiSensy's REST API. Without those env vars (pilot dev mode),
 * we log the payload and return a synthetic message id so the rest of
 * the system (collection_activity rows, timeline, ageing) works end-
 * to-end without external dependencies.
 *
 * Per CLAUDE.md: never silently fail and always log what would have
 * been sent so a reviewer can see the data flow.
 */

export type WhatsAppParams = {
  /** E.164 phone number, e.g. +919876543210 */
  to: string
  /** Template ID configured in AiSensy */
  template: string
  /** Template parameter substitutions */
  params?: Record<string, string | number>
  /** Optional human-readable text fallback used only by the dev stub */
  fallbackText?: string
}

export type WhatsAppResult =
  | { ok: true; messageId: string; mode: 'live' | 'stub' }
  | { ok: false; error: string }

export async function sendWhatsApp(p: WhatsAppParams): Promise<WhatsAppResult> {
  const apiKey = process.env.AISENSY_API_KEY
  const apiUrl = process.env.AISENSY_API_URL ?? 'https://backend.aisensy.com/campaign/t1/api/v2'

  if (!apiKey) {
    // Dev stub mode — log + return mock id
    const mockId = `stub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    console.log('[aisensy:stub] would send WhatsApp', {
      mockId,
      to: p.to,
      template: p.template,
      params: p.params,
      fallback: p.fallbackText,
    })
    return { ok: true, messageId: mockId, mode: 'stub' }
  }

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        campaignName: p.template,
        destination: p.to,
        templateParams: p.params ? Object.values(p.params).map(String) : [],
        source: 'vyara-os',
      }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return { ok: false, error: `AiSensy ${res.status}: ${txt.slice(0, 200)}` }
    }
    const data = (await res.json().catch(() => ({}))) as { messageId?: string; id?: string }
    return { ok: true, messageId: data.messageId ?? data.id ?? `live_${Date.now()}`, mode: 'live' }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'AiSensy call failed'
    return { ok: false, error: msg }
  }
}
