'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Play } from 'lucide-react'
import { checkIn } from '@/lib/actions/field-attendance'
import { OdometerInput } from './odometer-input'
import { LocationCaptureChip, type CapturedLocation } from './location-capture-chip'

interface VehicleOption {
  id: string
  vehicle_number: string
  type_label: string
  fuel_label: string
  effective_rate_per_km: number | null
  rate_source: 'custom' | 'matrix' | 'none'
}

/**
 * Stripped-down check-in card: one odometer field + Start day.
 * Vehicle is taken from the master assignment, silently — the rep
 * doesn't see or pick it. Last odometer pre-fills the field.
 */
export function CheckInCard({
  vehicles,
  lastKnownOdometer,
  tenantId,
}: {
  vehicles: VehicleOption[]
  lastKnownOdometer: number | null
  tenantId: string
}) {
  const router = useRouter()
  const [odometer, setOdometer] = useState<string>(
    lastKnownOdometer != null ? String(lastKnownOdometer) : '',
  )
  const [geo, setGeo] = useState<CapturedLocation | null>(null)
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  // Auto-pick: take the first assigned vehicle. No UI to choose.
  const vehicleId = vehicles[0]?.id ?? null

  function submit() {
    setErr(null)
    const n = Number(odometer)
    if (!Number.isFinite(n) || n < 0) { setErr('Enter your odometer reading'); return }
    if (lastKnownOdometer != null && n < lastKnownOdometer) {
      setErr(`Reading must be ≥ last recorded (${lastKnownOdometer.toLocaleString('en-IN')} km)`); return
    }
    startTransition(async () => {
      const r = await checkIn({
        vehicle_id: vehicleId,
        odometer_km: n,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
      })
      if ('error' in r) { setErr(r.error); toast.error(r.error); return }
      toast.success('Day started. Plan your visits below.')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardContent className="py-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="odo-in" className="text-xs">Odometer reading (km)</Label>
          <OdometerInput
            id="odo-in"
            value={odometer}
            onChange={setOdometer}
            min={lastKnownOdometer ?? 0}
            placeholder={lastKnownOdometer != null ? `≥ ${lastKnownOdometer.toLocaleString('en-IN')}` : 'e.g. 42 318'}
            tenantId={tenantId}
            autoFocus
          />
          {lastKnownOdometer != null && (
            <p className="text-[10px] text-muted-foreground tabular-nums">
              Pre-filled from your last reading. Snap a photo or type to confirm.
            </p>
          )}
        </div>

        {/* Location is optional — tucked under a single low-emphasis affordance. */}
        <LocationCaptureChip value={geo} onChange={setGeo} size="sm" />

        {err && <p className="text-xs text-destructive">{err}</p>}

        <Button onClick={submit} disabled={busy} className="h-12 text-base">
          {busy ? 'Starting…' : (
            <>
              <Play className="size-4 mr-2" /> Start day
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
