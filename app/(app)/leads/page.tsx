import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Users, LayoutGrid, List as ListIcon, Filter } from 'lucide-react'
import { LeadKanban } from './kanban'

export const dynamic = 'force-dynamic'

const SEG_LABELS: Record<string, string> = {
  architect: 'Architect',
  dealer: 'Dealer',
  tender: 'Tender',
  retail: 'Retail',
  government: 'Government',
  corporate: 'Corporate',
  generic: 'Generic',
}

type SearchParams = { [k: string]: string | string[] | undefined }

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const view = (typeof params.view === 'string' ? params.view : 'list') as 'list' | 'pipeline'
  const stageFilter = typeof params.stage === 'string' ? params.stage : null
  const ownerFilter = typeof params.owner === 'string' ? params.owner : null

  const [{ data: stages }, { data: sources }, { data: owners }] = await Promise.all([
    supabase
      .from('lead_stage')
      .select('id, stage_key, label, order_index, color, is_terminal, is_won, is_lost')
      .or('tenant_id.is.null')
      .order('order_index'),
    supabase.from('lead_source').select('id, code, label').is('deleted_at', null).order('sort_order'),
    supabase
      .from('user_profile')
      .select('id, full_name, role')
      .eq('is_active', true)
      .in('role', ['admin', 'manager', 'sales_engineer'])
      .order('full_name'),
  ])

  let q = supabase
    .from('lead')
    .select(
      `id, lead_number, title, segment, estimated_value, expected_close_at,
       contact_name_raw, contact_phone_raw, city, created_at, last_activity_at, won_at, lost_at,
       stage:current_stage_id(id, stage_key, label, color, order_index, is_terminal, is_won, is_lost),
       source:source_id(id, code, label),
       owner:owner_id(id, full_name)`
    )
    .is('deleted_at', null)
    .order('last_activity_at', { ascending: false })
    .limit(200)
  if (stageFilter) q = q.eq('current_stage_id', stageFilter)
  if (ownerFilter) q = q.eq('owner_id', ownerFilter)
  const { data: leadsRaw } = await q

  type LeadRow = {
    id: string
    lead_number: string
    title: string
    segment: string
    estimated_value: number | null
    expected_close_at: string | null
    contact_name_raw: string | null
    contact_phone_raw: string | null
    city: string | null
    created_at: string
    last_activity_at: string
    won_at: string | null
    lost_at: string | null
    stage: { id: string; stage_key: string; label: string; color: string; order_index: number; is_terminal: boolean; is_won: boolean; is_lost: boolean } | null
    source: { id: string; code: string; label: string } | null
    owner: { id: string; full_name: string } | null
  }
  const normalize = (r: unknown): LeadRow => {
    const obj = r as Record<string, unknown> & {
      stage?: unknown
      source?: unknown
      owner?: unknown
    }
    const stage = Array.isArray(obj.stage) ? obj.stage[0] : obj.stage
    const source = Array.isArray(obj.source) ? obj.source[0] : obj.source
    const owner = Array.isArray(obj.owner) ? obj.owner[0] : obj.owner
    return {
      ...(obj as unknown as Omit<LeadRow, 'stage' | 'source' | 'owner'>),
      stage: (stage as LeadRow['stage']) ?? null,
      source: (source as LeadRow['source']) ?? null,
      owner: (owner as LeadRow['owner']) ?? null,
    }
  }
  const leads: LeadRow[] = ((leadsRaw ?? []) as unknown[]).map(normalize)

  const totalCount = leads.length
  const pipelineValue = leads
    .filter((l) => l.stage && !l.stage.is_terminal)
    .reduce((s, l) => s + Number(l.estimated_value ?? 0), 0)
  const wonValue = leads
    .filter((l) => l.stage?.is_won)
    .reduce((s, l) => s + Number(l.estimated_value ?? 0), 0)
  const lostValue = leads
    .filter((l) => l.stage?.is_lost)
    .reduce((s, l) => s + Number(l.estimated_value ?? 0), 0)

  function qs(patch: Record<string, string | null>) {
    const sp = new URLSearchParams()
    if (view) sp.set('view', view)
    if (stageFilter) sp.set('stage', stageFilter)
    if (ownerFilter) sp.set('owner', ownerFilter)
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) sp.delete(k)
      else sp.set(k, v)
    }
    const s = sp.toString()
    return s ? `?${s}` : ''
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Users className="size-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Leads</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {totalCount} total · ₹{pipelineValue.toLocaleString('en-IN')} pipeline · ₹{wonValue.toLocaleString('en-IN')} won
            {lostValue > 0 && <> · ₹{lostValue.toLocaleString('en-IN')} lost</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/leads${qs({ view: view === 'pipeline' ? 'list' : 'pipeline' })}`}>
            <Button variant="outline" size="sm">
              {view === 'pipeline' ? <ListIcon className="size-4 mr-1.5" /> : <LayoutGrid className="size-4 mr-1.5" />}
              {view === 'pipeline' ? 'List view' : 'Pipeline'}
            </Button>
          </Link>
          <Link href="/leads/new">
            <Button size="sm">
              <Plus className="size-4 mr-1.5" />
              New lead
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="flex items-center gap-1 text-muted-foreground">
          <Filter className="size-3" /> Stage:
        </span>
        <Link
          href={`/leads${qs({ stage: null })}`}
          className={`px-2.5 py-1 rounded-full border text-xs ${!stageFilter ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}
        >
          All
        </Link>
        {(stages ?? []).map((s) => (
          <Link
            key={s.id}
            href={`/leads${qs({ stage: stageFilter === s.id ? null : s.id })}`}
            className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${stageFilter === s.id ? 'border-transparent text-white' : 'border-border text-muted-foreground hover:text-foreground'}`}
            style={stageFilter === s.id ? { backgroundColor: s.color } : {}}
          >
            {s.label}
          </Link>
        ))}

        <span className="flex items-center gap-1 text-muted-foreground ml-3">Owner:</span>
        <Link
          href={`/leads${qs({ owner: null })}`}
          className={`px-2.5 py-1 rounded-full border text-xs ${!ownerFilter ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}
        >
          All
        </Link>
        {(owners ?? []).slice(0, 5).map((o) => (
          <Link
            key={o.id}
            href={`/leads${qs({ owner: ownerFilter === o.id ? null : o.id })}`}
            className={`px-2.5 py-1 rounded-full border text-xs ${ownerFilter === o.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
          >
            {o.full_name}
          </Link>
        ))}
      </div>

      {/* Body */}
      {view === 'pipeline' ? (
        <LeadKanban
          leads={leads.map((l) => ({
            id: l.id,
            lead_number: l.lead_number,
            title: l.title,
            estimated_value: l.estimated_value,
            owner_name: l.owner?.full_name ?? null,
            source_label: l.source?.label ?? null,
            stage_id: l.stage?.id ?? '',
            last_activity_at: l.last_activity_at,
          }))}
          stages={(stages ?? []).map((s) => ({ id: s.id, label: s.label, color: s.color, is_won: s.is_won, is_lost: s.is_lost }))}
        />
      ) : leads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium">No leads match your filters.</p>
            <p className="mt-1 text-sm text-muted-foreground">Capture one to begin.</p>
            <Link href="/leads/new" className="mt-3"><Button size="sm">New lead</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Lead</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">Source · Owner</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Stage</th>
                <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground sm:table-cell">Est. value</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground lg:table-cell">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2.5">
                    <Link href={`/leads/${l.id}`} className="font-mono text-xs text-muted-foreground hover:text-foreground">
                      {l.lead_number}
                    </Link>
                    <div className="text-foreground">{l.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.contact_name_raw ?? '—'}
                      {l.city && <> · {l.city}</>}
                      {l.segment && <> · {SEG_LABELS[l.segment] ?? l.segment}</>}
                    </div>
                  </td>
                  <td className="hidden px-3 py-2.5 md:table-cell">
                    <div className="text-foreground">{l.source?.label ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{l.owner?.full_name ?? '—'}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    {l.stage ? (
                      <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: `${l.stage.color}20`, color: l.stage.color }}>
                        {l.stage.label}
                      </Badge>
                    ) : '—'}
                  </td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">
                    {l.estimated_value != null ? `₹${Number(l.estimated_value).toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td className="hidden px-3 py-2.5 text-muted-foreground tabular-nums lg:table-cell">
                    {new Date(l.last_activity_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
