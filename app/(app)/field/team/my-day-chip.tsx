'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { Play, MapPin, ChevronRight, Sun, CalendarOff, Home } from 'lucide-react'
import { CheckInCard } from '../check-in-card'
import { DayStatusPicker } from '../day-status-picker'

interface VehicleOption {
  id: string
  vehicle_number: string
  type_label: string
  fuel_label: string
  effective_rate_per_km: number | null
  rate_source: 'custom' | 'matrix' | 'none'
}

interface Props {
  myStatus:
    | { kind: 'not_started' }
    | { kind: 'on_duty'; check_in_at: string }
    | { kind: 'checked_out' }
    | { kind: 'wfh' | 'leave' | 'holiday' }
  vehicles: VehicleOption[]
  lastKnownOdometer: number | null
  tenantId: string
}

const STATUS_LABEL: Record<'wfh' | 'leave' | 'holiday', { label: string; icon: typeof Sun }> = {
  wfh: { label: 'Working from home', icon: Home },
  leave: { label: 'On leave', icon: CalendarOff },
  holiday: { label: 'Holiday', icon: Sun },
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  })
}

export function MyDayChip({ myStatus, vehicles, lastKnownOdometer, tenantId }: Props) {
  const [open, setOpen] = useState(false)

  if (myStatus.kind === 'on_duty') {
    return (
      <Link
        href="/field"
        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-800 px-3 py-1.5 text-xs hover:bg-emerald-100 transition-colors"
      >
        <MapPin className="size-3.5" />
        <span>On duty since <span className="tabular-nums font-medium">{formatTime(myStatus.check_in_at)}</span></span>
        <span className="hidden sm:inline opacity-70">· Open my day</span>
        <ChevronRight className="size-3" />
      </Link>
    )
  }

  if (myStatus.kind === 'checked_out') {
    return (
      <Link
        href="/field"
        className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 text-slate-700 px-3 py-1.5 text-xs hover:bg-slate-100 transition-colors"
      >
        <Sun className="size-3.5" />
        <span>Day done</span>
        <span className="hidden sm:inline opacity-70">· Review</span>
        <ChevronRight className="size-3" />
      </Link>
    )
  }

  if (myStatus.kind === 'wfh' || myStatus.kind === 'leave' || myStatus.kind === 'holiday') {
    const { label, icon: Icon } = STATUS_LABEL[myStatus.kind]
    return (
      <Link
        href="/field"
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-800 px-3 py-1.5 text-xs hover:bg-amber-100 transition-colors"
      >
        <Icon className="size-3.5" />
        <span>{label}</span>
        <ChevronRight className="size-3" />
      </Link>
    )
  }

  // not_started
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card text-foreground px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
        >
          <Play className="size-3.5 text-primary" />
          <span>Start my day</span>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Your day</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 mt-4">
          <CheckInCard
            vehicles={vehicles}
            lastKnownOdometer={lastKnownOdometer}
            tenantId={tenantId}
          />
          <DayStatusPicker mode="not-going-out" />
        </div>
      </SheetContent>
    </Sheet>
  )
}
