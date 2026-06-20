'use client'

/**
 * LocationMapButton — small chip on a list row that opens a modal
 * with the embedded OpenStreetMap. Designed for /field/team where
 * each rep has a "where they are right now" affordance.
 *
 * The chip itself renders the same compact label the listing used
 * to show (address or coords), but tapping it opens an inline map
 * + "Open in Google Maps" external link rather than navigating away.
 */
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MapPin, ExternalLink } from 'lucide-react'
import { OsmMap } from './osm-map'

export function LocationMapButton({
  lat,
  lng,
  label,
  source,
  repName,
}: {
  lat: number
  lng: number
  label: string | null
  source: 'visit' | 'check_in'
  repName?: string
}) {
  const [open, setOpen] = useState(false)
  const display = label ?? `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`
  const sourceLabel = source === 'visit' ? 'last visit' : 'check-in'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-xs text-blue-700 hover:underline truncate min-w-0 text-left"
        title={`Tap to view on map · ${sourceLabel}`}
      >
        <MapPin className="size-3.5 shrink-0" />
        <span className="truncate">{display}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="size-4 text-blue-700" />
              {repName ? `${repName} · ` : ''}
              <span className="truncate">{display}</span>
            </DialogTitle>
          </DialogHeader>

          <OsmMap lat={lat} lng={lng} aspect="wide" />

          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-[11px] text-muted-foreground italic">
              Pin: {sourceLabel}
            </p>
            <a
              href={`https://www.google.com/maps?q=${lat},${lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              Open in Google Maps
              <ExternalLink className="size-3" />
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
