'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MapPin, MapPinOff, CheckCircle2, Play } from 'lucide-react'
import { checkIn } from '@/lib/actions/field-attendance'

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
}: {
  vehicles: VehicleOption[]
  lastKnownOdometer: number | null
}) {
  const router = useRouter()
  const [odometer, setOdometer] = useState<string>(
    lastKnownOdometer != null ? String(lastKnownOdometer) : '',
  )
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null)
  const [geoStatus, setGeoStatus] = useState<'idle' | 'capturing' | 'denied' | 'unavailable' | 'ok'>('idle')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  // Auto-pick: take the first assigned vehicle. No UI to choose.
  const vehicleId = vehicles[0]?.id ?? null

  function captureLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoStatus('unavailable')
      return
    }
    setGeoStatus('capturing')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGeoStatus('ok')
      },
      (e) => {
        setGeoStatus(e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable')
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }

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
          <Input
            id="odo-in"
            type="number"
            inputMode="numeric"
            min={lastKnownOdometer ?? 0}
            step={1}
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
            placeholder={lastKnownOdometer != null ? `≥ ${lastKnownOdometer.toLocaleString('en-IN')}` : 'e.g. 42 318'}
            className="h-11 tabular-nums text-base"
            autoFocus
          />
          {lastKnownOdometer != null && (
            <p className="text-[10px] text-muted-foreground tabular-nums">
              Pre-filled from your last reading. Edit if it changed.
            </p>
          )}
        </div>

        {/* Location is optional — tucked under a single low-emphasis affordance. */}
        {geoStatus === 'ok' && geo ? (
          <button
            type="button"
            onClick={captureLocation}
            className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 text-left"
          >
            <CheckCircle2 className="size-3.5 shrink-0" />
            <span className="flex-1 tabular-nums">{geo.lat.toFixed(4)}°, {geo.lng.toFixed(4)}°</span>
            <span className="text-[10px] uppercase opacity-70">Refresh</span>
          </button>
        ) : geoStatus === 'capturing' ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-lg border border-border px-3 py-2">
            <MapPin className="size-3.5 animate-pulse" /> Capturing location…
          </div>
        ) : geoStatus === 'denied' ? (
          <button
            type="button"
            onClick={captureLocation}
            className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 text-left"
          >
            <MapPinOff className="size-3.5 shrink-0" />
            <span className="flex-1">Location permission denied — tap to retry</span>
          </button>
        ) : geoStatus === 'unavailable' ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-lg border border-border px-3 py-2">
            <MapPinOff className="size-3.5" /> Location unavailable
          </div>
        ) : (
          <button
            type="button"
            onClick={captureLocation}
            className="flex items-center gap-2 text-xs rounded-lg border border-border px-3 py-2 text-left hover:bg-muted/30 text-muted-foreground"
          >
            <MapPin className="size-3.5 shrink-0" />
            <span className="flex-1">Tag location <span className="italic ml-1">optional</span></span>
          </button>
        )}

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
