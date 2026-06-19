/**
 * Anthropic SDK wrapper for CRMOS.
 *
 * One model (claude-sonnet-4-6) by default, swappable via CLAUDE_MODEL env var
 * for cost/quality experiments. Hard 25s timeout (the Inngest / Vercel route
 * timeout is well above this), one retry on transient errors handled by the SDK
 * itself.
 *
 * Design choice: NO multi-provider abstraction. Per the AI strategy doc
 * (docs/vyara-ai-strategy-v1.md), we commit to one SDK, one model. If the
 * day comes to swap, we fork this file.
 */
import Anthropic from '@anthropic-ai/sdk'

const DEFAULT_MODEL = 'claude-sonnet-4-6'
const TIMEOUT_MS = 25_000

let cachedClient: Anthropic | null = null

export function getAIClient(): Anthropic {
  if (cachedClient) return cachedClient
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is not configured. Add it to .env.local or your Vercel project env vars.'
    )
  }
  cachedClient = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: TIMEOUT_MS,
    maxRetries: 1,
  })
  return cachedClient
}

export function getModel(): string {
  return process.env.CLAUDE_MODEL ?? DEFAULT_MODEL
}

/**
 * Maps SDK errors to a small set of stable reason strings so callers don't
 * have to know about Anthropic's exception classes. The detail string is
 * surfaced to the user only when safe (e.g. "rate limited, try again in 30s")
 * — never as a raw stack trace.
 */
export type AIErrorReason =
  | 'timeout'
  | 'rate_limited'
  | 'api_error'
  | 'auth_error'
  | 'parse_error'
  | 'refusal'
  | 'unsupported_input'
  | 'unknown'

export type AIErrorDetail = {
  reason: AIErrorReason
  message: string
  // For rate_limited: the retry-after hint from the API, in seconds.
  retry_after_seconds?: number
}

export function mapAnthropicError(err: unknown): AIErrorDetail {
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return { reason: 'timeout', message: 'AI extraction took too long. Try a smaller or sharper photo.' }
  }
  if (err instanceof Anthropic.RateLimitError) {
    const retryHeader = err.headers?.get('retry-after')
    const retry = retryHeader ? Number(retryHeader) : undefined
    return {
      reason: 'rate_limited',
      message: 'AI is busy right now. Please wait a moment and try again.',
      retry_after_seconds: Number.isFinite(retry) ? retry : undefined,
    }
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return { reason: 'auth_error', message: 'AI is not configured. Contact your admin.' }
  }
  if (err instanceof Anthropic.BadRequestError) {
    return { reason: 'unsupported_input', message: 'AI could not read this file. Try a different photo or PDF.' }
  }
  if (err instanceof Anthropic.APIError) {
    return { reason: 'api_error', message: 'AI is temporarily unavailable. Please use manual entry.' }
  }
  if (err instanceof Error) {
    return { reason: 'unknown', message: err.message }
  }
  return { reason: 'unknown', message: String(err) }
}
