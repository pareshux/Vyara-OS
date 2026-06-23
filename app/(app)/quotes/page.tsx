import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText } from 'lucide-react'

export const dynamic = 'force-dynamic'

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  draft:    { bg: '#F3F4F6', text: '#6B7280', label: 'Draft' },
  sent:     { bg: '#FFFBEB', text: '#B45309', label: 'Sent' },
  revised:  { bg: '#EFF6FF', text: '#1D4ED8', label: 'Revised' },
  accepted: { bg: '#F0FDF4', text: '#15803D', label: 'Won' },
  rejected: { bg: '#FFF1F2', text: '#BE123C', label: 'Lost' },
  expired:  { bg: '#F3F4F6', text: '#6B7280', label: 'Expired' },
}

function formatINR(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function one<T>(x: T | T[] | null): T | null {
  return Array.isArray(x) ? (x[0] ?? null) : (x ?? null)
}

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { status: statusFilter } = await searchParams

  let q = supabase
    .from('quotation')
    .select(`
      id, quotation_number, status, total, created_at, valid_until, sent_at,
      project_id, lead_id, created_by,
      project:project_id(id, name),
      lead:lead_id(id, title, lead_number),
      sent_to_contact:sent_to_contact_id(id, full_name, firm:firm_id(name))
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200)

  if (statusFilter) q = q.eq('status', statusFilter)

  const { data: rawRows } = await q

  // Resolve creator names from user_profile (created_by → auth.users is outside PostgREST public schema)
  const creatorIds = [...new Set((rawRows ?? []).map((r) => (r as { created_by: string | null }).created_by).filter(Boolean))] as string[]
  const { data: creatorProfiles } = creatorIds.length > 0
    ? await supabase.from('user_profile').select('id, full_name').in('id', creatorIds)
    : { data: [] as Array<{ id: string; full_name: string }> }
  const creatorNameById = new Map((creatorProfiles ?? []).map((p) => [p.id, p.full_name]))

  const rows = (rawRows ?? []).map((r) => ({
    ...r,
    project: one(r.project as { id: string; name: string } | { id: string; name: string }[] | null),
    lead: one(r.lead as { id: string; title: string; lead_number: string } | { id: string; title: string; lead_number: string }[] | null),
    sent_to_contact: one(r.sent_to_contact as { id: string; full_name: string; firm: { name: string } | { name: string }[] | null } | null | { id: string; full_name: string; firm: { name: string } | { name: string }[] | null }[]),
    creator_name: creatorNameById.get((r as { created_by: string | null }).created_by ?? '') ?? null,
  }))

  const totalValue = rows.reduce((s, r) => s + Number(r.total ?? 0), 0)
  const openCount = rows.filter((r) => r.status === 'draft' || r.status === 'sent' || r.status === 'revised').length
  const wonValue = rows.filter((r) => r.status === 'accepted').reduce((s, r) => s + Number(r.total ?? 0), 0)

  const statusCounts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status as string] = (acc[r.status as string] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Quotes</h1>
          <p className="text-sm text-muted-foreground mt-0.5 tabular-nums">
            {rows.length} total · {openCount} open · {formatINR(wonValue)} won
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card size="sm">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Pipeline value</p>
            <p className="text-xl font-semibold tabular-nums mt-0.5">
              {formatINR(rows.filter(r => r.status === 'draft' || r.status === 'sent' || r.status === 'revised').reduce((s, r) => s + Number(r.total ?? 0), 0))}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Open quotes</p>
            <p className="text-xl font-semibold tabular-nums mt-0.5">{openCount}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Won value</p>
            <p className="text-xl font-semibold tabular-nums mt-0.5 text-primary">{formatINR(wonValue)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <Link
          href="/quotes"
          className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${!statusFilter ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}
        >
          All · {(rawRows ?? []).length}
        </Link>
        {Object.entries(STATUS_STYLES).map(([key, style]) => {
          const count = statusCounts[key] ?? 0
          if (count === 0) return null
          const isActive = statusFilter === key
          return (
            <Link
              key={key}
              href={isActive ? '/quotes' : `/quotes?status=${key}`}
              className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${isActive ? 'border-transparent text-white' : 'border-border text-muted-foreground hover:text-foreground'}`}
              style={isActive ? { backgroundColor: style.text } : {}}
            >
              {style.label} · {count}
            </Link>
          )
        })}
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <FileText className="size-8 mb-3 text-muted-foreground/40" />
          <p className="text-sm font-medium">No quotes{statusFilter ? ` with status "${STATUS_STYLES[statusFilter]?.label ?? statusFilter}"` : ''}</p>
          <p className="mt-1 text-sm text-muted-foreground">Quotes created from leads or projects will appear here.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Quote #</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                <th className="hidden px-3 py-2.5 text-left font-medium text-muted-foreground md:table-cell">Lead / Project</th>
                <th className="hidden px-3 py-2.5 text-left font-medium text-muted-foreground lg:table-cell">Sent to</th>
                <th className="hidden px-3 py-2.5 text-left font-medium text-muted-foreground lg:table-cell">Created by</th>
                <th className="hidden px-3 py-2.5 text-left font-medium text-muted-foreground xl:table-cell">Valid until</th>
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground tabular-nums">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const statusStyle = STATUS_STYLES[r.status as string] ?? STATUS_STYLES.draft
                const sentFirm = r.sent_to_contact ? one((r.sent_to_contact as { id: string; full_name: string; firm: { name: string } | { name: string }[] | null }).firm) : null
                const isExpiringSoon = r.valid_until && r.status === 'sent' &&
                  new Date(r.valid_until).getTime() - Date.now() < 7 * 86_400_000

                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2.5">
                      <Link href={`/quotes/${r.id}`} className="font-mono text-sm font-medium text-primary hover:underline">
                        {r.quotation_number}
                      </Link>
                      <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                        {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant="outline"
                        className="border-0 text-xs"
                        style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
                      >
                        {statusStyle.label}
                      </Badge>
                      {r.sent_at && r.status === 'sent' && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {new Date(r.sent_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </div>
                      )}
                    </td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      {r.project ? (
                        <div>
                          <Link href={`/projects/${r.project.id}`} className="text-foreground hover:underline">{r.project.name}</Link>
                          <div className="text-xs text-muted-foreground">Project</div>
                        </div>
                      ) : r.lead ? (
                        <div>
                          <Link href={`/leads/${r.lead.id}`} className="text-foreground hover:underline">{r.lead.title}</Link>
                          <div className="text-xs text-muted-foreground font-mono">{r.lead.lead_number}</div>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="hidden px-3 py-2.5 lg:table-cell">
                      {r.sent_to_contact ? (
                        <div>
                          <div className="text-foreground">{(r.sent_to_contact as { full_name: string }).full_name}</div>
                          {sentFirm && <div className="text-xs text-muted-foreground">{sentFirm.name}</div>}
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="hidden px-3 py-2.5 lg:table-cell text-muted-foreground">
                      {r.creator_name ?? '—'}
                    </td>
                    <td className="hidden px-3 py-2.5 xl:table-cell">
                      {r.valid_until ? (
                        <span className={`text-sm tabular-nums ${isExpiringSoon ? 'text-amber-700 font-medium' : 'text-muted-foreground'}`}>
                          {new Date(r.valid_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                      {r.total != null ? formatINR(Number(r.total)) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length >= 200 && (
        <p className="text-xs text-center text-muted-foreground">Showing latest 200 quotes.</p>
      )}
    </div>
  )
}
