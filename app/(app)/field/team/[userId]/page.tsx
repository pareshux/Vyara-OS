import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ChevronRight, MapPin, History, ThumbsUp, ThumbsDown, Phone, LogIn, LogOut, FileText, Clock, XCircle, CalendarClock, ExternalLink,
} from 'lucide-react'
import { getRepDayDetail } from '@/lib/actions/field-team'
import { ApproveClaimButton, RejectClaimButton } from '../claim-actions'

export const dynamic = 'force-dynamic'

function todayInIST(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' })
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  })
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

const SUBJECT_TINT: Record<'project' | 'lead' | 'firm' | 'dealer', string> = {
  project: 'bg-blue-50 text-blue-700',
  lead: 'bg-violet-50 text-violet-700',
  firm: 'bg-amber-50 text-amber-700',
  dealer: 'bg-emerald-50 text-emerald-700',
}

const CLAIM_TINT: Record<'draft' | 'submitted' | 'approved' | 'rejected' | 'exported', string> = {
  draft:     'bg-muted text-muted-foreground',
  submitted: 'bg-amber-50 text-amber-700',
  approved:  'bg-emerald-50 text-emerald-700',
  rejected:  'bg-rose-50 text-rose-700',
  exported:  'bg-slate-50 text-slate-700',
}

export default async function RepDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>
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
  if (!profile || (profile.role !== 'admin' && profile.role !== 'manager')) redirect('/field')

  const { userId } = await params
  const sp = await searchParams
  const date = sp.date ?? todayInIST()

  const result = await getRepDayDetail(userId, date)
  if ('error' in result) {
    if (result.error === 'Rep not found') notFound()
    return (
      <div className="p-4 md:p-6 max-w-3xl">
        <Card><CardContent className="py-5 text-sm text-destructive">{result.error}</CardContent></Card>
      </div>
    )
  }

  const { user: rep, attendance, visits, planned_open } = result

  // Per-leg km — same algorithm as the personal view.
  type Checkpoint = { kind: 'checkin' | 'visit'; odometer: number }
  const checkpoints: Checkpoint[] = []
  if (attendance?.check_in_odometer_km != null) {
    checkpoints.push({ kind: 'checkin', odometer: attendance.check_in_odometer_km })
  }
  const visitsSorted = [...visits].sort(
    (a, b) => new Date(a.visited_at).getTime() - new Date(b.visited_at).getTime(),
  )
  const legKmByVisitId: Record<string, number | null> = {}
  for (const v of visitsSorted) {
    if (v.odometer_km_at_arrival == null) {
      legKmByVisitId[v.visit_id] = null
      continue
    }
    const last = checkpoints[checkpoints.length - 1]
    legKmByVisitId[v.visit_id] = last ? Math.max(0, v.odometer_km_at_arrival - last.odometer) : null
    checkpoints.push({ kind: 'visit', odometer: v.odometer_km_at_arrival })
  }

  const claim = attendance
    ? CLAIM_TINT[attendance.claim_status]
    : ''

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-3xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/field" className="hover:text-foreground">Field</Link>
        <ChevronRight className="size-3.5" />
        <Link href={`/field/team?date=${date}`} className="hover:text-foreground">Team</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">{rep.full_name}</span>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{rep.full_name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            <Badge variant="outline" className="text-[10px] uppercase border-0 bg-muted text-muted-foreground mr-2">
              {rep.role.replace('_', ' ')}
            </Badge>
            {formatLongDate(date)}
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

      {/* ── Attendance summary ───────────────────────────────── */}
      {!attendance ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm font-medium">No record for this day.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {rep.full_name} didn't check in, mark WFH, or log anything on {formatLongDate(date)}.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-semibold">Day summary</p>
              <Badge variant="outline" className={`text-[10px] uppercase border-0 ${claim}`}>
                Claim · {attendance.claim_status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/30 px-3 py-2.5 text-xs">
                <div className="flex items-center gap-1.5 text-[10px] uppercase font-medium text-muted-foreground">
                  <LogIn className="size-3" /> Check-in
                </div>
                <p className="mt-1 tabular-nums">
                  {attendance.check_in_at ? formatTime(attendance.check_in_at) : '—'}
                </p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {attendance.check_in_odometer_km != null
                    ? `${attendance.check_in_odometer_km.toLocaleString('en-IN')} km`
                    : 'no odometer'}
                </p>
                {attendance.check_in_lat != null && attendance.check_in_lng != null && (
                  <a
                    href={`https://www.google.com/maps?q=${attendance.check_in_lat},${attendance.check_in_lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-blue-700 tabular-nums hover:underline inline-flex items-center gap-0.5"
                  >
                    {attendance.check_in_lat.toFixed(4)}°, {attendance.check_in_lng.toFixed(4)}°
                    <ExternalLink className="size-2.5" />
                  </a>
                )}
              </div>
              <div className="rounded-lg bg-muted/30 px-3 py-2.5 text-xs">
                <div className="flex items-center gap-1.5 text-[10px] uppercase font-medium text-muted-foreground">
                  <LogOut className="size-3" /> Check-out
                </div>
                <p className="mt-1 tabular-nums">
                  {attendance.check_out_at ? formatTime(attendance.check_out_at) : '—'}
                </p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {attendance.check_out_odometer_km != null
                    ? `${attendance.check_out_odometer_km.toLocaleString('en-IN')} km`
                    : 'no odometer'}
                </p>
                {attendance.check_out_lat != null && attendance.check_out_lng != null && (
                  <a
                    href={`https://www.google.com/maps?q=${attendance.check_out_lat},${attendance.check_out_lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-blue-700 tabular-nums hover:underline inline-flex items-center gap-0.5"
                  >
                    {attendance.check_out_lat.toFixed(4)}°, {attendance.check_out_lng.toFixed(4)}°
                    <ExternalLink className="size-2.5" />
                  </a>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border px-3 py-2.5 text-xs tabular-nums">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vehicle</span>
                <span className="font-mono">{attendance.vehicle_label ?? '—'}</span>
              </div>
              <div className="flex justify-between mt-0.5">
                <span className="text-muted-foreground">Distance</span>
                <span>{attendance.total_km != null ? `${attendance.total_km.toLocaleString('en-IN')} km` : '—'}</span>
              </div>
              <div className="flex justify-between mt-0.5">
                <span className="text-muted-foreground">Rate</span>
                <span className="text-muted-foreground">
                  {attendance.rate_applied != null ? `₹${attendance.rate_applied.toFixed(2)}/km` : '—'}
                </span>
              </div>
              <div className="flex justify-between mt-1 pt-1 border-t border-border">
                <span className="font-medium">Claim</span>
                <span className="font-semibold">{rs(attendance.reimbursement_amount)}</span>
              </div>
            </div>

            {attendance.rejection_reason && (
              <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
                <div className="flex items-center gap-1.5 font-medium mb-0.5">
                  <XCircle className="size-3" /> Previously rejected
                </div>
                {attendance.rejection_reason}
              </div>
            )}

            {attendance.notes && (
              <div className="rounded-lg bg-muted/30 px-3 py-2 text-xs">
                <div className="flex items-center gap-1.5 font-medium text-muted-foreground mb-0.5">
                  <FileText className="size-3" /> Rep's note
                </div>
                {attendance.notes}
              </div>
            )}

            {attendance.claim_status === 'submitted' && (
              <div className="flex gap-2 justify-end pt-1">
                <ApproveClaimButton attendanceId={attendance.id} repName={rep.full_name} />
                <RejectClaimButton attendanceId={attendance.id} repName={rep.full_name} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Planned today (not yet started) ──────────────────── */}
      {planned_open.length > 0 && (
        <Card>
          <CardContent className="py-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Planned, not started</p>
              <Badge variant="outline" className="text-[10px] uppercase border-0 bg-amber-50 text-amber-700">
                {planned_open.length}
              </Badge>
            </div>
            <div className="flex flex-col gap-2">
              {planned_open.map((p) => (
                <div key={p.task_id} className="rounded-lg border border-border bg-amber-50/40 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <CalendarClock className="size-3.5 text-amber-700 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{p.title}</p>
                        {p.priority !== 'medium' && (
                          <Badge variant="outline" className="text-[10px] uppercase border-0 bg-rose-50 text-rose-700">
                            {p.priority}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                        {formatTime(p.due_at)} · <span className="font-medium">{p.subject_label}</span>
                        {p.contact_name && <> · {p.contact_name}</>}
                      </p>
                    </div>
                    {p.subject_type && (
                      <Badge variant="outline" className={`text-[10px] uppercase border-0 ${SUBJECT_TINT[p.subject_type]}`}>
                        {p.subject_type}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Visits list ──────────────────────────────────────── */}
      <Card>
        <CardContent className="py-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            <p className="text-sm font-semibold">Visits</p>
            <span className="text-xs text-muted-foreground tabular-nums">{visitsSorted.length}</span>
          </div>
          {visitsSorted.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No visits logged.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {visitsSorted.map((v) => {
                const legKm = legKmByVisitId[v.visit_id]
                const contactDisplay = v.contact_name ?? v.contact_name_raw
                return (
                  <div key={v.visit_id} className={`rounded-lg border px-3 py-2.5 ${
                    v.state === 'in_progress' ? 'border-emerald-200 bg-emerald-50/30' : 'border-border bg-muted/20'
                  }`}>
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col items-center pt-0.5">
                        <div className={`size-1.5 rounded-full ${v.state === 'in_progress' ? 'bg-emerald-500 animate-pulse' : 'bg-emerald-500'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{v.subject_label}</p>
                          <Badge variant="outline" className={`text-[10px] uppercase border-0 ${SUBJECT_TINT[v.subject_type]}`}>
                            {v.subject_type}
                          </Badge>
                          {v.state === 'in_progress' && (
                            <Badge variant="outline" className="text-[10px] uppercase border-0 bg-emerald-100 text-emerald-800">
                              <Clock className="size-2.5 mr-0.5" /> Live
                            </Badge>
                          )}
                          {v.is_interested === true && (
                            <Badge variant="outline" className="text-[10px] uppercase border-0 bg-emerald-50 text-emerald-700">
                              <ThumbsUp className="size-3 mr-0.5" /> Interested
                            </Badge>
                          )}
                          {v.is_interested === false && (
                            <Badge variant="outline" className="text-[10px] uppercase border-0 bg-rose-50 text-rose-700">
                              <ThumbsDown className="size-3 mr-0.5" /> Not
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                          {formatTime(v.visited_at)}
                          {v.duration_minutes != null && <> · {v.duration_minutes} min</>}
                          {legKm != null && <> · <span className="text-foreground font-medium">{legKm} km</span></>}
                          {v.lat != null && v.lng != null && (
                            <> ·{' '}
                              <a
                                href={`https://www.google.com/maps?q=${v.lat},${v.lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 text-blue-700 hover:underline"
                              >
                                <MapPin className="size-2.5" />
                                {v.lat.toFixed(4)}°, {v.lng.toFixed(4)}°
                                <ExternalLink className="size-2.5" />
                              </a>
                            </>
                          )}
                        </p>
                        {contactDisplay && (
                          <p className="text-[11px] mt-0.5">
                            <span className="text-muted-foreground">Met: </span>
                            <span className="text-foreground">{contactDisplay}</span>
                            {v.contact_phone_raw && (
                              <>
                                {' '}·{' '}
                                <a href={`tel:${v.contact_phone_raw}`} className="text-foreground hover:underline tabular-nums inline-flex items-center gap-0.5">
                                  <Phone className="size-2.5" />
                                  {v.contact_phone_raw}
                                </a>
                              </>
                            )}
                          </p>
                        )}
                        {v.outcome_label && (
                          <p className="text-[11px] mt-0.5">
                            <span className="text-muted-foreground">Next: </span>
                            <span className="font-medium">{v.outcome_label}</span>
                          </p>
                        )}
                        {v.notes_text && (
                          <p className="text-[11px] text-muted-foreground mt-1">{v.notes_text}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground italic">
        Map view (route plotted from check-in + visit pins + check-out) deferred — needs a map provider integration.
      </p>
    </div>
  )
}
