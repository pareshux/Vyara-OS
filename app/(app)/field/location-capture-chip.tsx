'use client'

/**
 * LocationCaptureChip — single tap captures the rep's GPS, fires a
 * reverse-geocode against Nominatim, and shows the resolved address
 * ("Bopal Rd, Ahmedabad") instead of raw coords. Falls back to coords
 * if the geocode fails.
 *
 * Shared by the field surfaces that capture a location:
 *   - CheckInCard, CheckOutCard
 *   - PlanOrStartVisitSheet (start-now arrival)
 *   - StartPlannedVisitButton
 *
 * Contract: parent reads `value` (the captured point) and passes
 * lat/lng to the eventual server action. The chip owns its visual
 * state (idle / capturing / ok / denied / unavailable).
 */
import { useState } from 'react'
import { MapPin, MapPinOff, CheckCircle2 } from 'lucide-react'
import { reverseGeocodeAction } from '@/lib/actions/reverse-geocode'

export type CapturedLocation = {
  lat: number
  lng: number
  label: string | null
}

export function LocationCaptureChip({
  value,
  onChange,
  size = 'md',
}: {
  value: CapturedLocation | null
  onChange: (v: CapturedLocation | null) => void
  size?: 'sm' | 'md'
}) {
  const [status, setStatus] = useState<
    'idle' | 'capturing' | 'denied' | 'unavailable' | 'ok'
  >(value ? 'ok' : 'idle')

  function capture() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable')
      return
    }
    setStatus('capturing')
    onChange(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        onChange({ lat, lng, label: null })
        setStatus('ok')
        // Resolve the address in the background. Don't block the UI.
        reverseGeocodeAction(lat, lng)
          .then((r) => {
            if (r.ok && r.label) onChange({ lat, lng, label: r.label })
          })
          .catch(() => { /* leave label null — UI falls back to coords */ })
      },
      (e) => {
        setStatus(e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable')
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  // Padding / font sizes per size variant.
  const padding = size === 'sm' ? 'px-3 py-2' : 'px-3 py-2.5'
  const text = size === 'sm' ? 'text-xs' : 'text-sm'
  const iconSize = size === 'sm' ? 'size-3.5' : 'size-4'

  if (status === 'ok' && value) {
    return (
      <button
        type="button"
        onClick={capture}
        className={`flex items-center gap-2 ${text} text-emerald-700 bg-emerald-50 rounded-lg ${padding} text-left w-full`}
      >
        <CheckCircle2 className={`${iconSize} shrink-0`} />
        <span className="flex-1 min-w-0 truncate">
          {value.label ?? (
            <span className="tabular-nums">
              {value.lat.toFixed(4)}°, {value.lng.toFixed(4)}°
            </span>
          )}
        </span>
        <span className="text-[10px] uppercase opacity-70 shrink-0">Refresh</span>
      </button>
    )
  }

  if (status === 'capturing') {
    return (
      <div className={`flex items-center gap-2 ${text} text-muted-foreground rounded-lg border border-border ${padding}`}>
        <MapPin className={`${iconSize} animate-pulse`} /> Capturing…
      </div>
    )
  }

  if (status === 'denied') {
    return (
      <button
        type="button"
        onClick={capture}
        className={`flex items-center gap-2 ${text} text-amber-700 bg-amber-50 rounded-lg ${padding} text-left w-full`}
      >
        <MapPinOff className={`${iconSize} shrink-0`} />
        <span className="flex-1">Permission denied — tap to retry</span>
      </button>
    )
  }

  if (status === 'unavailable') {
    return (
      <div className={`flex items-center gap-2 ${text} text-muted-foreground rounded-lg border border-border ${padding}`}>
        <MapPinOff className={iconSize} /> Location unavailable
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={capture}
      className={`flex items-center gap-2 ${text} rounded-lg border border-border ${padding} text-left w-full hover:bg-muted/30`}
    >
      <MapPin className={`${iconSize} shrink-0 text-muted-foreground`} />
      <span className="flex-1">
        Use my location <span className="text-[10px] text-muted-foreground italic ml-1">optional</span>
      </span>
    </button>
  )
}
