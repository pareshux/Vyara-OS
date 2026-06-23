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
import { PlusCircle } from 'lucide-react'
import { createPlannedVisit, startVisit, type SubjectSearchHit } from '@/lib/actions/field-visits'
import { SubjectPicker } from './subject-picker'
import { OdometerInput } from './odometer-input'
import { LocationCaptureChip, type CapturedLocation } from './location-capture-chip'

type Mode = 'plan' | 'start_now'

export function PlanOrStartVisitSheet({
  lastKnownOdometer,
  disableStartNow,
  tenantId,
}: {
  lastKnownOdometer: number | null
  disableStartNow: boolean
  tenantId: string
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
  const [geo, setGeo] = useState<CapturedLocation | null>(null)

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
    setErr(null)
  }

  function submit() {
    setErr(null)
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
          subject_type: subject?.type ?? null,
          subject_id: subject?.id ?? null,
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
        subject_type: subject?.type ?? null,
        subject_id: subject?.id ?? null,
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
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'plan' ? 'Plan a visit' : 'Just arrived'}</DialogTitle>
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
            <Label className="text-xs">Subject <span className="text-muted-foreground font-normal">— optional</span></Label>
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
                <OdometerInput
                  id="odo"
                  value={odometer}
                  onChange={setOdometer}
                  min={lastKnownOdometer ?? 0}
                  tenantId={tenantId}
                />
                {lastKnownOdometer != null && (
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    Pre-filled from last checkpoint: {lastKnownOdometer.toLocaleString('en-IN')} km
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Location</Label>
                <LocationCaptureChip value={geo} onChange={setGeo} />
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

// Default the datetime-local input to "now + 1 hour", rounded to the next 15 min.
// Edge case: if it's already after 7pm local, default to 10am tomorrow instead —
// planning a meeting "in 1 hour" at 11pm isn't realistic, and the resulting
// 1am due-time confuses the Today's-plan window the next morning.
function defaultDueAtLocal(): string {
  const now = new Date()
  let d: Date
  if (now.getHours() >= 19) {
    d = new Date(now)
    d.setDate(d.getDate() + 1)
    d.setHours(10, 0, 0, 0)
  } else {
    d = new Date(Date.now() + 60 * 60 * 1000)
    const m = d.getMinutes()
    d.setMinutes(Math.ceil(m / 15) * 15, 0, 0)
  }
  // Format for datetime-local input (local timezone, no Z)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
