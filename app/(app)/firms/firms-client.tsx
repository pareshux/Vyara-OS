'use client'

import Link from 'next/link'
import { Building2, AlertCircle, Clock, FileText, Folders, CheckCircle2, AlertTriangle, Sparkles, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ListFilter } from '@/components/app/list-filter'

type Health = 'healthy' | 'needs_attention' | 'critical'

const HEALTH_DOT: Record<Health, { dot: string; icon: typeof CheckCircle2; label: string; iconClass: string }> = {
  healthy:          { dot: 'bg-green-500',  icon: CheckCircle2,    label: 'Healthy',          iconClass: 'text-green-600' },
  needs_attention:  { dot: 'bg-amber-500',  icon: AlertTriangle,   label: 'Needs attention',  iconClass: 'text-amber-600' },
  critical:         { dot: 'bg-red-500',    icon: AlertCircle,     label: 'Critical',         iconClass: 'text-red-600'   },
}

function HealthCell({ health, cachedBrief }: { health: Health; cachedBrief?: { headline: string } }) {
  const cfg = HEALTH_DOT[health]
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.iconClass}`}>
        <span className={`size-1.5 rounded-full shrink-0 ${cfg.dot}`} />
        {cfg.label}
      </span>
      {cachedBrief && (
        <span className="flex items-start gap-1 text-[11px] text-muted-foreground leading-snug">
          <Sparkles className="size-2.5 shrink-0 mt-0.5 text-primary/60" />
          {cachedBrief.headline}
        </span>
      )}
    </div>
  )
}

export type FirmSignals = {
  overdue?: { count: number; outstanding: number; days: number }
  stale_quote?: { count: number; days: number }
  stuck_project?: { count: number; days: number }
  stale_lead?: { count: number; days: number }
}

export type FirmRow = {
  id: string
  name: string
  type_code: string
  type_label: string
  city: string | null
  state: string
  phone: string | null
  gstin: string | null
  signals: FirmSignals
  health: 'healthy' | 'needs_attention' | 'critical'
  cachedBrief?: { health: 'healthy' | 'needs_attention' | 'critical'; headline: string }
  active_project_count: number
  pipeline_value: number
  pipeline_count: number
  outstanding: number
  overdue_outstanding: number
  overdue_days: number
  lifetime_value: number
  last_touched_at: string | null
  rep_name: string | null
}

export type RelationshipTypeOption = {
  code: string
  label: string
}

interface Props {
  firms: FirmRow[]
  types: RelationshipTypeOption[]
  cityOptions: { value: string; label: string }[]
  stateOptions: { value: string; label: string }[]
  hasAnySignals: boolean
  totalCount: number
}

function formatINR(v: number): string {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1).replace(/\.0$/, '')}cr`
  if (v >= 100000) return `₹${(v / 100000).toFixed(1).replace(/\.0$/, '')}L`
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}k`
  return `₹${v.toLocaleString('en-IN')}`
}

function lastTouchedLabel(iso: string | null): { label: string; color: string } {
  if (!iso) return { label: '—', color: 'text-muted-foreground/50' }
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days < 1) return { label: 'Today', color: 'text-green-600' }
  if (days < 7) return { label: `${days}d ago`, color: 'text-green-600' }
  if (days < 30) return { label: `${days}d ago`, color: 'text-amber-600' }
  if (days < 90) return { label: `${Math.round(days / 7)}w ago`, color: 'text-red-500' }
  return { label: `${Math.round(days / 30)}mo ago`, color: 'text-red-500' }
}

function SignalChips({ signals }: { signals: FirmSignals }) {
  const chips: React.ReactNode[] = []

  if (signals.overdue) {
    chips.push(
      <span
        key="overdue"
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-50 text-red-700 border border-red-200"
        title={`${signals.overdue.count} overdue invoice${signals.overdue.count > 1 ? 's' : ''}, oldest ${signals.overdue.days}d`}
      >
        <AlertCircle className="size-2.5" />
        {formatINR(signals.overdue.outstanding)} overdue · {signals.overdue.days}d
      </span>
    )
  }

  if (signals.stale_quote) {
    chips.push(
      <span
        key="quote"
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200"
        title={`${signals.stale_quote.count} quote${signals.stale_quote.count > 1 ? 's' : ''} sent, no response for ${signals.stale_quote.days}d`}
      >
        <FileText className="size-2.5" />
        Quote awaiting · {signals.stale_quote.days}d
      </span>
    )
  }

  if (signals.stuck_project) {
    chips.push(
      <span
        key="project"
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-orange-50 text-orange-700 border border-orange-200"
        title={`${signals.stuck_project.count} project${signals.stuck_project.count > 1 ? 's' : ''} not updated in ${signals.stuck_project.days}d`}
      >
        <Folders className="size-2.5" />
        Project stale · {signals.stuck_project.days}d
      </span>
    )
  }

  if (signals.stale_lead) {
    chips.push(
      <span
        key="lead"
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200"
        title={`${signals.stale_lead.count} lead${signals.stale_lead.count > 1 ? 's' : ''} not updated in ${signals.stale_lead.days}d`}
      >
        <Clock className="size-2.5" />
        Lead stale · {signals.stale_lead.days}d
      </span>
    )
  }

  if (chips.length === 0) return null
  return <div className="flex flex-wrap gap-1 mt-1">{chips}</div>
}

export function FirmsClient({
  firms,
  types,
  cityOptions,
  stateOptions,
  hasAnySignals,
  totalCount,
}: Props) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-foreground">Firms</h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          {firms.length < totalCount
            ? `${firms.length} of ${totalCount} firms`
            : `${totalCount} ${totalCount === 1 ? 'firm' : 'firms'} across all relationship types`}
        </p>
      </div>

      <ListFilter
        searchPlaceholder="Search by name, city, phone, or GSTIN…"
        selects={[
          {
            key: 'type',
            label: 'Type',
            placeholder: 'All types',
            options: types.map((t) => ({ value: t.code, label: t.label })),
          },
          ...(cityOptions.length > 1
            ? [{ key: 'city', label: 'City', placeholder: 'All cities', options: cityOptions }]
            : []),
          ...(stateOptions.length > 1
            ? [{ key: 'state', label: 'State', placeholder: 'All states', options: stateOptions }]
            : []),
          ...(hasAnySignals
            ? [{
                key: 'attention',
                label: 'Health',
                placeholder: 'All firms',
                options: [{ value: 'yes', label: 'Needs attention' }],
              }]
            : []),
        ]}
      />

      {totalCount === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <Building2 className="size-8 mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No firms yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Firms are created from leads, projects, contacts, or the business-card scanner.
          </p>
        </div>
      ) : firms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <Building2 className="size-7 mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No matches</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try different filters or clear the search.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground md:table-cell">Last touched</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground lg:table-cell">Projects</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Pipeline</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Outstanding</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Health</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground lg:table-cell">Rep</th>
                <th className="px-4 py-2.5 text-right w-10" />
              </tr>
            </thead>
            <tbody>
              {firms.map((f) => {
                const hasSignal = f.signals.overdue || f.signals.stale_quote || f.signals.stuck_project || f.signals.stale_lead
                const lt = lastTouchedLabel(f.last_touched_at)
                return (
                  <tr
                    key={f.id}
                    className="group border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    {/* Name */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/customers/${f.id}`}
                        className="font-medium text-foreground hover:text-primary inline-flex items-center gap-1.5"
                      >
                        <Building2 className="size-3.5 text-muted-foreground shrink-0" />
                        {f.name}
                      </Link>
                      <div className="sm:hidden mt-0.5">
                        <Badge variant="outline" className="text-xs">{f.type_label}</Badge>
                      </div>
                      {hasSignal && !f.cachedBrief && <SignalChips signals={f.signals} />}
                    </td>

                    {/* Last touched — md+ */}
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className={`text-sm tabular-nums ${lt.color}`}>{lt.label}</span>
                    </td>

                    {/* Projects — lg+ */}
                    <td className="hidden px-4 py-3 lg:table-cell text-sm tabular-nums text-muted-foreground">
                      {f.active_project_count > 0 ? `${f.active_project_count}` : <span className="text-muted-foreground/30">—</span>}
                    </td>

                    {/* Pipeline */}
                    <td className="px-4 py-3">
                      {f.pipeline_value > 0 ? (
                        <div>
                          <p className="text-sm font-medium tabular-nums">{formatINR(f.pipeline_value)}</p>
                          <p className="text-[11px] text-muted-foreground tabular-nums">{f.pipeline_count} open</p>
                        </div>
                      ) : <span className="text-muted-foreground/30">—</span>}
                    </td>

                    {/* Outstanding */}
                    <td className="px-4 py-3">
                      <div>
                        {f.outstanding > 0 ? (
                          <p className={`text-sm font-medium tabular-nums ${f.overdue_outstanding > 0 ? 'text-red-600' : 'text-foreground'}`}>
                            {formatINR(f.outstanding)}
                            {f.overdue_outstanding > 0 && <span className="text-xs ml-1 font-normal">({f.overdue_days}d)</span>}
                          </p>
                        ) : (
                          <p className="text-muted-foreground/30">—</p>
                        )}
                        {f.lifetime_value > 0 && (
                          <p className="text-[11px] text-muted-foreground tabular-nums">{formatINR(f.lifetime_value)} lifetime</p>
                        )}
                      </div>
                    </td>

                    {/* Health */}
                    <td className="px-4 py-3 max-w-xs">
                      <HealthCell health={f.health} cachedBrief={f.cachedBrief} />
                      {hasSignal && f.cachedBrief && <SignalChips signals={f.signals} />}
                    </td>

                    {/* Rep — lg+ */}
                    <td className="hidden px-4 py-3 lg:table-cell">
                      {f.rep_name ? (
                        <span className="text-xs text-muted-foreground">{f.rep_name.split(' ')[0]}</span>
                      ) : <span className="text-muted-foreground/30">—</span>}
                    </td>

                    {/* Arrow */}
                    <td className="px-4 py-3 text-right">
                      <ChevronRight className="size-4 text-muted-foreground/40 group-hover:text-muted-foreground inline-block" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
