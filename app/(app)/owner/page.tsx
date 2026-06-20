/**
 * /owner — Owner Dashboard (Blueprint INT-014).
 *
 * Admin-only executive surface. Sections 1 (Business Health) + 2 (Attention
 * Centre) + AI Owner Brief in Slice 1. Future slices (per Blueprint INT-014):
 *  - Slice 2 — Sections 3 + 4 (Revenue + Operations)
 *  - Slice 3 — Sections 5 + 6 (Finance + Relationships)
 *  - Slice 4 — Sections 7 + 8 (Field Operations + People)
 *  - Slice 5 — Drill-downs, filters, Quick Actions
 *
 * Architectural rule (mirrors customer-360, project-progress, field-day): the
 * page is a dumb consumer of one assembled object. New sections extend the
 * read-model with one query each, never read tables directly here.
 */
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOwnerOverview, type OwnerPeriod } from '@/lib/read-models/owner-overview'
import { OwnerKpiStrip } from './owner-kpi-strip'
import { AttentionCentre } from './attention-centre'
import { OwnerBriefCard, OwnerBriefSkeleton } from './owner-brief-card'
import { PeriodSelector } from './period-selector'
import { Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

const VALID_PERIODS: OwnerPeriod[] = ['today', 'week', 'month', 'quarter', 'year']

function parsePeriod(raw: string | undefined): OwnerPeriod {
  if (raw && (VALID_PERIODS as string[]).includes(raw)) return raw as OwnerPeriod
  return 'month'
}

export default async function OwnerPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('full_name, tenant_id, role')
    .eq('id', user.id)
    .single()

  // Admin-only surface per INT-014 spec. Non-admins bounce back to the
  // general /dashboard which is role-neutral.
  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard')
  }

  const sp = await searchParams
  const period = parsePeriod(sp.period)
  const overview = await getOwnerOverview(period)
  const firstName = (profile.full_name as string | null)?.split(' ')[0] ?? 'there'

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">
              {firstName ? `Good day, ${firstName}` : 'Owner Dashboard'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {overview.tenant_name} · executive view
            </p>
          </div>
        </div>
        <PeriodSelector value={period} />
      </div>

      {/* AI Owner Brief — async, suspended */}
      <Suspense fallback={<OwnerBriefSkeleton />}>
        <OwnerBriefCard />
      </Suspense>

      {/* Section 1: Business Health */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Business health
          </h2>
          <p className="text-xs text-muted-foreground tabular-nums">
            {overview.health.current_range.start_date} → {overview.health.current_range.end_date}
          </p>
        </div>
        <OwnerKpiStrip health={overview.health} />
      </section>

      {/* Section 2: Attention Centre */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Attention centre
          </h2>
          <p className="text-xs text-muted-foreground">
            Ranked by exposure · click any item to drill in
          </p>
        </div>
        <AttentionCentre items={overview.attention} />
      </section>

      {/* Footer — disclosure on what's not in this slice */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="pt-4 text-sm text-muted-foreground flex flex-col gap-1">
          <p className="font-medium text-foreground">Slice 1 of the Owner Dashboard.</p>
          <p>
            Next slices add Revenue + Operations rollups, Finance + Relationships,
            Field + People, and drill-down filters. Three sections show
            <span className="text-foreground"> &ldquo;not tracked yet&rdquo;</span> markers in the Attention Centre — the
            underlying data (complaints, dispatch SLA, generic firm credit limit) is tracked in the Blueprint
            (CS-001, DEL-007, REL-016) and slots in cleanly when those ship.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
