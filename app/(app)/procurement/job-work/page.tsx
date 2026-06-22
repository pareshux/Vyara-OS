/**
 * /procurement/job-work — Job-work challan list (P6 lite).
 *
 * Materials sent out for processing (cutting/coating/assembly) but still
 * owned by us. Quarterly ITC-04 CSV exports all challan + return rows
 * for upload to the GSTN portal.
 */
import Link from 'next/link'
import { listJobWorkChallans, type JobWorkStatus } from '@/lib/actions/job-work'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, Plus, Wrench, FileDown } from 'lucide-react'
import { QuarterlyItc04Button } from './itc04-button'

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
}

const STATUS_META: Record<JobWorkStatus, { label: string; bg: string; text: string }> = {
  sent: { label: 'Sent', bg: 'bg-sky-50', text: 'text-sky-700' },
  partly_received: { label: 'Partly received', bg: 'bg-amber-50', text: 'text-amber-700' },
  fully_received: { label: 'Fully received', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  cancelled: { label: 'Cancelled', bg: 'bg-rose-50', text: 'text-rose-700' },
}

export default async function JobWorkPage(props: { searchParams: Promise<{ status?: string }> }) {
  const params = await props.searchParams
  const statusFilter = params.status as JobWorkStatus | undefined
  const rows = await listJobWorkChallans(statusFilter ? { status: statusFilter } : undefined)

  const totals = rows.reduce(
    (acc, r) => {
      acc.sent += r.qty_sent
      acc.pending += r.qty_pending
      acc.received += r.qty_received_back
      acc.scrap += r.qty_scrap
      return acc
    },
    { sent: 0, pending: 0, received: 0, scrap: 0 }
  )

  return (
    <div className="px-4 py-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/procurement" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-3.5" /> Procurement
          </Link>
          <h1 className="text-2xl font-semibold mt-1 flex items-center gap-2">
            <Wrench className="size-6" /> Job work
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Materials sent out for processing but still on our books. Capture challans; export ITC-04 quarterly.
          </p>
        </div>
        <div className="flex gap-2">
          <QuarterlyItc04Button />
          <Link href="/procurement/job-work/new">
            <Button size="sm" className="gap-1.5"><Plus className="size-4" /> New challan</Button>
          </Link>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Qty sent out</div>
          <div className="text-2xl font-semibold tabular-nums">{totals.sent.toLocaleString('en-IN')}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Pending return</div>
          <div className={`text-2xl font-semibold tabular-nums ${totals.pending > 0 ? 'text-amber-700' : ''}`}>
            {totals.pending.toLocaleString('en-IN')}
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Received back</div>
          <div className="text-2xl font-semibold tabular-nums text-emerald-700">{totals.received.toLocaleString('en-IN')}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Scrap</div>
          <div className={`text-2xl font-semibold tabular-nums ${totals.scrap > 0 ? 'text-rose-700' : ''}`}>
            {totals.scrap.toLocaleString('en-IN')}
          </div>
        </CardContent></Card>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip href="/procurement/job-work" label="All" active={!statusFilter} />
        {(['sent', 'partly_received', 'fully_received', 'cancelled'] as JobWorkStatus[]).map((s) => (
          <FilterChip key={s} href={`/procurement/job-work?status=${s}`} label={STATUS_META[s].label} active={statusFilter === s} />
        ))}
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            <Wrench className="size-8 mx-auto mb-2 opacity-40" />
            No job-work challans {statusFilter ? `with status ${STATUS_META[statusFilter].label.toLowerCase()}` : 'yet'}.
            <div className="mt-3">
              <Link href="/procurement/job-work/new" className="text-primary hover:underline">Create first challan →</Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Challan #</th>
                    <th className="text-left px-3 py-2.5 font-medium">Date</th>
                    <th className="text-left px-3 py-2.5 font-medium">Job worker</th>
                    <th className="text-left px-3 py-2.5 font-medium">Material · Process</th>
                    <th className="text-right px-3 py-2.5 font-medium">Sent</th>
                    <th className="text-right px-3 py-2.5 font-medium">Received</th>
                    <th className="text-right px-3 py-2.5 font-medium">Pending</th>
                    <th className="text-center px-3 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => {
                    const meta = STATUS_META[r.status]
                    return (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <Link href={`/procurement/job-work/${r.id}`} className="font-mono text-xs text-primary hover:underline">
                            {r.challan_number}
                          </Link>
                          {r.expected_return_date && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">due {fmtDate(r.expected_return_date)}</div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs">{fmtDate(r.challan_date)}</td>
                        <td className="px-3 py-3">
                          <div className="font-medium">{r.job_worker_name}</div>
                          {r.job_worker_gstin && <div className="font-mono text-[10px] text-muted-foreground">{r.job_worker_gstin}</div>}
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-sm">{r.description}</div>
                          <div className="text-[10px] text-muted-foreground">{r.process_nature}{r.hsn_code ? ` · HSN ${r.hsn_code}` : ''}</div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.qty_sent.toLocaleString('en-IN')} <span className="text-[10px] text-muted-foreground">{r.unit}</span></td>
                        <td className="px-3 py-3 text-right tabular-nums text-emerald-700">{r.qty_received_back.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {r.qty_pending > 0 ? <span className="text-amber-700">{r.qty_pending.toLocaleString('en-IN')}</span> : <span className="text-muted-foreground/60">0</span>}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 text-[11px] rounded ${meta.bg} ${meta.text}`}>{meta.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function FilterChip({ href, label, active }: { href: string; label: string; active?: boolean }) {
  return (
    <Link href={href} className={`px-3 py-1 text-xs rounded-full border ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}>
      {label}
    </Link>
  )
}
