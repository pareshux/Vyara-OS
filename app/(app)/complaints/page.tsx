/**
 * /complaints — CS-001 list page (Raj demo Phase 3).
 *
 * Server component; reads via listComplaints (RLS-scoped). Future v2
 * extensions: per-state filters, severity sort, assignee filter,
 * "my complaints" view. v1 keeps it simple — open complaints first
 * with severity pill and assignee chip.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listComplaints, type ComplaintListRow } from '@/lib/actions/complaints'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LifeBuoy, AlertCircle, CheckCircle2, Clock, UserCircle2 } from 'lucide-react'
import { CreateComplaintSheet, type DropdownOption } from './create-complaint-sheet'

export const dynamic = 'force-dynamic'

export default async function ComplaintsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch dropdown data + list in parallel
  const [result, { data: firms }, { data: types }, { data: severities }] = await Promise.all([
    listComplaints(),
    supabase.from('firm').select('id, name').order('name'),
    supabase.from('complaint_type_master').select('code, label').eq('is_active', true).order('sort_order'),
    supabase.from('severity_master').select('code, label, rank').eq('is_active', true).order('rank'),
  ])

  const firmOptions: DropdownOption[] = (firms ?? []).map((f) => ({ value: f.id as string, label: f.name as string }))
  const typeOptions: DropdownOption[] = (types ?? []).map((t) => ({ value: t.code as string, label: t.label as string }))
  const severityOptions: DropdownOption[] = (severities ?? []).map((s) => ({ value: s.code as string, label: s.label as string }))
  if (!result.ok) {
    return (
      <div className="p-6">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-6 text-destructive">Failed to load complaints: {result.error}</CardContent>
        </Card>
      </div>
    )
  }

  const all = result.data
  const open = all.filter((c) => c.is_open)
  const closed = all.filter((c) => !c.is_open)

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 shrink-0">
            <LifeBuoy className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Complaints</h1>
            <p className="text-sm text-muted-foreground">
              Customer Success · breakdown / AMC / warranty
            </p>
          </div>
        </div>
        <CreateComplaintSheet firms={firmOptions} types={typeOptions} severities={severityOptions} />
      </div>

      {/* KPI strip */}
      <div className="grid md:grid-cols-4 gap-3">
        <KpiCard label="Total"   value={all.length}    icon={LifeBuoy}     iconClass="bg-muted text-muted-foreground" />
        <KpiCard label="Open"    value={open.length}   icon={AlertCircle}  iconClass="bg-amber-100 text-amber-700" />
        <KpiCard label="Closed"  value={closed.length} icon={CheckCircle2} iconClass="bg-emerald-100 text-emerald-700" />
        <KpiCard label="Unassigned" value={open.filter((c) => !c.assignee_name).length} icon={UserCircle2} iconClass="bg-orange-100 text-orange-700" />
      </div>

      {/* Open list */}
      <Section title="Open complaints" empty="No open complaints. (Good news.)">
        {open.map((c) => <ComplaintRow key={c.id} c={c} />)}
      </Section>

      {/* Closed list */}
      {closed.length > 0 && (
        <Section title="Closed / rejected" empty="No closed complaints yet.">
          {closed.map((c) => <ComplaintRow key={c.id} c={c} muted />)}
        </Section>
      )}
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, iconClass }: {
  label: string; value: number; icon: typeof LifeBuoy; iconClass: string
}) {
  return (
    <Card size="sm">
      <CardContent className="pt-4 flex items-center gap-3">
        <div className={`flex size-9 items-center justify-center rounded-md ${iconClass}`}>
          <Icon className="size-4" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children]
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {items.length === 0 ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">{empty}</CardContent></Card>
      ) : (
        <div className="flex flex-col gap-2">{children}</div>
      )}
    </section>
  )
}

function ComplaintRow({ c, muted = false }: { c: ComplaintListRow; muted?: boolean }) {
  const loggedDate = new Date(c.logged_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  return (
    <Link href={`/complaints/${c.id}`}>
      <Card size="sm" className={muted ? 'opacity-70 hover:opacity-100' : ''}>
        <CardContent className="pt-4 flex items-center gap-3 flex-wrap">
          {/* Severity pill (always carries a label, not color-only) */}
          <Badge
            variant="outline"
            className="font-medium text-xs"
            style={{ borderColor: c.severity_color, color: c.severity_color, backgroundColor: `${c.severity_color}11` }}
          >
            {c.severity_label}
          </Badge>

          {/* Complaint number + title */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{c.complaint_number}</span>
              <span className="text-sm font-medium truncate">{c.title}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
              <span>{c.firm_name ?? '—'}</span>
              <span>·</span>
              <Clock className="size-3" />
              <span className="tabular-nums">{loggedDate}</span>
            </div>
          </div>

          {/* Stage pill */}
          <Badge
            variant="secondary"
            className="text-xs"
            style={{ borderColor: c.stage_color, color: c.stage_color }}
          >
            {c.stage_label}
          </Badge>

          {/* Assignee */}
          {c.assignee_name ? (
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <UserCircle2 className="size-3.5" />
              {c.assignee_name}
            </span>
          ) : (
            <Badge variant="outline" className="text-xs text-orange-700 border-orange-300">
              Unassigned
            </Badge>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
