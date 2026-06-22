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
import { TeamDaySummaryCard } from './team-day-summary-card'
import { LocationMapButton } from '@/components/map/location-map-button'

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
      <div className="p-4 md:p-6 max-w-6xl">
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
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl">
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

      {/* ── AI team digest — what the sales head reads first ── */}
      {isToday && <TeamDaySummaryCard date={date} />}

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

      {/* ── Team table — matches the /invoices · /orders · /dispatches pattern ── */}
      {reps.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No active reps in the tenant.</CardContent></Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Rep</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Status</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Visits</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell whitespace-nowrap">Hours</th>
                <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground md:table-cell whitespace-nowrap">Distance</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground lg:table-cell whitespace-nowrap">Active</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground lg:table-cell whitespace-nowrap">Where</th>
              </tr>
            </thead>
            <tbody>
              {reps.map((r) => {
                const stale = isStale(r, isToday)
                const att = r.attendance
                const isOnDuty = !!att?.check_in_at && !att?.check_out_at
                const drillHref = `/field/team/${r.user_id}?date=${date}`
                return (
                  <tr key={r.user_id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Link href={drillHref} className="flex items-center gap-2.5 text-foreground hover:text-primary">
                        <div className="flex size-8 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground shrink-0">
                          {initials(r.full_name)}
                        </div>
                        <div>
                          <p className="text-sm font-medium leading-tight">{r.full_name}</p>
                          <p className="text-[10px] uppercase text-muted-foreground tracking-wide">{r.role.replace('_', ' ')}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <StatusPill rep={r} isToday={isToday} />
                        {stale && (
                          <Badge variant="outline" className="text-[10px] uppercase border-0 bg-amber-50 text-amber-700">
                            <Clock className="size-2.5 mr-0.5" /> Quiet 2h+
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                      {att && (att.check_in_at || att.status_for_day !== 'on_duty') ? (
                        <span>
                          <span className="text-foreground font-medium">{r.visits_today}</span>
                          <span className="text-muted-foreground"> / </span>
                          <span className="text-foreground font-medium">{r.planned_count}</span>
                          <span className="text-[11px] text-muted-foreground"> planned</span>
                          {r.in_progress_count > 0 && (
                            <Badge variant="outline" className="ml-1.5 text-[10px] uppercase border-0 bg-emerald-50 text-emerald-700">
                              {r.in_progress_count} live
                            </Badge>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-2 tabular-nums md:table-cell whitespace-nowrap">
                      {att?.check_in_at ? (
                        <span>
                          {formatTime(att.check_in_at)}
                          {att.check_out_at && <span className="text-muted-foreground"> → {formatTime(att.check_out_at)}</span>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell whitespace-nowrap">
                      {att?.total_km != null ? (
                        <span>{att.total_km.toLocaleString('en-IN')} km</span>
                      ) : att?.running_km != null ? (
                        <span className="text-muted-foreground">{att.running_km.toLocaleString('en-IN')} km</span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                      {att?.reimbursement_amount != null && (
                        <div className="text-[10px] text-muted-foreground tabular-nums">{rs(att.reimbursement_amount)}</div>
                      )}
                    </td>
                    <td className="hidden px-3 py-2 text-muted-foreground tabular-nums lg:table-cell whitespace-nowrap">
                      {r.last_activity_at && isOnDuty ? formatRelative(r.last_activity_at)
                        : !att && isToday ? <span className="italic">not in</span>
                        : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="hidden px-3 py-2 lg:table-cell whitespace-nowrap">
                      {r.latest_location ? (
                        <LocationMapButton
                          lat={r.latest_location.lat}
                          lng={r.latest_location.lng}
                          label={r.latest_location.label}
                          source={r.latest_location.source}
                          repName={r.full_name}
                        />
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
