'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MapPin, MapPinOff, Car, LogIn, CheckCircle2, AlertCircle } from 'lucide-react'
import { checkIn } from '@/lib/actions/field-attendance'

interface VehicleOption {
  id: string
  vehicle_number: string
  type_label: string
  fuel_label: string
  effective_rate_per_km: number | null
  rate_source: 'custom' | 'matrix' | 'none'
}

export function CheckInCard({ vehicles }: { vehicles: VehicleOption[] }) {
  const router = useRouter()
  const hasOne = vehicles.length === 1
  const hasMany = vehicles.length > 1
  const hasNone = vehicles.length === 0

  // If multiple assigned vehicles, let the rep pick today's. Default to the
  // first one. If one, no picker — it's the vehicle for the day.
  const [vehicleId, setVehicleId] = useState<string>(vehicles[0]?.id ?? '')
  const [odometer, setOdometer] = useState<string>('')
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null)
  const [geoStatus, setGeoStatus] = useState<'idle' | 'capturing' | 'denied' | 'unavailable' | 'ok'>('idle')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) ?? null

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

    startTransition(async () => {
      const r = await checkIn({
        vehicle_id: hasNone ? null : (vehicleId || null),
        odometer_km: n,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
      })
      if ('error' in r) { setErr(r.error); toast.error(r.error); return }
      toast.success('Checked in. Have a good day on field!')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardContent className="py-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            <LogIn className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Start the day</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Note your odometer and check in — you can be anywhere.
            </p>
          </div>
        </div>

        {/* Vehicle — three states: none / one / many */}
        {hasNone && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            <div className="flex items-start gap-2">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">No vehicle assigned to you.</p>
                <p className="mt-0.5 text-amber-800">
                  You can still check in — your manager will set the claim amount manually at end of day.
                </p>
              </div>
            </div>
          </div>
        )}

        {hasOne && selectedVehicle && (
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Car className="size-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-sm">{selectedVehicle.vehicle_number}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {selectedVehicle.type_label} · {selectedVehicle.fuel_label}
                  {selectedVehicle.rate_source !== 'none' && (
                    <>
                      {' '}· ₹{selectedVehicle.effective_rate_per_km?.toFixed(2)}/km{' '}
                      <span className="italic">({selectedVehicle.rate_source})</span>
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {hasMany && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="vehicle" className="text-xs">Which vehicle today?</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger id="vehicle" className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    <span className="font-mono text-xs mr-2">{v.vehicle_number}</span>
                    <span className="text-muted-foreground">{v.type_label} · {v.fuel_label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedVehicle && selectedVehicle.rate_source !== 'none' && (
              <p className="text-[11px] text-muted-foreground tabular-nums">
                ₹{selectedVehicle.effective_rate_per_km?.toFixed(2)}/km{' '}
                <span className="italic">({selectedVehicle.rate_source})</span>
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="odo-in" className="text-xs">Odometer reading (km)</Label>
          <Input
            id="odo-in"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
            placeholder="e.g. 42 318"
            className="h-11 tabular-nums text-base"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-xs">Location</Label>
          {geoStatus === 'ok' && geo ? (
            <button
              type="button"
              onClick={captureLocation}
              className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2.5 text-left"
            >
              <CheckCircle2 className="size-4 shrink-0" />
              <span className="flex-1 tabular-nums">
                {geo.lat.toFixed(4)}°, {geo.lng.toFixed(4)}°
              </span>
              <span className="text-[10px] uppercase opacity-70">Tap to refresh</span>
            </button>
          ) : geoStatus === 'capturing' ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-lg border border-border px-3 py-2.5">
              <MapPin className="size-4 animate-pulse" />
              Capturing your location…
            </div>
          ) : geoStatus === 'denied' ? (
            <button
              type="button"
              onClick={captureLocation}
              className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2.5 text-left"
            >
              <MapPinOff className="size-4 shrink-0" />
              <span className="flex-1">Permission denied — tap to retry</span>
            </button>
          ) : geoStatus === 'unavailable' ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-lg border border-border px-3 py-2.5">
              <MapPinOff className="size-4" />
              Location unavailable on this device
            </div>
          ) : (
            <button
              type="button"
              onClick={captureLocation}
              className="flex items-center gap-2 text-sm rounded-lg border border-border px-3 py-2.5 text-left hover:bg-muted/30"
            >
              <MapPin className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1">Use my location <span className="text-[10px] text-muted-foreground italic ml-1">optional</span></span>
            </button>
          )}
        </div>

        {err && <p className="text-xs text-destructive">{err}</p>}

        <Button onClick={submit} disabled={busy} className="h-11 text-base">
          {busy ? 'Checking in…' : (
            <>
              <Car className="size-4 mr-2" /> Check in
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
