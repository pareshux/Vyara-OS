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
import { Play } from 'lucide-react'
import { startVisit } from '@/lib/actions/field-visits'
import { OdometerInput } from './odometer-input'
import { LocationCaptureChip, type CapturedLocation } from './location-capture-chip'

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
  const [geo, setGeo] = useState<CapturedLocation | null>(null)
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

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
            <LocationCaptureChip value={geo} onChange={setGeo} />
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
