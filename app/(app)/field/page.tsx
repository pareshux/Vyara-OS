import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Sun, MapPin, Car, Users } from 'lucide-react'
import { getTodayContext } from '@/lib/actions/field-attendance'
import { CheckInCard } from './check-in-card'
import { CheckOutCard } from './check-out-card'
import { DayStatusPicker } from './day-status-picker'
import { ClaimSummary } from './claim-summary'
import { VisitsSection } from './visits-section'

export const dynamic = 'force-dynamic'

const STATUS_LABELS: Record<string, string> = {
  on_duty: 'On duty',
  wfh: 'Working from home',
  leave: 'On leave',
  holiday: 'Holiday',
}

function firstName(full: string | null | undefined): string {
  if (!full) return 'there'
  return full.split(/\s+/)[0]
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })
}

function formatLongDate(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Kolkata',
  })
}

export default async function FieldPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('full_name, role')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')

  const ctxResult = await getTodayContext()
  if ('error' in ctxResult) {
    return (
      <div className="p-4 md:p-6 max-w-2xl">
        <Card><CardContent className="py-6 text-sm text-destructive">{ctxResult.error}</CardContent></Card>
      </div>
    )
  }

  const { date, attendance, vehicles, autoApproveThresholdRupees } = ctxResult
  const isAdminish = profile.role === 'admin' || profile.role === 'manager'

  // Effective rate for a vehicle: custom > matrix > null.
  // The list is already filtered to the rep's assigned vehicles.
  const vehiclesForUi = vehicles.map((v) => ({
    ...v,
    effective_rate_per_km: v.custom_rate_per_km ?? v.matrix_rate_per_km,
    rate_source: (v.custom_rate_per_km != null
      ? 'custom'
      : v.matrix_rate_per_km != null
        ? 'matrix'
        : 'none') as 'custom' | 'matrix' | 'none',
  }))

  const isOnDuty = attendance?.status_for_day === 'on_duty'
  const checkedIn = !!attendance?.check_in_at
  const checkedOut = !!attendance?.check_out_at
  const dayStatusLabel = attendance ? STATUS_LABELS[attendance.status_for_day] : null

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Sun className="size-5 text-amber-500" />
            Good morning, {firstName(profile.full_name)}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{formatLongDate(date)}</p>
        </div>
        {isAdminish && (
          <Link
            href="/field"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-1"
            aria-disabled
            tabIndex={-1}
          >
            <Users className="size-3.5" />
            <span className="italic">Team view — coming Step 6</span>
          </Link>
        )}
      </div>

      {/* ── State 1: nothing yet ──────────────────────────────── */}
      {!attendance && (
        <>
          <CheckInCard vehicles={vehiclesForUi} />
          <DayStatusPicker mode="not-going-out" />
        </>
      )}

      {/* ── State 2: marked WFH / leave / holiday ─────────────── */}
      {attendance && !isOnDuty && !checkedIn && (
        <Card>
          <CardContent className="py-5">
            <div className="flex items-start gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-muted shrink-0">
                <Sun className="size-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">You marked today as {dayStatusLabel?.toLowerCase()}.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Change your mind? Switch back to going on field.
                </p>
                <div className="mt-3">
                  <DayStatusPicker mode="undo" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── State 3: marked on_duty but no check-in yet ───────── */}
      {attendance && isOnDuty && !checkedIn && (
        <>
          <CheckInCard vehicles={vehiclesForUi} />
          <DayStatusPicker mode="not-going-out" />
        </>
      )}

      {/* ── State 4: checked in, on duty ──────────────────────── */}
      {attendance && checkedIn && !checkedOut && (
        <>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 shrink-0">
                  <MapPin className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">On duty</p>
                    <Badge variant="outline" className="text-[10px] uppercase border-0 bg-emerald-50 text-emerald-700">
                      Live
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                    Checked in at {formatTime(attendance.check_in_at)} ·{' '}
                    {attendance.check_in_odometer_km != null
                      ? `${attendance.check_in_odometer_km.toLocaleString('en-IN')} km`
                      : 'no odometer'}
                  </p>
                  {attendance.vehicle_id && (
                    <p className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                      <Car className="size-3" />
                      {vehiclesForUi.find((v) => v.id === attendance.vehicle_id)?.vehicle_number ?? '—'}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <VisitsSection checkInOdometerKm={attendance.check_in_odometer_km} />

          <CheckOutCard
            checkInOdometerKm={attendance.check_in_odometer_km}
            vehicleEffectiveRate={
              attendance.vehicle_id
                ? vehiclesForUi.find((v) => v.id === attendance.vehicle_id)?.effective_rate_per_km ?? null
                : null
            }
            autoApproveThresholdRupees={autoApproveThresholdRupees}
          />
        </>
      )}

      {/* ── State 5: checked out — day done ──────────────────── */}
      {attendance && checkedOut && (
        <ClaimSummary attendance={attendance} autoApproveThresholdRupees={autoApproveThresholdRupees} />
      )}
    </div>
  )
}
