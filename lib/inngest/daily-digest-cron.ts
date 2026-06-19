/**
 * Daily digest cron — runs at 00:30 UTC (06:00 IST) and generates a digest
 * for every active tenant for yesterday's date.
 *
 * Idempotent — the digest table has a UNIQUE(tenant_id, digest_date), and
 * runDigestGeneration() inserts. If the cron fires twice (rare), the second
 * insert fails harmlessly and we log it.
 */
import { inngest } from './client'
import { createClient } from '@supabase/supabase-js'
import { runDigestGeneration } from '@/lib/actions/daily-digest'

type Logger = {
  info: (msg: string, meta?: unknown) => void
  warn: (msg: string, meta?: unknown) => void
  error: (msg: string, meta?: unknown) => void
}

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const dailyDigestCron = inngest.createFunction(
  { id: 'daily-digest-cron', triggers: [{ cron: '30 0 * * *' }] }, // 00:30 UTC = 06:00 IST
  async ({ logger }: { logger: Logger }) => {
    const svc = sb()

    // Compute yesterday in IST
    const now = new Date()
    const istNowMs = now.getTime() + 5.5 * 3600 * 1000
    const istNow = new Date(istNowMs)
    istNow.setUTCDate(istNow.getUTCDate() - 1)
    const date = istNow.toISOString().slice(0, 10)

    const { data: tenants, error } = await svc
      .from('tenant')
      .select('id, name')
      .eq('is_active', true)
    if (error) {
      logger.error('Failed to list tenants', { error })
      return { error: error.message }
    }

    logger.info(`Generating digests for ${tenants?.length ?? 0} tenant(s) for date ${date}`)

    let generated = 0
    let skipped = 0
    const failures: Array<{ tenant_id: string; error: string }> = []

    for (const t of tenants ?? []) {
      // Skip if already generated (idempotent)
      const { data: existing } = await svc
        .from('daily_digest')
        .select('id')
        .eq('tenant_id', t.id)
        .eq('digest_date', date)
        .maybeSingle()
      if (existing) {
        skipped++
        continue
      }

      const result = await runDigestGeneration(svc, t.id, date, null)
      if (!result.ok) {
        logger.warn(`Digest generation failed for tenant ${t.id}`, { error: result.error })
        failures.push({ tenant_id: t.id, error: result.error })
        continue
      }
      generated++
      logger.info(`Generated digest for ${t.name}`, { health_signal: result.digest.health_signal })
    }

    return { date, generated, skipped, failed: failures.length, failures }
  }
)
