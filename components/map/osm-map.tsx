/**
 * OsmMap — iframe-based map embed with a single pin.
 *
 * Provider selection (per render):
 *   1. Google Maps Embed API — used when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
 *      is set. Same pin, much better India tile detail. The Maps Embed
 *      API is *free* (no per-call billing), just needs a key with the
 *      "Maps Embed API" enabled.
 *   2. OpenStreetMap (fallback) — free, no key, but India tile detail
 *      is sparse outside metros.
 *
 * Server component — no state, no JS.
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
  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  // Google Maps Embed: cleaner tiles for India. Zoom is logarithmic;
  // 15 ≈ neighbourhood, 17 ≈ street, 18 ≈ building.
  const src = googleKey
    ? `https://www.google.com/maps/embed/v1/place?key=${googleKey}&q=${lat},${lng}&zoom=16`
    : (() => {
        const west = lng - delta
        const east = lng + delta
        const south = lat - delta
        const north = lat + delta
        return `https://www.openstreetmap.org/export/embed.html?bbox=${west}%2C${south}%2C${east}%2C${north}&layer=mapnik&marker=${lat}%2C${lng}`
      })()

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
        allowFullScreen
      />
    </div>
  )
}
