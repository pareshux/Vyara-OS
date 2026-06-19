'use server'

/**
 * Client-callable reverse geocoder.
 *
 * The pure provider (lib/geo/reverse-geocode.ts) runs server-side at
 * write time (startVisit, checkIn, checkOut). This server action
 * exposes the same call to client components so the UI can show the
 * resolved address *before* the user hits Confirm — e.g. the visit-start
 * dialog and the check-in card both call this from the browser after
 * navigator.geolocation gives us coords.
 *
 * No auth or tenant scoping needed beyond "user is signed in" — the
 * function doesn't read or write tenant data; it's just a server-side
 * fetch to Nominatim (so the request goes from our IP, not the
 * client's, keeping the User-Agent stable for Nominatim ToS).
 */
import { reverseGeocode as runReverseGeocode } from '@/lib/geo/reverse-geocode'
import { createClient } from '@/lib/supabase/server'

export async function reverseGeocodeAction(
  lat: number | null,
  lng: number | null,
): Promise<{ ok: true; label: string | null } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const result = await runReverseGeocode(lat, lng)
  return { ok: true, label: result?.label ?? null }
}
