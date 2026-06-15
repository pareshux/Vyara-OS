import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, AlertCircle, Link2Off } from 'lucide-react'
import { TallyRunButton } from './run-button'

export const dynamic = 'force-dynamic'

export default async function TallySyncPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: logs }, { data: drift }] = await Promise.all([
    supabase
      .from('tally_sync_log')
      .select('id, direction, trigger, status, invoices_pushed, invoices_pulled, receipts_pushed, receipts_pulled, drift_detected, started_at, completed_at, duration_ms, message')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('tally_drift')
      .select('id, entity_type, entity_id, external_id, field, our_value, tally_value, status, created_at, notes')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  // We can't safely check process.env on the client; server reads env at runtime
  const deferred = !process.env.TALLY_URL

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

      <div>
        <h2 className="text-sm font-semibold mb-2">Open drift ({(drift ?? []).filter((d) => d.status === 'open').length})</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {(drift ?? []).length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No drift detected.</p>
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
                {(drift ?? []).map((d) => (
                  <tr key={d.id as string} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 capitalize">{d.entity_type as string}</td>
                    <td className="px-3 py-2 font-mono text-xs">{(d.external_id as string) ?? '—'}</td>
                    <td className="px-3 py-2">{(d.field as string) ?? '(missing locally)'}</td>
                    <td className="px-3 py-2 tabular-nums">{d.our_value != null ? JSON.stringify(d.our_value) : '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{d.tally_value != null ? JSON.stringify(d.tally_value) : '—'}</td>
                    <td className="px-3 py-2">
                      <Badge variant={d.status === 'open' ? 'destructive' : 'secondary'} className="text-xs capitalize">{d.status as string}</Badge>
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

      <div>
        <h2 className="text-sm font-semibold mb-2">Recent sync runs</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {(logs ?? []).length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No runs yet.</p>
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
                {(logs ?? []).map((l) => (
                  <tr key={l.id as string} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 capitalize">{l.direction as string}</td>
                    <td className="px-3 py-2 text-muted-foreground capitalize">{l.trigger as string}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className="text-xs capitalize"
                        style={l.status === 'success' ? { backgroundColor: '#DCFCE7', color: '#15803D' }
                          : l.status === 'failed' ? { backgroundColor: '#FEE2E2', color: '#B91C1C' }
                          : l.status === 'deferred' ? { backgroundColor: '#FEF3C7', color: '#B45309' }
                          : {}}
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
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
