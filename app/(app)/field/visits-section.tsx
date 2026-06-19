import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CalendarClock, MapPin, ClipboardList, History, ThumbsUp, ThumbsDown, Phone, ChevronRight } from 'lucide-react'
import { getTodayVisitsContext } from '@/lib/actions/field-visits'
import { PlanOrStartVisitSheet } from './plan-or-start-visit-sheet'
import { StartPlannedVisitButton } from './start-planned-visit-button'
import { CompleteVisitButton } from './complete-visit-button'
import { CancelVisitButton } from './cancel-visit-button'
import { LogExpenseSheet } from '@/components/expense/log-expense-sheet'
import { VisitPrepBrief } from './visit-prep-brief'

function formatTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  })
}

const SUBJECT_TINT: Record<'project' | 'lead' | 'firm' | 'dealer', string> = {
  project: 'bg-blue-50 text-blue-700',
  lead: 'bg-violet-50 text-violet-700',
  firm: 'bg-amber-50 text-amber-700',
  dealer: 'bg-emerald-50 text-emerald-700',
}

const PRIORITY_TINT: Record<'low' | 'medium' | 'high' | 'urgent', string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-slate-100 text-slate-700',
  high: 'bg-amber-50 text-amber-700',
  urgent: 'bg-rose-50 text-rose-700',
}

export async function VisitsSection({
  checkInOdometerKm,
  tenantId,
  readOnly = false,
}: {
  checkInOdometerKm: number | null
  tenantId: string
  readOnly?: boolean
}) {
  const res = await getTodayVisitsContext()
  if ('error' in res) {
    return (
      <Card><CardContent className="py-4 text-sm text-destructive">{res.error}</CardContent></Card>
    )
  }
  const { planned, in_progress, completed } = res

  // Per-leg distance. Checkpoints are: check-in odometer, then each
  // visit's arrival odometer in chronological order. Each visit's leg
  // = its arrival_odo − prior_checkpoint.
  type Checkpoint = { kind: 'checkin' | 'visit'; visit_id?: string; odometer: number }
  const checkpoints: Checkpoint[] = []
  if (checkInOdometerKm != null) checkpoints.push({ kind: 'checkin', odometer: checkInOdometerKm })

  // Sort completed visits by visited_at chronologically.
  const completedSorted = [...completed].sort(
    (a, b) => new Date(a.visited_at).getTime() - new Date(b.visited_at).getTime(),
  )
  const legKmByVisitId: Record<string, number | null> = {}
  for (const v of completedSorted) {
    if (v.odometer_km_at_arrival == null) {
      legKmByVisitId[v.visit_id] = null
      continue
    }
    const last = checkpoints[checkpoints.length - 1]
    legKmByVisitId[v.visit_id] = last ? Math.max(0, v.odometer_km_at_arrival - last.odometer) : null
    checkpoints.push({ kind: 'visit', visit_id: v.visit_id, odometer: v.odometer_km_at_arrival })
  }

  // For the in-progress card show the leg from the last checkpoint to its arrival.
  const inProgressLegFromCheckpoint =
    in_progress[0] && in_progress[0].odometer_km_at_arrival != null && checkpoints.length > 0
      ? Math.max(0, in_progress[0].odometer_km_at_arrival - checkpoints[checkpoints.length - 1].odometer)
      : null

  // "Last odometer" suggestion for the next visit start = the freshest checkpoint.
  const lastKnownOdometer =
    in_progress[0]?.odometer_km_at_arrival ??
    (checkpoints.length > 0 ? checkpoints[checkpoints.length - 1].odometer : null)

  const hasLive = in_progress.length > 0
  const live = in_progress[0]
  const plannedOpen = planned.filter((p) => !p.is_done)

  return (
    <div className="flex flex-col gap-4">
      {/* ── Currently visiting (live) ─────────────────────────── */}
      {!readOnly && hasLive && live && (() => {
        // A visit that's been "in progress" for >6h almost certainly
        // means the rep left without wrapping it up. Flag it visually
        // so they can complete or cancel instead of being stuck.
        const ageMinutes = live.started_at
          ? (Date.now() - new Date(live.started_at).getTime()) / 60000
          : 0
        const isStale = ageMinutes > 6 * 60
        return (
        <Card className={isStale
          ? 'border-amber-300 bg-amber-50/40'
          : 'border-emerald-200 bg-emerald-50/30'}>
          <CardContent className="py-4 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className={`flex size-9 items-center justify-center rounded-xl shrink-0 ${
                isStale ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'
              }`}>
                <MapPin className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold">{isStale ? 'Stuck visit' : 'Currently visiting'}</p>
                  <Badge variant="outline" className={`text-[10px] uppercase border-0 ${
                    isStale ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {isStale ? 'Needs wrap-up' : 'Live'}
                  </Badge>
                </div>
                <p className="text-sm mt-1">{live.subject_label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                  Started {formatTime(live.started_at)}
                  {live.odometer_km_at_arrival != null && <> · arrived at {live.odometer_km_at_arrival.toLocaleString('en-IN')} km</>}
                  {inProgressLegFromCheckpoint != null && (
                    <> · <span className="text-emerald-700 font-medium">{inProgressLegFromCheckpoint} km</span> from previous checkpoint</>
                  )}
                </p>
                {(live.location_label || (live.lat != null && live.lng != null)) && (
                  <a
                    href={`https://www.google.com/maps?q=${live.lat},${live.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-primary hover:underline mt-1 inline-flex items-center gap-1"
                  >
                    <MapPin className="size-3" />
                    {live.location_label ?? `${live.lat?.toFixed(4)}, ${live.lng?.toFixed(4)}`}
                  </a>
                )}
                {isStale && (
                  <p className="text-[11px] text-amber-800 mt-1.5">
                    This visit has been open for {Math.floor(ageMinutes / 60)}h{' '}
                    — wrap it up or cancel so you can start the next one.
                  </p>
                )}
              </div>
              <Badge variant="outline" className={`text-[10px] uppercase border-0 ${SUBJECT_TINT[live.subject_type]}`}>
                {live.subject_type}
              </Badge>
            </div>

            {/* AI prep brief — fires once per live visit, cached after. */}
            <VisitPrepBrief visitId={live.visit_id} />

            <div className="flex gap-2 flex-wrap">
              <CompleteVisitButton
                visitId={live.visit_id}
                initialContactId={live.contact_id}
                tenantId={tenantId}
              />
              <LogExpenseSheet
                tenantId={tenantId}
                subjectType="field_visit"
                subjectId={live.visit_id}
                triggerLabel="Expense"
              />
              <Link
                href={`/field/visits/${live.visit_id}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40"
              >
                Open hub
                <ChevronRight className="size-3" />
              </Link>
              <CancelVisitButton visitId={live.visit_id} />
            </div>
          </CardContent>
        </Card>
        )
      })()}

      {/* ── Today's plan ──────────────────────────────────────── */}
      {!readOnly && (
      <Card>
        <CardContent className="py-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <ClipboardList className="size-4 text-muted-foreground shrink-0" />
              <p className="text-sm font-semibold">Today's plan</p>
              <span className="text-xs text-muted-foreground tabular-nums">
                {plannedOpen.length} planned · {completed.length} done
              </span>
            </div>
            <PlanOrStartVisitSheet
              lastKnownOdometer={lastKnownOdometer}
              disableStartNow={hasLive}
              tenantId={tenantId}
            />
          </div>

          {plannedOpen.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No planned visits. Plan one for later, or start a visit now and we'll log it on the fly.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {plannedOpen.map((p) => (
                <div key={p.task_id} className="rounded-lg border border-border bg-card px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <CalendarClock className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{p.title}</p>
                        {p.priority !== 'medium' && (
                          <Badge variant="outline" className={`text-[10px] uppercase border-0 ${PRIORITY_TINT[p.priority]}`}>
                            {p.priority}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                        {formatTime(p.due_at)} ·{' '}
                        <span className="font-medium">{p.subject_label}</span>
                        {p.contact_name && <> · {p.contact_name}</>}
                        {!p.created_by_me && <span className="italic"> · assigned to you</span>}
                      </p>
                    </div>
                    {p.subject_type && (
                      <Badge variant="outline" className={`text-[10px] uppercase border-0 ${SUBJECT_TINT[p.subject_type]}`}>
                        {p.subject_type}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 flex justify-end">
                    <StartPlannedVisitButton
                      taskId={p.task_id}
                      subjectLabel={p.subject_label}
                      lastKnownOdometer={lastKnownOdometer}
                      disabled={hasLive}
                      tenantId={tenantId}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* ── Today's visits (completed) ────────────────────────── */}
      {completedSorted.length > 0 && (
        <Card>
          <CardContent className="py-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <History className="size-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Today's visits</p>
              <span className="text-xs text-muted-foreground tabular-nums">{completedSorted.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {completedSorted.map((v) => {
                const legKm = legKmByVisitId[v.visit_id]
                const contactDisplay = v.contact_name ?? v.contact_name_raw
                return (
                  <Link
                    key={v.visit_id}
                    href={`/field/visits/${v.visit_id}`}
                    className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 hover:bg-muted/40 transition-colors block"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col items-center pt-0.5">
                        <div className="size-1.5 rounded-full bg-emerald-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{v.subject_label}</p>
                          {v.subject_type && (
                            <Badge variant="outline" className={`text-[10px] uppercase border-0 ${SUBJECT_TINT[v.subject_type]}`}>
                              {v.subject_type}
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
                        </p>
                        {contactDisplay && (
                          <p className="text-[11px] mt-0.5">
                            <span className="text-muted-foreground">Met: </span>
                            <span className="text-foreground">{contactDisplay}</span>
                            {v.contact_phone_raw && (
                              <>
                                {' '}·{' '}
                                <a
                                  href={`tel:${v.contact_phone_raw}`}
                                  className="text-foreground hover:underline tabular-nums inline-flex items-center gap-0.5"
                                >
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
                          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{v.notes_text}</p>
                        )}
                      </div>
                      <ChevronRight className="size-3.5 text-muted-foreground shrink-0 mt-1" />
                    </div>
                  </Link>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
