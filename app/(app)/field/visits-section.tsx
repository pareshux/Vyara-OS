import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CalendarClock, MapPin, ClipboardList, History } from 'lucide-react'
import { getTodayVisitsContext } from '@/lib/actions/field-visits'
import { PlanOrStartVisitSheet } from './plan-or-start-visit-sheet'
import { StartPlannedVisitButton } from './start-planned-visit-button'
import { CompleteVisitButton } from './complete-visit-button'
import { CancelVisitButton } from './cancel-visit-button'

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
}: {
  checkInOdometerKm: number | null
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
      {hasLive && live && (
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="py-4 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 shrink-0">
                <MapPin className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold">Currently visiting</p>
                  <Badge variant="outline" className="text-[10px] uppercase border-0 bg-emerald-100 text-emerald-800">
                    Live
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
              </div>
              <Badge variant="outline" className={`text-[10px] uppercase border-0 ${SUBJECT_TINT[live.subject_type]}`}>
                {live.subject_type}
              </Badge>
            </div>
            <div className="flex gap-2">
              <CompleteVisitButton visitId={live.visit_id} initialContactId={live.contact_id} />
              <CancelVisitButton visitId={live.visit_id} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Today's plan ──────────────────────────────────────── */}
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
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
                return (
                  <div key={v.visit_id} className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
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
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                          {formatTime(v.visited_at)}
                          {v.duration_minutes != null && <> · {v.duration_minutes} min</>}
                          {legKm != null && <> · <span className="text-foreground font-medium">{legKm} km</span></>}
                          {v.contact_name && <> · {v.contact_name}</>}
                        </p>
                        <p className="text-[11px] mt-0.5">
                          {v.purpose_label && (
                            <span className="text-muted-foreground">{v.purpose_label}</span>
                          )}
                          {v.outcome_label && (
                            <>
                              {v.purpose_label && <span className="text-muted-foreground mx-1">→</span>}
                              <span className="font-medium">{v.outcome_label}</span>
                            </>
                          )}
                        </p>
                        {v.notes_text && (
                          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{v.notes_text}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
