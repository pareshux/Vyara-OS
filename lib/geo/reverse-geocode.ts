/**
 * Reverse geocoder — turn (lat, lng) into a short human-readable
 * address label. Used at write time in startVisit / checkIn /
 * checkOut so the UI shows "Bopal Road, Ahmedabad" instead of
 * "23.0263°, 72.5314°".
 *
 * Provider: OpenStreetMap Nominatim — free, India coverage is
 * solid, no API key. Constraints per Nominatim ToS:
 *   - max 1 request per second from a given source
 *   - User-Agent header identifying the app
 *   - non-commercial / fair use
 *
 * We swap to a paid provider (Google, Mapbox) the day Vyara scales
 * past ~50 reps × ~10 visits/day = 500 geocodes/day — well above the
 * fair-use ceiling. Until then, free is the right call.
 *
 * Failures are non-blocking: every caller treats a null return as
 * "no label" and falls back to coords. Never throws.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse'
const USER_AGENT = 'VyaraOS/1.0 (vyara-os.app field-ops)'

export type ReverseGeocodeResult = {
  label: string
  // Components in case callers want to render parts differently.
  road: string | null
  neighbourhood: string | null
  suburb: string | null
  city: string | null
  state: string | null
  postcode: string | null
}

type NominatimResponse = {
  display_name?: string
  address?: {
    road?: string
    neighbourhood?: string
    suburb?: string
    locality?: string
    village?: string
    town?: string
    city?: string
    state?: string
    state_district?: string
    county?: string
    postcode?: string
    country?: string
  }
  error?: string
}

/**
 * Reverse-geocode a single point. Returns null on any failure (network,
 * non-200, parsing, no useful fields). Never throws.
 */
export async function reverseGeocode(
  lat: number | null,
  lng: number | null,
): Promise<ReverseGeocodeResult | null> {
  if (lat == null || lng == null) return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const url = new URL(NOMINATIM_URL)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  url.searchParams.set('zoom', '17') // street-level
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('accept-language', 'en')

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = (await res.json()) as NominatimResponse
    if (data.error) return null
    return buildLabel(data)
  } catch {
    return null
  }
}

function buildLabel(d: NominatimResponse): ReverseGeocodeResult | null {
  const a = d.address ?? {}
  const road = a.road ?? null
  const neighbourhood = a.neighbourhood ?? a.suburb ?? null
  const suburb = a.suburb ?? null
  const city = a.city ?? a.town ?? a.village ?? a.locality ?? null
  const state = a.state ?? a.state_district ?? null

  // Short label = first 2 most-specific non-null parts.
  // Examples:
  //   "Bopal Road, Ahmedabad"
  //   "Sector 17, Chandigarh"
  //   "Andheri West, Mumbai"
  const parts: string[] = []
  if (road) parts.push(road)
  else if (neighbourhood) parts.push(neighbourhood)
  if (city && !parts.includes(city)) parts.push(city)
  else if (state && parts.length === 0) parts.push(state)

  if (parts.length === 0) {
    if (d.display_name) {
      // Last resort — first 2 comma-separated chunks of the long name.
      const chunks = d.display_name.split(',').map((s) => s.trim()).filter(Boolean)
      if (chunks.length >= 2) return {
        label: `${chunks[0]}, ${chunks[1]}`,
        road: null, neighbourhood: null, suburb: null, city: null, state: null, postcode: null,
      }
      if (chunks.length === 1) return {
        label: chunks[0],
        road: null, neighbourhood: null, suburb: null, city: null, state: null, postcode: null,
      }
    }
    return null
  }

  return {
    label: parts.join(', '),
    road,
    neighbourhood,
    suburb,
    city,
    state,
    postcode: a.postcode ?? null,
  }
}
