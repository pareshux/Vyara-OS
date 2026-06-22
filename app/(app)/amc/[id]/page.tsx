/**
 * /amc/[id] — AMC contract detail page (Phase 7c).
 *
 * Server component. Header + linkage + visit schedule with mark-done
 * actions + cancel-contract action. v2 additions: renewal flow,
 * AMC-tied complaint cross-link, billing schedule wiring.
 */

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cancelAmcContract } from '@/lib/actions/amc'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CalendarClock, CheckCircle2, AlertTriangle, Clock, Building2, UserCircle2, X } from 'lucide-react'
import { AmcVisitDoneSheet, type ContactOption } from './visit-done-sheet'

export const dynamic = 'force-dynamic'

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e', draft: '#94a3b8', expired: '#f97316', renewed: '#60a5fa', cancelled: '#ef4444',
}

function formatINR(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} cr`
  if (n >=    100_000) return `₹${(n /    100_000).toFixed(1)} L`
  return `₹${n.toLocaleString('en-IN')}`
}

const FREQ_LABEL: Record<string, string> = {
  monthly: 'Monthly · 12 visits/year',
  quarterly: 'Quarterly · 4 visits/year',
  bi_annual: 'Bi-annual · 2 visits/year',
  annual: 'Annual · 1 visit/year',
  custom: 'Custom (no auto-schedule)',
}

const VISIT_STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled',
  done: 'Done',
  missed: 'Missed',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled',
}

const VISIT_STATUS_COLOR: Record<string, string> = {
  scheduled: '#94a3b8', done: '#22c55e', missed: '#f97316',
  cancelled: '#ef4444', rescheduled: '#60a5fa',
}

export default async function AmcDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: c, error } = await supabase
    .from('amc_contract')
    .select(`
      id, contract_number, title, scope, status, start_date, end_date, value,
      visit_frequency, visits_per_year, activated_at, cancelled_at, cancellation_reason,
      firm:firm_id(id, name, city, phone),
      project:project_id(id, name)
    `)
    .eq('id', id)
    .single()
  if (error || !c) notFound()

  const pick = <T,>(v: T | T[] | null | undefined): T | null => Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
  const firm = pick(c.firm) as { id: string; name: string; city: string | null; phone: string | null } | null
  const project = pick(c.project) as { id: string; name: string } | null

  const { data: visits } = await supabase
    .from('amc_visit_schedule')
    .select(`
      id, visit_number, scheduled_date, status, done_at, done_by, notes,
      done_by_user:done_by(full_name),
      confirmed_by_contact_id, confirmed_by:confirmed_by_contact_id(full_name, role_title)
    `)
    .eq('amc_contract_id', id)
    .order('visit_number')

  // Customer contacts for the sign-off dropdown
  const contactOptions: ContactOption[] = []
  if (firm) {
    const { data: contacts } = await supabase
      .from('contact')
      .select('id, full_name, role_title')
      .eq('firm_id', firm.id)
      .is('deleted_at', null)
      .order('full_name')
    contacts?.forEach((c) => contactOptions.push({
      id: c.id as string,
      full_name: c.full_name as string,
      role_title: (c.role_title as string | null) ?? null,
    }))
  }

  // AMC-linked complaints (Phase 4 added the FK)
  const { data: linkedComplaints } = await supabase
    .from('complaint')
    .select('id, complaint_number, title, current_stage_id, stage:current_stage_id(label, is_open)')
    .eq('amc_contract_id', id)
    .order('logged_at', { ascending: false })
    .limit(5)

  const today = new Date().toISOString().slice(0, 10)
  const daysToExpiry = Math.round((new Date(c.end_date).getTime() - new Date(today).getTime()) / 86400000)
  const isActive = c.status === 'active'

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex size-12 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 shrink-0">
          <CalendarClock className="size-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-xs text-muted-foreground">{c.contract_number}</div>
          <h1 className="text-lg font-semibold leading-tight">{c.title}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="outline" style={{ borderColor: STATUS_COLORS[c.status], color: STATUS_COLORS[c.status] }}>
              {c.status}
            </Badge>
            <Badge variant="outline" className="text-xs">{FREQ_LABEL[c.visit_frequency] ?? c.visit_frequency}</Badge>
            <Badge variant="outline" className="text-xs font-medium">{formatINR(c.value)}</Badge>
          </div>
        </div>
      </div>

      {c.scope && (
        <Card><CardContent className="pt-6 text-sm leading-relaxed whitespace-pre-wrap">{c.scope}</CardContent></Card>
      )}

      {/* Linkage + dates */}
      <Card>
        <CardContent className="pt-6 grid md:grid-cols-2 gap-4 text-sm">
          {firm && (
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Customer</div>
              <a href={`/customers/${firm.id}`} className="flex items-center gap-2 hover:underline">
                <Building2 className="size-4 text-muted-foreground" />
                <span className="font-medium">{firm.name}</span>
              </a>
              {firm.city && <p className="text-xs text-muted-foreground mt-0.5">{firm.city}{firm.phone ? ` · ${firm.phone}` : ''}</p>}
            </div>
          )}
          {project && (
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Related project</div>
              <a href={`/projects/${project.id}`} className="font-medium hover:underline text-sm">{project.name}</a>
            </div>
          )}
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Period</div>
            <div className="text-sm tabular-nums">
              {new Date(c.start_date).toLocaleDateString('en-IN')} → {new Date(c.end_date).toLocaleDateString('en-IN')}
            </div>
            {isActive && (
              <p className={`text-xs tabular-nums mt-0.5 ${daysToExpiry < 30 ? 'text-orange-700' : daysToExpiry < 60 ? 'text-amber-700' : 'text-muted-foreground'}`}>
                {daysToExpiry >= 0 ? `${daysToExpiry} days remaining` : `Expired ${Math.abs(daysToExpiry)} days ago`}
              </p>
            )}
          </div>
          {c.activated_at && (
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Activated</div>
              <div className="text-sm tabular-nums">{new Date(c.activated_at).toLocaleString('en-IN')}</div>
            </div>
          )}
          {c.cancelled_at && (
            <div className="md:col-span-2">
              <div className="text-xs text-destructive uppercase tracking-wide mb-1">Cancelled {new Date(c.cancelled_at).toLocaleDateString('en-IN')}</div>
              {c.cancellation_reason && <p className="text-sm">{c.cancellation_reason}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visit schedule */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Visit schedule</h2>
          {visits && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {visits.filter((v) => v.status === 'done').length} / {visits.length} done
            </p>
          )}
        </div>
        <Card>
          <CardContent className="pt-6">
            {(!visits || visits.length === 0) ? (
              <p className="text-sm text-muted-foreground">No visits scheduled. (Custom-frequency contract without explicit visit dates.)</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {visits.map((v) => {
                  const overdue = v.status === 'scheduled' && v.scheduled_date < today
                  const doneBy = pick(v.done_by_user as { full_name: string } | { full_name: string }[] | null)
                  const confirmedBy = pick(v.confirmed_by as { full_name: string; role_title: string | null } | { full_name: string; role_title: string | null }[] | null)
                  return (
                    <li key={v.id} className="py-3 flex items-start gap-3 flex-wrap">
                      <span className="text-xs text-muted-foreground tabular-nums w-12 pt-0.5">#{v.visit_number}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium tabular-nums">{new Date(v.scheduled_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          <Badge variant="outline" className="text-xs"
                            style={{ borderColor: VISIT_STATUS_COLOR[v.status] ?? '#94a3b8', color: VISIT_STATUS_COLOR[v.status] ?? '#94a3b8' }}>
                            {VISIT_STATUS_LABEL[v.status] ?? v.status}
                          </Badge>
                          {overdue && (
                            <Badge variant="outline" className="text-xs text-orange-700 border-orange-300">
                              <AlertTriangle className="size-3 mr-1" />
                              Overdue {Math.abs(Math.round((new Date(v.scheduled_date).getTime() - new Date(today).getTime()) / 86400000))}d
                            </Badge>
                          )}
                        </div>

                        {/* Completed-visit detail block */}
                        {v.status === 'done' && (
                          <div className="mt-2 rounded-md border border-border bg-emerald-50/30 px-3 py-2 flex flex-col gap-1.5">
                            {v.notes && (
                              <p className="text-sm whitespace-pre-wrap leading-relaxed">{v.notes}</p>
                            )}
                            <div className="flex items-center gap-4 flex-wrap text-[11px] text-muted-foreground tabular-nums">
                              {v.done_at && doneBy && (
                                <span className="inline-flex items-center gap-1">
                                  <CheckCircle2 className="size-3 text-emerald-600" />
                                  Done {new Date(v.done_at).toLocaleDateString('en-IN')} by <span className="text-foreground font-medium">{doneBy.full_name}</span>
                                </span>
                              )}
                              {confirmedBy && (
                                <span className="inline-flex items-center gap-1">
                                  <UserCircle2 className="size-3" />
                                  Confirmed by <span className="text-foreground font-medium">{confirmedBy.full_name}</span>
                                  {confirmedBy.role_title && <span> ({confirmedBy.role_title})</span>}
                                </span>
                              )}
                              {!confirmedBy && (
                                <span className="italic">No customer sign-off captured</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      {v.status === 'scheduled' && isActive && (
                        <AmcVisitDoneSheet
                          visitId={v.id as string}
                          visitNumber={v.visit_number as number}
                          scheduledDate={v.scheduled_date as string}
                          contacts={contactOptions}
                        />
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Linked complaints */}
      {linkedComplaints && linkedComplaints.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Complaints under this AMC</h2>
          <Card>
            <CardContent className="pt-6 flex flex-col gap-2">
              {linkedComplaints.map((cmp) => {
                const stage = pick(cmp.stage as { label: string; is_open: boolean } | { label: string; is_open: boolean }[] | null)
                return (
                  <a key={cmp.id} href={`/complaints/${cmp.id}`} className="flex items-center gap-3 hover:bg-surface-muted rounded px-2 py-1.5">
                    <span className="font-mono text-xs text-muted-foreground">{cmp.complaint_number}</span>
                    <span className="text-sm flex-1 truncate">{cmp.title}</span>
                    {stage && (
                      <Badge variant={stage.is_open ? 'default' : 'secondary'} className="text-xs">{stage.label}</Badge>
                    )}
                  </a>
                )
              })}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Danger zone */}
      {isActive && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Danger zone</h2>
          <Card className="border-destructive/30">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-3">
                Cancelling an AMC contract is final. All scheduled (not-yet-done) visits cascade to <code>cancelled</code> status.
                Use only when the customer terminates the contract or it was created in error.
              </p>
              <form
                action={async (fd: FormData) => {
                  'use server'
                  const reason = (fd.get('reason') as string | null)?.trim() ?? ''
                  if (!reason) return
                  await cancelAmcContract({ contract_id: id, reason })
                }}
                className="flex items-end gap-2 flex-wrap"
              >
                <div className="flex-1 min-w-64">
                  <label className="text-xs text-muted-foreground block mb-1">Reason (required)</label>
                  <Input name="reason" placeholder="Customer terminated · created in error · superseded by RA-AMC-NNNN" required />
                </div>
                <Button type="submit" variant="ghost" className="text-destructive hover:bg-destructive/10">
                  <X className="size-4 mr-1" />
                  Cancel contract
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  )
}
