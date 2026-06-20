import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, AlertCircle, Link2Off } from 'lucide-react'
import { TallyRunButton } from './run-button'
import { ListFilter } from '@/components/app/list-filter'

export const dynamic = 'force-dynamic'

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  success:  { bg: '#DCFCE7', color: '#15803D' },
  failed:   { bg: '#FEE2E2', color: '#B91C1C' },
  deferred: { bg: '#FEF3C7', color: '#B45309' },
  running:  { bg: '#DBEAFE', color: '#1D4ED8' },
}

export default async function TallySyncPage({
  searchParams,
}: {
  searchParams: Promise<{ drift_status?: string; drift_entity?: string; log_status?: string; log_direction?: string; log_trigger?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const driftStatusFilter = sp.drift_status ?? null
  const driftEntityFilter = sp.drift_entity ?? null
  const logStatusFilter = sp.log_status ?? null
  const logDirectionFilter = sp.log_direction ?? null
  const logTriggerFilter = sp.log_trigger ?? null

  const [{ data: logs }, { data: allDrift }] = await Promise.all([
    supabase
      .from('tally_sync_log')
      .select('id, direction, trigger, status, invoices_pushed, invoices_pulled, receipts_pushed, receipts_pulled, drift_detected, started_at, completed_at, duration_ms, message')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('tally_drift')
      .select('id, entity_type, entity_id, external_id, field, our_value, tally_value, status, created_at, notes')
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  const deferred = !process.env.TALLY_URL

  // Derive filter options from data
  const driftStatuses = [...new Set((allDrift ?? []).map((d) => d.status as string))]
  const driftEntities = [...new Set((allDrift ?? []).map((d) => d.entity_type as string))]
  const logStatuses = [...new Set((logs ?? []).map((l) => l.status as string))]
  const logDirections = [...new Set((logs ?? []).map((l) => l.direction as string).filter(Boolean))]
  const logTriggers = [...new Set((logs ?? []).map((l) => l.trigger as string).filter(Boolean))]

  // Apply drift filters
  let drift = allDrift ?? []
  if (driftStatusFilter) drift = drift.filter((d) => d.status === driftStatusFilter)
  if (driftEntityFilter) drift = drift.filter((d) => d.entity_type === driftEntityFilter)

  // Apply log filters
  let filteredLogs = logs ?? []
  if (logStatusFilter) filteredLogs = filteredLogs.filter((l) => l.status === logStatusFilter)
  if (logDirectionFilter) filteredLogs = filteredLogs.filter((l) => l.direction === logDirectionFilter)
  if (logTriggerFilter) filteredLogs = filteredLogs.filter((l) => l.trigger === logTriggerFilter)

  const openDriftCount = (allDrift ?? []).filter((d) => d.status === 'open').length

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/finance" className="hover:text-foreground">Finance</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">Tally sync</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Tally reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            Two-way sync + drift detection between Vyara OS and Tally.
            {deferred && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs bg-amber-50 text-amber-700">
                <Link2Off className="size-3" /> Deferred — TALLY_URL not configured
              </span>
            )}
          </p>
        </div>
        <TallyRunButton />
      </div>

      {deferred && (
        <Card>
          <CardContent className="pt-4 flex gap-3">
            <AlertCircle className="size-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1 text-sm">
              <p className="font-medium">Tally connector is in deferred mode.</p>
              <p className="text-muted-foreground">
                Manual / CSV import remains the source of truth. Reconciliation
                runs are still logged so the operator history is preserved.
                When TALLY_URL + TALLY_API_KEY are set in the environment, the
                next run pulls vouchers and populates the drift table below.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Drift table ─────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold">
            Drift
            <span className="ml-2 text-muted-foreground font-normal tabular-nums">
              {drift.length}{drift.length < (allDrift ?? []).length ? ` of ${(allDrift ?? []).length}` : ''} · {openDriftCount} open
            </span>
          </h2>
        </div>

        {driftStatuses.length > 0 && (
          <ListFilter
            searchKey="drift_status"
            searchPlaceholder=""
            selects={[
              {
                key: 'drift_status',
                label: 'Status',
                placeholder: 'All statuses',
                options: driftStatuses.map((s) => ({ value: s, label: capitalize(s) })),
              },
              ...(driftEntities.length > 1
                ? [{
                    key: 'drift_entity',
                    label: 'Entity',
                    placeholder: 'All entity types',
                    options: driftEntities.map((e) => ({ value: e, label: capitalize(e) })),
                  }]
                : []),
            ]}
          />
        )}

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {drift.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {driftStatusFilter || driftEntityFilter ? 'No drift matches the filters.' : 'No drift detected.'}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Entity</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">External</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Field</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Ours</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tally</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Detected</th>
                </tr>
              </thead>
              <tbody>
                {drift.map((d) => (
                  <tr key={d.id as string} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 capitalize">{d.entity_type as string}</td>
                    <td className="px-3 py-2 font-mono text-xs">{(d.external_id as string) ?? '—'}</td>
                    <td className="px-3 py-2">{(d.field as string) ?? '(missing locally)'}</td>
                    <td className="px-3 py-2 tabular-nums">{d.our_value != null ? JSON.stringify(d.our_value) : '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{d.tally_value != null ? JSON.stringify(d.tally_value) : '—'}</td>
                    <td className="px-3 py-2">
                      <Badge variant={d.status === 'open' ? 'destructive' : 'secondary'} className="text-xs capitalize">
                        {d.status as string}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums text-xs">
                      {new Date(d.created_at as string).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Sync log table ───────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold">
            Sync runs
            <span className="ml-2 text-muted-foreground font-normal tabular-nums">
              {filteredLogs.length}{filteredLogs.length < (logs ?? []).length ? ` of ${(logs ?? []).length}` : ''}
            </span>
          </h2>
        </div>

        {(logStatuses.length > 1 || logDirections.length > 1 || logTriggers.length > 1) && (
          <ListFilter
            searchKey="log_status"
            searchPlaceholder=""
            selects={[
              ...(logStatuses.length > 1
                ? [{ key: 'log_status', label: 'Status', placeholder: 'All statuses', options: logStatuses.map((s) => ({ value: s, label: capitalize(s) })) }]
                : []),
              ...(logDirections.length > 1
                ? [{ key: 'log_direction', label: 'Direction', placeholder: 'All directions', options: logDirections.map((d) => ({ value: d, label: capitalize(d) })) }]
                : []),
              ...(logTriggers.length > 1
                ? [{ key: 'log_trigger', label: 'Trigger', placeholder: 'All triggers', options: logTriggers.map((t) => ({ value: t, label: capitalize(t) })) }]
                : []),
            ]}
          />
        )}

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {filteredLogs.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {logStatusFilter ? 'No runs match the filter.' : 'No runs yet.'}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Direction</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Trigger</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Inv pulled</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Recpt pulled</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Drift</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Took</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">When</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((l) => {
                  const style = STATUS_STYLES[l.status as string] ?? {}
                  return (
                    <tr key={l.id as string} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 capitalize">{l.direction as string}</td>
                      <td className="px-3 py-2 text-muted-foreground capitalize">{l.trigger as string}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className="text-xs capitalize border-0"
                          style={style}
                        >
                          {l.status as string}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.invoices_pulled as number}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.receipts_pulled as number}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.drift_detected as number}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {(l.duration_ms as number) ?? 0}ms
                      </td>
                      <td className="px-3 py-2 text-muted-foreground tabular-nums text-xs">
                        {new Date(l.started_at as string).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
