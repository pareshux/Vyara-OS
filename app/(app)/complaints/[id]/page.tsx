/**
 * /complaints/[id] — CS-001 detail page (Raj demo Phase 3 minimal).
 *
 * Server component. Renders header card + classification + linkage +
 * resolution + history. Stage-advance affordances wired via server-action
 * forms (advanceComplaintStage / closeComplaint / rejectComplaint).
 *
 * v2 additions: comments thread, attachment upload, assignment picker UI,
 * mobile field-engineer surface, related-complaint cards, AI-classifier
 * suggestion ribbon. v1 keeps it clean.
 */

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { advanceComplaintStage, closeComplaint, rejectComplaint } from '@/lib/actions/complaints'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LifeBuoy, AlertCircle, Clock, UserCircle2, Building2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ComplaintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: c, error } = await supabase
    .from('complaint')
    .select(`
      id, complaint_number, title, description,
      logged_at, triaged_at, assigned_at, resolved_at, closed_at,
      resolution_notes, root_cause,
      firm:firm_id(id, name, city, phone),
      reported_by:reported_by_contact_id(full_name, phone),
      project:project_id(id, name),
      sales_order:sales_order_id(id, order_number),
      type:type_id(label),
      severity:severity_id(label, color, rank),
      stage:current_stage_id(label, color, stage_key, is_open),
      assignee:assignee_id(id, full_name)
    `)
    .eq('id', id)
    .single()
  if (error || !c) notFound()

  const pick = <T,>(v: T | T[] | null | undefined): T | null => Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
  const firm     = pick(c.firm) as { id: string; name: string; city: string | null; phone: string | null } | null
  const reporter = pick(c.reported_by) as { full_name: string; phone: string | null } | null
  const project  = pick(c.project) as { id: string; name: string } | null
  const order    = pick(c.sales_order) as { id: string; order_number: string } | null
  const type     = pick(c.type) as { label: string } | null
  const severity = pick(c.severity) as { label: string; color: string; rank: number } | null
  const stage    = pick(c.stage) as { label: string; color: string; stage_key: string; is_open: boolean } | null
  const assignee = pick(c.assignee) as { id: string; full_name: string } | null

  // Stage history (latest first)
  const { data: history } = await supabase
    .from('complaint_stage_history')
    .select('id, from_stage_id, to_stage_id, remark, created_at, from_stage:from_stage_id(label), to_stage:to_stage_id(label)')
    .eq('complaint_id', id)
    .order('created_at', { ascending: false })

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex size-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700 shrink-0">
          <LifeBuoy className="size-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-xs text-muted-foreground">{c.complaint_number}</div>
          <h1 className="text-lg font-semibold leading-tight">{c.title}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {severity && (
              <Badge variant="outline" className="text-xs font-medium"
                style={{ borderColor: severity.color, color: severity.color, backgroundColor: `${severity.color}11` }}>
                <AlertCircle className="size-3 mr-1" />
                {severity.label}
              </Badge>
            )}
            {stage && (
              <Badge variant="secondary" className="text-xs"
                style={{ borderColor: stage.color, color: stage.color }}>
                {stage.label}
              </Badge>
            )}
            {type && <Badge variant="outline" className="text-xs">{type.label}</Badge>}
          </div>
        </div>
      </div>

      {/* Description */}
      {c.description && (
        <Card>
          <CardContent className="pt-6 text-sm leading-relaxed whitespace-pre-wrap">{c.description}</CardContent>
        </Card>
      )}

      {/* Linkage card */}
      <Card>
        <CardContent className="pt-6 grid md:grid-cols-2 gap-4 text-sm">
          {firm && (
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Customer</div>
              <div className="flex items-center gap-2">
                <Building2 className="size-4 text-muted-foreground" />
                <a href={`/customers/${firm.id}`} className="font-medium hover:underline">{firm.name}</a>
              </div>
              {firm.city && <div className="text-xs text-muted-foreground mt-0.5">{firm.city}{firm.phone ? ` · ${firm.phone}` : ''}</div>}
            </div>
          )}
          {reporter && (
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Reported by</div>
              <div className="flex items-center gap-2">
                <UserCircle2 className="size-4 text-muted-foreground" />
                <span className="font-medium">{reporter.full_name}</span>
              </div>
              {reporter.phone && <div className="text-xs text-muted-foreground mt-0.5">{reporter.phone}</div>}
            </div>
          )}
          {project && (
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Related project</div>
              <a href={`/projects/${project.id}`} className="font-medium hover:underline text-sm">{project.name}</a>
            </div>
          )}
          {order && (
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Related order</div>
              <a href={`/orders/${order.id}`} className="font-mono text-sm hover:underline">{order.order_number}</a>
            </div>
          )}
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Assignee</div>
            <div className="flex items-center gap-2">
              {assignee ? (
                <>
                  <UserCircle2 className="size-4 text-muted-foreground" />
                  <span className="font-medium">{assignee.full_name}</span>
                </>
              ) : (
                <Badge variant="outline" className="text-orange-700 border-orange-300 text-xs">Unassigned</Badge>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Logged</div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="size-4 text-muted-foreground" />
              <span className="tabular-nums">{new Date(c.logged_at).toLocaleString('en-IN')}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resolution card (only when set) */}
      {c.resolution_notes && (
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="pt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-2">Resolution</h3>
            <p className="text-sm whitespace-pre-wrap mb-3">{c.resolution_notes}</p>
            {c.root_cause && (
              <>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-3 mb-1">Root cause</h4>
                <p className="text-sm">{c.root_cause}</p>
              </>
            )}
            {c.resolved_at && (
              <p className="text-xs text-muted-foreground mt-3">
                Resolved {new Date(c.resolved_at).toLocaleString('en-IN')}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stage advance actions */}
      {stage?.is_open && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Advance state</h2>
          <Card>
            <CardContent className="pt-6 flex flex-wrap gap-2">
              {stage.stage_key === 'logged' && (
                <form action={async () => { 'use server'; await advanceComplaintStage({ complaint_id: id, to_stage_key: 'triaged' }) }}>
                  <Button type="submit" variant="outline" size="sm">Mark triaged →</Button>
                </form>
              )}
              {(stage.stage_key === 'triaged' || stage.stage_key === 'logged') && assignee && (
                <form action={async () => { 'use server'; await advanceComplaintStage({ complaint_id: id, to_stage_key: 'in_progress' }) }}>
                  <Button type="submit" variant="outline" size="sm">Start work →</Button>
                </form>
              )}
              {stage.stage_key === 'in_progress' && c.resolution_notes && (
                <form action={async () => { 'use server'; await advanceComplaintStage({ complaint_id: id, to_stage_key: 'resolved' }) }}>
                  <Button type="submit" variant="outline" size="sm">Mark resolved →</Button>
                </form>
              )}
              {stage.stage_key === 'resolved' && (
                <form action={async () => { 'use server'; await closeComplaint({ complaint_id: id }) }}>
                  <Button type="submit" size="sm">Close complaint →</Button>
                </form>
              )}
              <form action={async () => { 'use server'; await rejectComplaint({ complaint_id: id, remark: 'Marked rejected from UI' }) }}>
                <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10">Reject</Button>
              </form>
            </CardContent>
          </Card>
          {!c.resolution_notes && stage.stage_key === 'in_progress' && (
            <p className="text-xs text-muted-foreground px-1">
              ℹ Record resolution notes (via the actions API or detail-page form in v2) before marking resolved.
            </p>
          )}
        </section>
      )}

      {/* Stage history */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">History</h2>
        <Card>
          <CardContent className="pt-6">
            <ul className="flex flex-col gap-3">
              {(history ?? []).map((h) => {
                const fromLabel = pick(h.from_stage as { label: string } | { label: string }[] | null)?.label
                const toLabel = pick(h.to_stage as { label: string } | { label: string }[] | null)?.label ?? '—'
                return (
                  <li key={h.id} className="text-sm flex items-start gap-3">
                    <span className="size-2 rounded-full bg-muted-foreground mt-2 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {new Date(h.created_at).toLocaleString('en-IN')}
                        </span>
                        <span className="font-medium">
                          {fromLabel ? `${fromLabel} → ${toLabel}` : toLabel}
                        </span>
                      </div>
                      {h.remark && <p className="text-muted-foreground text-xs mt-0.5">{h.remark}</p>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
