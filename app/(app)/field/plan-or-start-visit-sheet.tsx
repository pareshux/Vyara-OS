'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PlusCircle, MapPin, MapPinOff, CheckCircle2 } from 'lucide-react'
import { createPlannedVisit, startVisit, type SubjectSearchHit } from '@/lib/actions/field-visits'
import { SubjectPicker } from './subject-picker'

type Mode = 'plan' | 'start_now'

export function PlanOrStartVisitSheet({
  lastKnownOdometer,
  disableStartNow,
}: {
  lastKnownOdometer: number | null
  disableStartNow: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>(disableStartNow ? 'plan' : 'start_now')
  const [subject, setSubject] = useState<SubjectSearchHit | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState<string>(defaultDueAtLocal())
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium')

  // start_now extras
  const [odometer, setOdometer] = useState<string>(lastKnownOdometer != null ? String(lastKnownOdometer) : '')
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null)
  const [geoStatus, setGeoStatus] = useState<'idle' | 'capturing' | 'denied' | 'unavailable' | 'ok'>('idle')

  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function reset() {
    setMode(disableStartNow ? 'plan' : 'start_now')
    setSubject(null)
    setTitle('')
    setDescription('')
    setDueAt(defaultDueAtLocal())
    setPriority('medium')
    setOdometer(lastKnownOdometer != null ? String(lastKnownOdometer) : '')
    setGeo(null)
    setGeoStatus('idle')
    setErr(null)
  }

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
    if (!subject) { setErr('Pick a project / lead / firm / dealer'); return }
    if (!title.trim()) { setErr('Give the visit a short title'); return }

    if (mode === 'plan') {
      // Plan for later — create planned_visit task only.
      const dueIso = new Date(dueAt).toISOString()
      startTransition(async () => {
        const r = await createPlannedVisit({
          title: title.trim(),
          description: description.trim() || null,
          due_at: dueIso,
          priority,
          subject_type: subject.type,
          subject_id: subject.id,
        })
        if ('error' in r) { setErr(r.error); toast.error(r.error); return }
        toast.success('Planned'); setOpen(false); reset(); router.refresh()
      })
      return
    }

    // start_now — create planned_visit task (due now) AND immediately start.
    const n = Number(odometer)
    if (!Number.isFinite(n) || n < 0) { setErr('Enter your odometer reading'); return }

    startTransition(async () => {
      const plan = await createPlannedVisit({
        title: title.trim(),
        description: description.trim() || null,
        due_at: new Date().toISOString(),
        priority,
        subject_type: subject.type,
        subject_id: subject.id,
      })
      if ('error' in plan) { setErr(plan.error); toast.error(plan.error); return }
      const started = await startVisit({
        planned_task_id: plan.task_id,
        odometer_km_at_arrival: n,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
      })
      if ('error' in started) { setErr(started.error); toast.error(started.error); return }
      toast.success('Visit started'); setOpen(false); reset(); router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <PlusCircle className="size-3.5 mr-1.5" /> Add a visit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'plan' ? 'Plan a visit' : 'Visit started'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {/* Mode switch */}
          <div className="flex rounded-lg bg-muted p-1 text-xs">
            <button
              type="button"
              className={`flex-1 rounded-md px-2 py-1.5 transition-colors ${
                mode === 'start_now' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground'
              }`}
              onClick={() => setMode('start_now')}
              disabled={disableStartNow}
            >
              I just arrived
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md px-2 py-1.5 transition-colors ${
                mode === 'plan' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground'
              }`}
              onClick={() => setMode('plan')}
            >
              Plan for later
            </button>
          </div>
          {disableStartNow && mode === 'plan' && (
            <p className="text-[10px] text-muted-foreground italic">
              A visit is in progress — wrap that up before logging a new arrival.
            </p>
          )}

          {/* Subject */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Subject</Label>
            <SubjectPicker selected={subject} onSelect={setSubject} />
          </div>

          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title" className="text-xs">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={subject ? `Meet ${subject.label}` : 'e.g. discuss BOQ pricing'}
            />
          </div>

          {/* Description (plan only) */}
          {mode === 'plan' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="desc" className="text-xs">Description <span className="text-muted-foreground">— optional</span></Label>
              <Textarea id="desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          )}

          {/* Plan-specific: due + priority */}
          {mode === 'plan' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="due" className="text-xs">When</Label>
                <Input id="due" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* start_now extras */}
          {mode === 'start_now' && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="odo" className="text-xs">Odometer at arrival (km)</Label>
                <Input
                  id="odo"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={odometer}
                  onChange={(e) => setOdometer(e.target.value)}
                  className="tabular-nums"
                />
                {lastKnownOdometer != null && (
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    Pre-filled from last checkpoint: {lastKnownOdometer.toLocaleString('en-IN')} km
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Location</Label>
                <GeoButton geo={geo} status={geoStatus} onClick={captureLocation} />
              </div>
            </>
          )}

          {err && <p className="text-xs text-destructive">{err}</p>}

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? 'Saving…' : mode === 'plan' ? 'Save plan' : 'Confirm'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function GeoButton({
  geo, status, onClick,
}: {
  geo: { lat: number; lng: number } | null
  status: 'idle' | 'capturing' | 'denied' | 'unavailable' | 'ok'
  onClick: () => void
}) {
  if (status === 'ok' && geo) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2.5 text-left"
      >
        <CheckCircle2 className="size-4 shrink-0" />
        <span className="flex-1 tabular-nums">{geo.lat.toFixed(4)}°, {geo.lng.toFixed(4)}°</span>
        <span className="text-[10px] uppercase opacity-70">Refresh</span>
      </button>
    )
  }
  if (status === 'capturing') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-lg border border-border px-3 py-2.5">
        <MapPin className="size-4 animate-pulse" /> Capturing…
      </div>
    )
  }
  if (status === 'denied') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2.5 text-left"
      >
        <MapPinOff className="size-4 shrink-0" />
        <span className="flex-1">Permission denied — tap to retry</span>
      </button>
    )
  }
  if (status === 'unavailable') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-lg border border-border px-3 py-2.5">
        <MapPinOff className="size-4" /> Location unavailable
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 text-sm rounded-lg border border-border px-3 py-2.5 text-left hover:bg-muted/30"
    >
      <MapPin className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex-1">Use my location <span className="text-[10px] text-muted-foreground italic ml-1">optional</span></span>
    </button>
  )
}

// Default the datetime-local input to "now + 1 hour", rounded to the next 15 min.
function defaultDueAtLocal(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  const m = d.getMinutes()
  d.setMinutes(Math.ceil(m / 15) * 15, 0, 0)
  // Format for datetime-local input (local timezone, no Z)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
