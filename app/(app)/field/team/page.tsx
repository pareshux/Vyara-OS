import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Users, ChevronRight, MapPin, Inbox, Coffee, CalendarOff, Sun, AlertCircle, Home, ExternalLink, Clock,
} from 'lucide-react'
import { getTeamSnapshot, listPendingClaims, type TeamRepRow } from '@/lib/actions/field-team'
import { getTodayContext } from '@/lib/actions/field-attendance'
import { ApproveClaimButton, RejectClaimButton } from './claim-actions'
import { MyDayChip } from './my-day-chip'

export const dynamic = 'force-dynamic'

const STALE_AFTER_MINUTES = 120 // 2h
const WORK_HOUR_START_IST = 10
const WORK_HOUR_END_IST = 18

function todayInIST(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' })
}

function hourInIST(d: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
  }).format(d))
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

function isStale(rep: TeamRepRow, isToday: boolean): boolean {
  if (!isToday) return false
  if (!rep.attendance?.check_in_at || rep.attendance.check_out_at) return false
  const hourNow = hourInIST(new Date())
  if (hourNow < WORK_HOUR_START_IST || hourNow >= WORK_HOUR_END_IST) return false
  if (!rep.last_activity_at) return true
  const ageMin = (Date.now() - new Date(rep.last_activity_at).getTime()) / 60_000
  return ageMin > STALE_AFTER_MINUTES
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
    .select('role, tenant_id')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && profile.role !== 'manager') redirect('/field')
  const tenantId = profile.tenant_id as string

  const sp = await searchParams
  const date = sp.date ?? todayInIST()
  const isToday = date === todayInIST()

  const [snapshotResult, claimsResult, myContext] = await Promise.all([
    getTeamSnapshot(date),
    listPendingClaims(),
    getTodayContext(),
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

  // My own day status for the chip
  const myAttendance = 'error' in myContext ? null : myContext.attendance
  const vehiclesForUi =
    'error' in myContext
      ? []
      : myContext.vehicles.map((v) => ({
          ...v,
          effective_rate_per_km: v.custom_rate_per_km ?? v.matrix_rate_per_km,
          rate_source: (v.custom_rate_per_km != null
            ? 'custom'
            : v.matrix_rate_per_km != null
              ? 'matrix'
              : 'none') as 'custom' | 'matrix' | 'none',
        }))
  const myLastKnownOdometer = 'error' in myContext ? null : myContext.lastKnownOdometer

  let myStatus:
    | { kind: 'not_started' }
    | { kind: 'on_duty'; check_in_at: string }
    | { kind: 'checked_out' }
    | { kind: 'wfh' | 'leave' | 'holiday' }
  if (!myAttendance) {
    myStatus = { kind: 'not_started' }
  } else if (myAttendance.check_out_at) {
    myStatus = { kind: 'checked_out' }
  } else if (myAttendance.check_in_at) {
    myStatus = { kind: 'on_duty', check_in_at: myAttendance.check_in_at }
  } else if (myAttendance.status_for_day !== 'on_duty') {
    myStatus = { kind: myAttendance.status_for_day }
  } else {
    myStatus = { kind: 'not_started' }
  }

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

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Users className="size-5 text-primary" />
            Field team
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isToday ? `Today, ${formatLongDate(date)}` : formatLongDate(date)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isToday && (
            <MyDayChip
              myStatus={myStatus}
              vehicles={vehiclesForUi}
              lastKnownOdometer={myLastKnownOdometer}
              tenantId={tenantId}
            />
          )}
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
          {reps.map((r) => {
            const stale = isStale(r, isToday)
            const att = r.attendance
            const isOnDuty = !!att?.check_in_at && !att?.check_out_at
            return (
              <Link
                key={r.user_id}
                href={`/field/team/${r.user_id}?date=${date}`}
                className="block rounded-lg border border-border bg-card px-3 py-3 hover:bg-muted/20 transition-colors"
              >
                {/* Row 1 — identity + status */}
                <div className="flex items-start gap-3">
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
                      {stale && (
                        <Badge variant="outline" className="text-[10px] uppercase border-0 bg-amber-50 text-amber-700">
                          <Clock className="size-2.5 mr-0.5" /> Quiet 2h+
                        </Badge>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground shrink-0 mt-1" />
                </div>

                {/* Row 2 — visit counts + time strip */}
                {att && (att.check_in_at || att.status_for_day !== 'on_duty') && (
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums flex-wrap">
                    <span>
                      <span className="text-foreground font-medium">{r.visits_today}</span> done
                      {' · '}
                      <span className="text-foreground font-medium">{r.planned_count}</span> planned
                      {r.in_progress_count > 0 && (
                        <> · <span className="text-emerald-700 font-medium">{r.in_progress_count} live</span></>
                      )}
                    </span>
                    {att.check_in_at && <span>· in {formatTime(att.check_in_at)}</span>}
                    {att.check_out_at && <span>· out {formatTime(att.check_out_at)}</span>}
                    {att.total_km != null
                      ? <span>· {att.total_km.toLocaleString('en-IN')} km</span>
                      : att.running_km != null
                        ? <span>· {att.running_km.toLocaleString('en-IN')} km so far</span>
                        : null}
                    {att.reimbursement_amount != null && <span>· {rs(att.reimbursement_amount)}</span>}
                    {r.last_activity_at && isOnDuty && (
                      <span>· active {formatRelative(r.last_activity_at)}</span>
                    )}
                  </div>
                )}
                {!att && isToday && (
                  <p className="mt-2 text-[11px] text-muted-foreground italic">Not checked in yet</p>
                )}

                {/* Row 3 — where they are right now */}
                {r.latest_location && (
                  <div className="mt-2 flex items-center gap-2">
                    <MapPin className="size-3.5 text-blue-700 shrink-0" />
                    <a
                      href={`https://www.google.com/maps?q=${r.latest_location.lat},${r.latest_location.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-blue-700 hover:underline inline-flex items-center gap-1 truncate"
                      title={r.latest_location.source === 'visit' ? 'Latest visit pin' : 'Check-in spot'}
                    >
                      <span className="truncate">
                        {r.latest_location.label
                          ?? `${r.latest_location.lat.toFixed(4)}°, ${r.latest_location.lng.toFixed(4)}°`}
                      </span>
                      <ExternalLink className="size-3 shrink-0" />
                    </a>
                    <span className="text-[10px] text-muted-foreground">
                      ({r.latest_location.source === 'visit' ? 'last visit' : 'check-in'})
                    </span>
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground italic">
        Tap a location chip to open Google Maps. A native map view + route plotting are deferred until the map provider lands.
      </p>
    </div>
  )

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

function StatusPill({ rep, isToday }: { rep: TeamRepRow; isToday: boolean }) {
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
