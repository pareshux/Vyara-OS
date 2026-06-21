/**
 * /owner — Owner Dashboard (Blueprint INT-014).
 *
 * Admin-only executive surface. Sections 1 (Business Health) + 2 (Attention
 * Centre) + AI Owner Brief in Slice 1. Slices 2 (Finance depth) + 3 (Revenue
 * + Ops) + 4 (Field + People) have also shipped. INT-014 is now complete at
 * Slices 1–4; the originally-planned Slice 5 (drill-down filters, saved views,
 * Quick Actions) was dropped — the conversational agent (INT-009) is the
 * stronger drill-down path on this surface (filters force operating the
 * dashboard; chat lets the owner interrogate it). The trimmed brief's action
 * chips (Slice 3.1) cover the Quick-Actions need.
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
import { FinanceAgeing } from './finance-ageing'
import { FinanceDebtors } from './finance-debtors'
import { FinanceCashMovement } from './finance-cash-movement'
import { FinancePtpCoverage } from './finance-ptp-coverage'
import { RevenueFunnel } from './revenue-funnel'
import { WinRate } from './win-rate'
import { TopReps } from './top-reps'
import { Operations } from './operations'
import { FieldToday } from './field-today'
import { TeamRoster } from './team-roster'
import { RepScorecards } from './rep-scorecards'
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

      {/* Section 3: Receivables ageing — Slice 2 (money first) */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Receivables ageing
          </h2>
          <p className="text-xs text-muted-foreground">
            Click a bucket to drill into /collections
          </p>
        </div>
        <FinanceAgeing ageing={overview.ageing} />
      </section>

      {/* Section 4: Top debtors */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Top debtors
          </h2>
          <p className="text-xs text-muted-foreground">
            Open ₹ by firm · click for Customer 360
          </p>
        </div>
        <FinanceDebtors debtors={overview.top_debtors} />
      </section>

      {/* Section 5: Cash movement */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Cash movement
          </h2>
          <p className="text-xs text-muted-foreground">
            Last 30 days · in tracked · out not yet tracked
          </p>
        </div>
        <FinanceCashMovement cash={overview.cash_movement} />
      </section>

      {/* Section 6: PTP coverage */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Promise-to-pay coverage
          </h2>
          <p className="text-xs text-muted-foreground">
            How much overdue ₹ has a promise sitting against it
          </p>
        </div>
        <FinancePtpCoverage ptp={overview.ptp_coverage} />
      </section>

      {/* Section 7: Pipeline funnel — Slice 3 (Revenue + Ops) */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Pipeline funnel
          </h2>
          <p className="text-xs text-muted-foreground">
            Period-coupled · click a stage to drill in
          </p>
        </div>
        <RevenueFunnel funnel={overview.funnel} />
      </section>

      {/* Section 8: Win rate + cycle */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Win rate &amp; cycle
          </h2>
          <p className="text-xs text-muted-foreground">
            Accepted vs rejected · avg days · loss reasons
          </p>
        </div>
        <WinRate win={overview.win_rate} />
      </section>

      {/* Section 9: Top reps */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Top reps
          </h2>
          <p className="text-xs text-muted-foreground">
            Top 5 by closed ₹ in period · win rate per rep
          </p>
        </div>
        <TopReps reps={overview.top_reps} />
      </section>

      {/* Section 10: Operations */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Operations
          </h2>
          <p className="text-xs text-muted-foreground">
            Dispatch volume + cycle · honest gaps for on-time % and stock at risk
          </p>
        </div>
        <Operations ops={overview.operations} />
      </section>

      {/* Section 11: Today's field activity — Slice 4 (Field + People) */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Today&rsquo;s field
          </h2>
          <p className="text-xs text-muted-foreground">
            Point-in-time · who&rsquo;s on, how much activity today
          </p>
        </div>
        <FieldToday today={overview.field_today} />
      </section>

      {/* Section 12: Team roster live */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Team roster
          </h2>
          <p className="text-xs text-muted-foreground">
            One row per field rep · click for the day view
          </p>
        </div>
        <TeamRoster roster={overview.roster} />
      </section>

      {/* Section 13: Rep scorecards (period) */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Rep scorecards
          </h2>
          <p className="text-xs text-muted-foreground">
            Top 5 by visits with outcome · period-coupled
          </p>
        </div>
        <RepScorecards scorecards={overview.rep_scorecards} />
      </section>

      {/* Section 2: Attention Centre — kept last so the owner ends on the
          ranked action list (the "what should I do next?" view). */}
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

      {/* Footer — disclosure on what's not on this surface */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="pt-4 text-sm text-muted-foreground flex flex-col gap-1">
          <p className="font-medium text-foreground">Owner Dashboard &mdash; Slices 1 + 2 + 3 + 4 final.</p>
          <p>
            The originally-planned Slice 5 (drill-down filters · saved views · Quick Actions) was
            dropped &mdash; the conversational agent (INT-009) is the stronger drill-down path on a
            twice-a-day executive surface (chat returns specific answers; filters force operating
            the dashboard). The trimmed brief&rsquo;s action chips (Slice 3.1) cover the Quick-Actions
            need. Several
            <span className="text-foreground"> &ldquo;not tracked yet&rdquo;</span> markers remain across the page &mdash;
            the underlying data (complaints, dispatch SLA, generic firm credit limit, cash outflow,
            safety stock, live GPS, visit attribution) is tracked in the Blueprint
            (CS-001, DEL-007, REL-016, FIN-014, FLD-023, INT-015) and slots in cleanly when those ship.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
