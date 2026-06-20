/**
 * Reverse geocoder — turn (lat, lng) into a short human-readable
 * address label. Used at write time in startVisit / checkIn /
 * checkOut so the UI shows "Bopal Road, Ahmedabad" instead of
 * "23.0263°, 72.5314°".
 *
 * Provider selection:
 *   1. Google Maps Geocoding API — used when GOOGLE_MAPS_API_KEY is
 *      set in env. India coverage down to building level; costs
 *      ~$5/1000 calls after the $200/month free credit (effectively
 *      free at Vyara's scale).
 *   2. OpenStreetMap Nominatim (fallback) — free, no key, but India
 *      data is sparse outside metros and often resolves to just
 *      state/district level for suburb coords.
 *
 * Failures are non-blocking: every caller treats a null return as
 * "no label" and falls back to coords. Never throws.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse'
const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json'
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
 *
 * Provider chosen at call time: Google when GOOGLE_MAPS_API_KEY is
 * present in env, Nominatim otherwise. The env check is per-call so
 * dropping in the key takes effect without a redeploy.
 */
export async function reverseGeocode(
  lat: number | null,
  lng: number | null,
): Promise<ReverseGeocodeResult | null> {
  if (lat == null || lng == null) return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const googleKey = process.env.GOOGLE_MAPS_API_KEY
  if (googleKey) {
    const fromGoogle = await reverseGeocodeGoogle(lat, lng, googleKey)
    if (fromGoogle) return fromGoogle
    // If Google fails (over quota, transient error) fall through to
    // Nominatim so the user gets *some* label rather than coords.
  }
  return reverseGeocodeNominatim(lat, lng)
}

async function reverseGeocodeNominatim(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult | null> {
  const url = new URL(NOMINATIM_URL)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  url.searchParams.set('zoom', '17')
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

type GoogleGeocodeResponse = {
  status: string
  results?: Array<{
    formatted_address?: string
    address_components?: Array<{
      long_name: string
      short_name: string
      types: string[]
    }>
  }>
}

async function reverseGeocodeGoogle(
  lat: number,
  lng: number,
  apiKey: string,
): Promise<ReverseGeocodeResult | null> {
  const url = new URL(GOOGLE_GEOCODE_URL)
  url.searchParams.set('latlng', `${lat},${lng}`)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('language', 'en')
  url.searchParams.set('region', 'in')
  // Prefer street-level results when available; the API ranks
  // by accuracy automatically.
  url.searchParams.set('result_type', 'street_address|premise|subpremise|neighborhood|sublocality|locality')

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(url.toString(), { signal: controller.signal, cache: 'no-store' })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = (await res.json()) as GoogleGeocodeResponse
    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      // If filtering yielded nothing, retry without result_type — get
      // *any* address, even if coarse.
      url.searchParams.delete('result_type')
      const retry = await fetch(url.toString(), { cache: 'no-store' })
      if (!retry.ok) return null
      const retryData = (await retry.json()) as GoogleGeocodeResponse
      if (retryData.status !== 'OK' || !retryData.results?.[0]) return null
      return shortenGoogleAddress(retryData.results[0].formatted_address ?? null)
    }
    return shortenGoogleAddress(data.results[0].formatted_address ?? null)
  } catch {
    return null
  }
}

/**
 * Google formatted_address looks like
 *   "5, Pumayabhoomi Society, VIP Rd, Vesu, Surat, Gujarat 395007, India"
 * Trim to the first 3 comma-separated parts → "5, Pumayabhoomi Society, VIP Rd"
 * — captures the locality without the long country/PIN tail.
 */
function shortenGoogleAddress(addr: string | null): ReverseGeocodeResult | null {
  if (!addr) return null
  const parts = addr.split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length === 0) return null
  const label = parts.slice(0, Math.min(parts.length, 3)).join(', ')
  return {
    label,
    road: null,
    neighbourhood: null,
    suburb: null,
    city: parts[parts.length - 3] ?? null,
    state: null,
    postcode: null,
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
