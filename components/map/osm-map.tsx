/**
 * OsmMap — iframe-based OpenStreetMap embed with a single pin.
 *
 * Free, no API key. Renders an iframe pointing at
 * openstreetmap.org/export/embed.html so we don't pull in Leaflet or
 * a tile-rendering JS library for the MVP.
 *
 * Swap path to Google Maps Embed API (when we need clusters, traffic,
 * directions): replace the iframe `src` builder with Google's URL
 * scheme and add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to env. Same
 * component contract.
 *
 * Server component — no state, no JS. Embedded anywhere.
 */

export type OsmMapProps = {
  lat: number
  lng: number
  /** Half-width of the bounding box in degrees. 0.01 ≈ ~1 km box at
   *  India's latitude — comfortable street-and-neighbourhood view.
   *  Smaller (0.003) = building-level. Larger (0.05) = whole city. */
  delta?: number
  /** Aspect ratio: 'square' (1:1) for thumbnails, 'wide' (16:9) for
   *  full-width detail strips, 'tall' (3:4) for modals on mobile. */
  aspect?: 'square' | 'wide' | 'tall'
  className?: string
}

export function OsmMap({ lat, lng, delta = 0.01, aspect = 'wide', className }: OsmMapProps) {
  // bbox = west,south,east,north  (longitude/lng on west/east, lat on south/north)
  const west = lng - delta
  const east = lng + delta
  const south = lat - delta
  const north = lat + delta
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${west}%2C${south}%2C${east}%2C${north}&layer=mapnik&marker=${lat}%2C${lng}`

  const aspectClass =
    aspect === 'square' ? 'aspect-square' :
    aspect === 'tall' ? 'aspect-[3/4]' :
    'aspect-[16/9]'

  return (
    <div className={`relative w-full ${aspectClass} overflow-hidden rounded-lg border border-border bg-muted ${className ?? ''}`}>
      <iframe
        src={src}
        className="absolute inset-0 size-full"
        loading="lazy"
        referrerPolicy="no-referrer"
        title="Location map"
      />
    </div>
  )
}
