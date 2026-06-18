import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Users, ChevronRight, MapPin, Inbox, Coffee, CalendarOff, Sun, AlertCircle, Home,
} from 'lucide-react'
import { getTeamSnapshot, listPendingClaims } from '@/lib/actions/field-team'
import { ApproveClaimButton, RejectClaimButton } from './claim-actions'

export const dynamic = 'force-dynamic'

function todayInIST(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' })
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  })
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatLongDate(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata',
  })
}

function rs(n: number | null) {
  if (n == null) return '—'
  return `₹${n.toFixed(2)}`
}

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('user_profile')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && profile.role !== 'manager') redirect('/field')

  const sp = await searchParams
  const date = sp.date ?? todayInIST()
  const isToday = date === todayInIST()

  const [snapshotResult, claimsResult] = await Promise.all([
    getTeamSnapshot(date),
    listPendingClaims(),
  ])

  if ('error' in snapshotResult) {
    return (
      <div className="p-4 md:p-6 max-w-3xl">
        <Card><CardContent className="py-5 text-sm text-destructive">{snapshotResult.error}</CardContent></Card>
      </div>
    )
  }

  const { reps } = snapshotResult
  const pending = 'error' in claimsResult ? [] : claimsResult.claims

  // Roll-up metrics
  const onDuty = reps.filter((r) => r.attendance?.check_in_at && !r.attendance.check_out_at).length
  const done = reps.filter((r) => r.attendance?.check_out_at).length
  const wfhLeave = reps.filter((r) =>
    r.attendance?.status_for_day === 'wfh' ||
    r.attendance?.status_for_day === 'leave' ||
    r.attendance?.status_for_day === 'holiday',
  ).length
  const noCheckIn = reps.filter((r) => !r.attendance).length

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-3xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/field" className="hover:text-foreground">Field</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">Team</span>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Users className="size-5 text-primary" />
            Field team
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isToday ? `Today, ${formatLongDate(date)}` : formatLongDate(date)}
          </p>
        </div>
        <form className="flex items-center gap-2">
          <input
            type="date"
            name="date"
            defaultValue={date}
            max={todayInIST()}
            className="h-8 px-2 text-xs rounded-md border border-border bg-card"
          />
          <button type="submit" className="h-8 px-3 text-xs rounded-md border border-border bg-card hover:bg-muted/30">
            Go
          </button>
        </form>
      </div>

      {/* ── Roll-up counters ──────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2">
        <RollupChip label="On duty" value={onDuty} tone="emerald" icon={MapPin} />
        <RollupChip label="Done" value={done} tone="slate" icon={Sun} />
        <RollupChip label="WFH / leave" value={wfhLeave} tone="amber" icon={Home} />
        <RollupChip label="Not in yet" value={noCheckIn} tone={noCheckIn > 0 && isToday ? 'rose' : 'muted'} icon={AlertCircle} />
      </div>

      {/* ── Pending claims ────────────────────────────────────── */}
      {pending.length > 0 && (
        <Card>
          <CardContent className="py-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Inbox className="size-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Claims awaiting approval</p>
              <Badge variant="outline" className="text-[10px] uppercase border-0 bg-amber-50 text-amber-700">
                {pending.length}
              </Badge>
            </div>
            <div className="flex flex-col gap-2">
              {pending.map((c) => (
                <div key={c.attendance_id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                  <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground shrink-0">
                    {initials(c.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.full_name}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {c.attendance_date} · {c.vehicle_label ?? 'no vehicle'} ·{' '}
                      {c.total_km != null ? `${c.total_km.toLocaleString('en-IN')} km` : '—'}
                      {c.rate_applied != null && <> @ ₹{c.rate_applied.toFixed(2)}/km</>}
                      <> · </>
                      <span className="font-semibold text-foreground">{rs(c.reimbursement_amount)}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">Submitted {formatRelative(c.submitted_at)}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <ApproveClaimButton attendanceId={c.attendance_id} repName={c.full_name} />
                    <RejectClaimButton attendanceId={c.attendance_id} repName={c.full_name} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Team grid ─────────────────────────────────────────── */}
      {reps.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No active reps in the tenant.</CardContent></Card>
      ) : (
        <div className="flex flex-col gap-2">
          {reps.map((r) => (
            <Link
              key={r.user_id}
              href={`/field/team/${r.user_id}?date=${date}`}
              className="rounded-lg border border-border bg-card px-3 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex size-9 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground shrink-0">
                {initials(r.full_name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{r.full_name}</p>
                  <Badge variant="outline" className="text-[10px] uppercase border-0 bg-muted text-muted-foreground">
                    {r.role.replace('_', ' ')}
                  </Badge>
                  <StatusPill rep={r} isToday={isToday} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                  {repSummary(r)}
                </p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            </Link>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground italic">
        Live map view + daily digest are deferred — needs a map provider and the digest infra.
      </p>
    </div>
  )

  // ─── helpers
  function repSummary(r: typeof reps[number]): string {
    const att = r.attendance
    if (!att) {
      return isToday ? 'Not checked in yet' : 'No record for this day'
    }
    const parts: string[] = []
    if (att.check_in_at) parts.push(`In ${formatTime(att.check_in_at)}`)
    if (att.check_out_at) parts.push(`Out ${formatTime(att.check_out_at)}`)
    parts.push(`${r.visits_today} visit${r.visits_today === 1 ? '' : 's'}`)
    if (r.in_progress_count > 0) parts.push(`${r.in_progress_count} live`)
    if (att.total_km != null) parts.push(`${att.total_km.toLocaleString('en-IN')} km`)
    if (att.reimbursement_amount != null) parts.push(rs(att.reimbursement_amount))
    if (r.last_activity_at && att.check_in_at && !att.check_out_at) {
      parts.push(`active ${formatRelative(r.last_activity_at)}`)
    }
    return parts.join(' · ')
  }
}

function RollupChip({
  label, value, tone, icon: Icon,
}: {
  label: string
  value: number
  tone: 'emerald' | 'slate' | 'amber' | 'rose' | 'muted'
  icon: typeof MapPin
}) {
  const colors: Record<typeof tone, { bg: string; text: string }> = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
    slate:   { bg: 'bg-slate-50',   text: 'text-slate-700' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-700' },
    rose:    { bg: 'bg-rose-50',    text: 'text-rose-700' },
    muted:   { bg: 'bg-muted/40',   text: 'text-muted-foreground' },
  }
  return (
    <div className={`rounded-lg ${colors[tone].bg} px-3 py-2`}>
      <div className={`flex items-center gap-1.5 ${colors[tone].text} text-[10px] uppercase font-medium`}>
        <Icon className="size-3" /> {label}
      </div>
      <p className={`text-lg font-semibold mt-0.5 tabular-nums ${colors[tone].text}`}>{value}</p>
    </div>
  )
}

function StatusPill({ rep, isToday }: { rep: { attendance: { check_in_at: string | null; check_out_at: string | null; status_for_day: 'on_duty' | 'wfh' | 'leave' | 'holiday' } | null }; isToday: boolean }) {
  const att = rep.attendance
  if (!att) {
    if (isToday) {
      return (
        <Badge variant="outline" className="text-[10px] uppercase border-0 bg-rose-50 text-rose-700">
          <AlertCircle className="size-2.5 mr-0.5" /> No check-in
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="text-[10px] uppercase border-0 bg-muted text-muted-foreground">
        No record
      </Badge>
    )
  }
  if (att.status_for_day === 'wfh') {
    return <Badge variant="outline" className="text-[10px] uppercase border-0 bg-amber-50 text-amber-700"><Home className="size-2.5 mr-0.5" /> WFH</Badge>
  }
  if (att.status_for_day === 'leave') {
    return <Badge variant="outline" className="text-[10px] uppercase border-0 bg-amber-50 text-amber-700"><CalendarOff className="size-2.5 mr-0.5" /> Leave</Badge>
  }
  if (att.status_for_day === 'holiday') {
    return <Badge variant="outline" className="text-[10px] uppercase border-0 bg-amber-50 text-amber-700"><Coffee className="size-2.5 mr-0.5" /> Holiday</Badge>
  }
  if (att.check_in_at && !att.check_out_at) {
    return <Badge variant="outline" className="text-[10px] uppercase border-0 bg-emerald-50 text-emerald-700"><MapPin className="size-2.5 mr-0.5" /> On duty</Badge>
  }
  if (att.check_out_at) {
    return <Badge variant="outline" className="text-[10px] uppercase border-0 bg-slate-50 text-slate-700"><Sun className="size-2.5 mr-0.5" /> Done</Badge>
  }
  return null
}
