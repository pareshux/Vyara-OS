/**
 * GET /field/team/attendance/export?period=…&start=…&end=…
 * Returns a CSV download of the same aggregation the page renders.
 * For HR-system import (Zoho People / Keka / GreytHR — they all accept
 * CSV) or any spreadsheet analysis.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTeamAttendance, repsToCsv, type AttendancePeriod } from '@/lib/read-models/team-attendance'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const sp = new URL(request.url).searchParams
  const period = (['week', 'month', 'custom'].includes(sp.get('period') ?? '') ? sp.get('period') : 'month') as AttendancePeriod
  const start = sp.get('start') ?? undefined
  const end = sp.get('end') ?? undefined

  const result = await getTeamAttendance(supabase, period, start, end)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 403 })
  }

  const csv = repsToCsv(result.data.reps)
  const filename = `field-team-attendance-${period}-${result.data.period.start_date}-to-${result.data.period.end_date}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
