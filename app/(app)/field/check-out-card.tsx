'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MapPin, MapPinOff, LogOut, CheckCircle2 } from 'lucide-react'
import { checkOut } from '@/lib/actions/field-attendance'

export function CheckOutCard({
  checkInOdometerKm,
  vehicleEffectiveRate,
  autoApproveThresholdRupees,
}: {
  checkInOdometerKm: number | null
  vehicleEffectiveRate: number | null
  autoApproveThresholdRupees: number
}) {
  const router = useRouter()
  const [odometer, setOdometer] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null)
  const [geoStatus, setGeoStatus] = useState<'idle' | 'capturing' | 'denied' | 'unavailable' | 'ok'>('idle')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  // Live claim preview as the rep types the odometer.
  const preview = useMemo(() => {
    const n = Number(odometer)
    if (!Number.isFinite(n) || checkInOdometerKm == null) return null
    const km = Math.max(0, Math.round(n) - checkInOdometerKm)
    const amount = vehicleEffectiveRate != null
      ? Math.round(vehicleEffectiveRate * km * 100) / 100
      : null
    return { km, amount }
  }, [odometer, checkInOdometerKm, vehicleEffectiveRate])

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
    if (checkInOdometerKm != null && n < checkInOdometerKm) {
      setErr(`Reading must be ≥ check-in (${checkInOdometerKm.toLocaleString('en-IN')} km)`); return
    }
    startTransition(async () => {
      const r = await checkOut({
        odometer_km: n,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        notes: notes.trim() || null,
      })
      if ('error' in r) { setErr(r.error); toast.error(r.error); return }
      toast.success(
        r.auto_approved
          ? `Checked out — ₹${r.amount?.toFixed(2)} auto-approved.`
          : `Checked out — ₹${r.amount?.toFixed(2) ?? '–'} ready to submit.`,
      )
      router.refresh()
    })
  }

  return (
    <Card>
      <CardContent className="py-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            <LogOut className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Check out</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Wrapping up? Note your odometer; we'll compute the claim.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="odo-out" className="text-xs">Odometer reading (km)</Label>
          <Input
            id="odo-out"
            type="number"
            inputMode="numeric"
            min={checkInOdometerKm ?? 0}
            step={1}
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
            placeholder={checkInOdometerKm != null ? `≥ ${checkInOdometerKm.toLocaleString('en-IN')}` : 'e.g. 42 418'}
            className="h-11 tabular-nums text-base"
          />
          {preview && (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs tabular-nums">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Distance today</span>
                <span className="font-medium">{preview.km.toLocaleString('en-IN')} km</span>
              </div>
              {vehicleEffectiveRate != null ? (
                <>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-muted-foreground">Rate</span>
                    <span className="text-muted-foreground">₹{vehicleEffectiveRate.toFixed(2)}/km</span>
                  </div>
                  <div className="flex justify-between mt-1 pt-1 border-t border-border">
                    <span className="font-medium">Claim</span>
                    <span className="font-semibold">₹{preview.amount?.toFixed(2)}</span>
                  </div>
                  {preview.amount != null && preview.amount <= autoApproveThresholdRupees && (
                    <p className="mt-1 text-[10px] text-emerald-700">
                      Under ₹{autoApproveThresholdRupees} — auto-approved on check-out.
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-[10px] italic text-muted-foreground">
                  No rate configured for this vehicle — manager will set the claim manually.
                </p>
              )}
            </div>
          )}
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
              <span className="flex-1 tabular-nums">{geo.lat.toFixed(4)}°, {geo.lng.toFixed(4)}°</span>
              <span className="text-[10px] uppercase opacity-70">Refresh</span>
            </button>
          ) : geoStatus === 'capturing' ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-lg border border-border px-3 py-2.5">
              <MapPin className="size-4 animate-pulse" /> Capturing…
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
              <MapPinOff className="size-4" /> Location unavailable
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

        <div className="flex flex-col gap-2">
          <Label htmlFor="notes" className="text-xs">Notes for today <span className="text-muted-foreground">— optional</span></Label>
          <Textarea
            id="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything the manager should know"
          />
        </div>

        {err && <p className="text-xs text-destructive">{err}</p>}

        <Button onClick={submit} disabled={busy} className="h-11 text-base">
          {busy ? 'Wrapping up…' : (
            <>
              <LogOut className="size-4 mr-2" /> Check out
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
