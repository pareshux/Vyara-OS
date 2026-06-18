'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Play, MapPin, MapPinOff, CheckCircle2 } from 'lucide-react'
import { startVisit } from '@/lib/actions/field-visits'
import { OdometerInput } from './odometer-input'

export function StartPlannedVisitButton({
  taskId,
  subjectLabel,
  lastKnownOdometer,
  disabled,
  tenantId,
}: {
  taskId: string
  subjectLabel: string
  lastKnownOdometer: number | null
  disabled: boolean
  tenantId: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [odometer, setOdometer] = useState<string>(lastKnownOdometer != null ? String(lastKnownOdometer) : '')
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null)
  const [geoStatus, setGeoStatus] = useState<'idle' | 'capturing' | 'denied' | 'unavailable' | 'ok'>('idle')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function captureLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setGeoStatus('unavailable'); return }
    setGeoStatus('capturing')
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoStatus('ok') },
      (e) => { setGeoStatus(e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable') },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  function submit() {
    setErr(null)
    const n = Number(odometer)
    if (!Number.isFinite(n) || n < 0) { setErr('Enter your odometer reading'); return }
    startTransition(async () => {
      const r = await startVisit({
        planned_task_id: taskId,
        odometer_km_at_arrival: n,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
      })
      if ('error' in r) { setErr(r.error); toast.error(r.error); return }
      toast.success(`Started — ${subjectLabel}`); setOpen(false); router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={disabled}>
          <Play className="size-3.5 mr-1.5" /> Visit started
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Visit started · {subjectLabel}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="odo" className="text-xs">Odometer at arrival (km)</Label>
            <OdometerInput
              id="odo"
              value={odometer}
              onChange={setOdometer}
              min={lastKnownOdometer ?? 0}
              placeholder={lastKnownOdometer != null ? `≥ ${lastKnownOdometer.toLocaleString('en-IN')}` : 'reading'}
              tenantId={tenantId}
              autoFocus
            />
            {lastKnownOdometer != null && (
              <p className="text-[10px] text-muted-foreground tabular-nums">
                Pre-filled from last checkpoint: {lastKnownOdometer.toLocaleString('en-IN')} km. Per-leg km computes after you save.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
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
                <MapPinOff className="size-4 shrink-0" /> Permission denied — tap to retry
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

          {err && <p className="text-xs text-destructive">{err}</p>}

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? 'Saving…' : 'Confirm'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
