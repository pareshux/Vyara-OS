import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChevronRight, Mail, Phone, MapPin, Calendar, IndianRupee, User, Sparkles } from 'lucide-react'
import { LeadActions } from './lead-actions'
import { LeadTimeline } from './lead-timeline'
import { QuotesTab } from '@/app/(app)/projects/[id]/quotes-tab'

export const dynamic = 'force-dynamic'

const SEG_LABELS: Record<string, string> = {
  architect: 'Architect-specified', dealer: 'Dealer', tender: 'Tender',
  retail: 'Retail', government: 'Government', corporate: 'Corporate', generic: 'Generic',
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: lead },
    { data: stages },
    { data: lossReasons },
    { data: owners },
    { data: activities },
    { data: stageHistory },
    { data: tasks },
    { data: quotes },
    { data: products },
    { data: profile },
    { data: contacts },
  ] = await Promise.all([
    supabase
      .from('lead')
      .select(
        `id, lead_number, title, segment, estimated_value, expected_close_at,
         contact_name_raw, contact_phone_raw, contact_email_raw,
         city, state, territory, notes, created_at, last_activity_at,
         won_at, won_project_id, lost_at, lost_remark,
         stage:current_stage_id(id, stage_key, label, color, is_terminal, is_won, is_lost),
         source:source_id(id, code, label),
         owner:owner_id(id, full_name),
         buyer:buyer_firm_id(id, name),
         lost_reason:lost_reason_id(id, label)`
      )
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('lead_stage')
      .select('id, stage_key, label, color, order_index, is_terminal, is_won, is_lost')
      .or('tenant_id.is.null')
      .order('order_index'),
    supabase.from('lead_loss_reason').select('id, code, label').is('deleted_at', null).order('sort_order'),
    supabase
      .from('user_profile')
      .select('id, full_name, role')
      .eq('is_active', true)
      .in('role', ['admin', 'manager', 'sales_engineer'])
      .order('full_name'),
    supabase
      .from('activity')
      .select('id, type, content, created_at, actor_id')
      .eq('entity_type', 'lead')
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('lead_stage_history')
      .select('id, remark, created_at, from_stage:from_stage_id(label, color), to_stage:to_stage_id(label, color)')
      .eq('lead_id', id)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('task')
      .select('id, title, type, priority, is_done, due_at')
      .eq('source_entity_type', 'lead')
      .eq('source_entity_id', id)
      .is('deleted_at', null)
      .order('is_done')
      .order('due_at'),
    supabase
      .from('quotation')
      .select('id, quotation_number, status, total, valid_until, notes, sent_at, created_at, lines:quotation_line(id, quantity, unit_price, line_total, notes, product:product_id(name, sku_code))')
      .eq('lead_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('product')
      .select('id, sku_code, name, unit, base_price')
      .is('deleted_at', null)
      .order('name'),
    supabase.from('user_profile').select('role').eq('id', user.id).single(),
    supabase
      .from('contact')
      .select('id, full_name, role_title, firm:firm_id(name)')
      .is('deleted_at', null)
      .order('full_name')
      .limit(100),
  ])

  if (!lead) notFound()

  // Resolve actor names from user_profile (actor_id → auth.users → not in PostgREST
  // public schema; user_profile.id is the same UUID and IS in public schema).
  const actorIds = [...new Set((activities ?? []).map((a) => (a as { actor_id: string | null }).actor_id).filter(Boolean))] as string[]
  const { data: actorProfiles } = actorIds.length > 0
    ? await supabase.from('user_profile').select('id, full_name').in('id', actorIds)
    : { data: [] as Array<{ id: string; full_name: string }> }
  const actorNameById = new Map((actorProfiles ?? []).map((p) => [p.id, p.full_name]))
  const enrichedActivities = (activities ?? []).map((a) => {
    const aid = (a as { actor_id: string | null }).actor_id
    return { ...a, actor: aid ? { full_name: actorNameById.get(aid) ?? null } : null }
  })

  type SafeJoin<T> = T | T[] | null
  function one<T>(x: SafeJoin<T>): T | null {
    return Array.isArray(x) ? (x[0] ?? null) : (x ?? null)
  }
  const stage = one(lead.stage as SafeJoin<{ id: string; stage_key: string; label: string; color: string; is_terminal: boolean; is_won: boolean; is_lost: boolean }>)
  const source = one(lead.source as SafeJoin<{ id: string; code: string; label: string }>)
  const owner = one(lead.owner as SafeJoin<{ id: string; full_name: string }>)
  const buyer = one(lead.buyer as SafeJoin<{ id: string; name: string }>)
  const lostReason = one(lead.lost_reason as SafeJoin<{ id: string; label: string }>)

  const ageInDays = Math.floor((Date.now() - new Date(lead.created_at as string).getTime()) / 86_400_000)
  const sinceActivity = Math.floor((Date.now() - new Date(lead.last_activity_at as string).getTime()) / 86_400_000)

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/leads" className="hover:text-foreground">Leads</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium font-mono">{lead.lead_number as string}</span>
      </div>

      {/* Header card */}
      <Card>
        <CardContent className="pt-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold">{lead.title as string}</h1>
                {stage && (
                  <Badge
                    variant="outline"
                    className="border-0 text-xs"
                    style={{ backgroundColor: `${stage.color}20`, color: stage.color }}
                  >
                    {stage.label}
                  </Badge>
                )}
                {source && (
                  <Badge variant="outline" className="text-xs">via {source.label}</Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                <span className="font-mono text-xs">{lead.lead_number as string}</span>
                <span>· {SEG_LABELS[lead.segment as string] ?? (lead.segment as string)}</span>
                <span>· {ageInDays === 0 ? 'created today' : `${ageInDays}d old`}</span>
                {!stage?.is_terminal && (
                  <span className={sinceActivity >= 7 ? 'text-amber-700' : ''}>
                    · last activity {sinceActivity === 0 ? 'today' : `${sinceActivity}d ago`}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Estimated value</p>
              <p className="text-2xl font-semibold tabular-nums text-primary">
                {lead.estimated_value != null
                  ? `₹${Number(lead.estimated_value).toLocaleString('en-IN')}`
                  : '—'}
              </p>
            </div>
          </div>

          <LeadActions
            leadId={lead.id as string}
            currentStageId={stage?.id ?? ''}
            isTerminal={stage?.is_terminal ?? false}
            stages={(stages ?? []) as { id: string; stage_key: string; label: string; color: string; order_index: number; is_terminal: boolean; is_won: boolean; is_lost: boolean }[]}
            lossReasons={(lossReasons ?? []) as { id: string; code: string; label: string }[]}
            owners={(owners ?? []) as { id: string; full_name: string; role: string }[]}
            currentOwnerId={owner?.id ?? ''}
            wonProjectId={lead.won_project_id as string | null}
          />
        </CardContent>
      </Card>

      {/* Won banner */}
      {lead.won_at && lead.won_project_id && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-sm flex items-center gap-2">
          <Sparkles className="size-4 text-emerald-700 shrink-0" />
          <span className="text-emerald-900">
            Lead won on {new Date(lead.won_at as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} — auto-created project.
          </span>
          <Link href={`/projects/${lead.won_project_id}`} className="ml-auto shrink-0">
            <Button size="sm" variant="outline" className="border-emerald-300 text-emerald-700 h-7 text-xs">
              View project
            </Button>
          </Link>
        </div>
      )}

      {/* Lost banner */}
      {lead.lost_at && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2.5 text-sm">
          <p className="text-destructive font-medium">
            Lead lost on {new Date(lead.lost_at as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            {lostReason && <> — {lostReason.label}</>}
          </p>
          {lead.lost_remark && <p className="text-xs text-destructive/80 mt-0.5 italic">{lead.lost_remark as string}</p>}
        </div>
      )}

      {/* Info grid */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card size="sm">
          <CardContent className="pt-3 flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Contact</p>
            <div className="flex flex-col gap-1 text-sm">
              {lead.contact_name_raw && (
                <span className="flex items-center gap-2 text-foreground">
                  <User className="size-3.5 text-muted-foreground" />
                  {lead.contact_name_raw as string}
                </span>
              )}
              {lead.contact_phone_raw && (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="size-3.5" />
                  {lead.contact_phone_raw as string}
                </span>
              )}
              {lead.contact_email_raw && (
                <span className="flex items-center gap-2 text-muted-foreground truncate">
                  <Mail className="size-3.5 shrink-0" />
                  {lead.contact_email_raw as string}
                </span>
              )}
              {buyer && (
                <span className="text-xs text-muted-foreground pt-1">
                  Firm: <span className="text-foreground">{buyer.name}</span>
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-3 flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Project context</p>
            <div className="flex flex-col gap-1 text-sm">
              {(lead.city || lead.state) && (
                <span className="flex items-center gap-2 text-foreground">
                  <MapPin className="size-3.5 text-muted-foreground" />
                  {[lead.city, lead.state].filter(Boolean).join(', ')}
                </span>
              )}
              {lead.territory && (
                <span className="text-xs text-muted-foreground">Territory: <span className="text-foreground">{lead.territory as string}</span></span>
              )}
              {lead.expected_close_at && (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="size-3.5" />
                  Expected close {new Date(lead.expected_close_at as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-3 flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Ownership</p>
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-foreground font-medium">{owner?.full_name ?? '—'}</span>
              {lead.estimated_value != null && (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <IndianRupee className="size-3.5" />
                  ₹{Number(lead.estimated_value).toLocaleString('en-IN')}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed body: Quotes · Timeline · Tasks */}
      <Tabs defaultValue="quotes">
        <TabsList variant="line" className="w-full justify-start border-b border-border rounded-none h-auto pb-0 gap-0">
          <TabsTrigger value="quotes" className="rounded-none pb-3 px-4">
            Quotes {(quotes ?? []).length > 0 && <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">({(quotes ?? []).length})</span>}
          </TabsTrigger>
          <TabsTrigger value="timeline" className="rounded-none pb-3 px-4">Timeline</TabsTrigger>
          {(tasks ?? []).length > 0 && (
            <TabsTrigger value="tasks" className="rounded-none pb-3 px-4">
              Tasks <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">({(tasks ?? []).length})</span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="quotes" className="mt-4">
          <QuotesTab
            leadId={lead.id as string}
            quotes={(quotes ?? []) as unknown as Parameters<typeof QuotesTab>[0]['quotes']}
            products={(products ?? []) as unknown as Parameters<typeof QuotesTab>[0]['products']}
            contacts={(contacts ?? []) as unknown as Parameters<typeof QuotesTab>[0]['contacts']}
            userRole={(profile as { role: string } | null)?.role}
          />
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          {lead.notes && (
            <Card size="sm" className="mb-4">
              <CardContent className="pt-3 flex flex-col gap-1">
                <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Notes</p>
                <p className="text-sm whitespace-pre-wrap">{lead.notes as string}</p>
              </CardContent>
            </Card>
          )}
          <LeadTimeline
            activities={(enrichedActivities as unknown as { id: string; type: string; content: unknown; created_at: string; actor: { full_name: string } | { full_name: string }[] | null }[])}
            stageHistory={((stageHistory ?? []) as unknown as { id: string; remark: string | null; created_at: string; from_stage: { label: string; color: string } | { label: string; color: string }[] | null; to_stage: { label: string; color: string } | { label: string; color: string }[] | null }[])}
          />
        </TabsContent>

        {(tasks ?? []).length > 0 && (
          <TabsContent value="tasks" className="mt-4">
            <Card size="sm"><CardContent className="pt-2 pb-2 flex flex-col divide-y divide-border">
              {(tasks ?? []).map((t) => (
                <div key={t.id} className="py-2 flex items-center justify-between gap-2">
                  <span className={t.is_done ? 'line-through text-muted-foreground text-sm' : 'text-sm text-foreground'}>{t.title}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t.due_at ? new Date(t.due_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                  </span>
                </div>
              ))}
            </CardContent></Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
