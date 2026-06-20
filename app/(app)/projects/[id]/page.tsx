import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { StageStepper } from '@/components/projects/stage-stepper'
import { ScannableProgressHeader } from '@/components/projects/scannable-progress-header'
import { getProjectProgress } from '@/lib/read-models/project-progress'
import { SpecificationsTab } from './specifications-tab'
import { TasksTab } from './tasks-tab'
import { QuickNote } from './quick-note'
import { SamplesTab } from './samples-tab'
import { QuotesTab } from './quotes-tab'
import { OrdersTab } from './orders-tab'
import { StakeholdersTab } from './stakeholders-tab'
import {
  ChevronRight,
  MapPin,
  User,
  Building2,
  DollarSign,
  Clock,
  CheckSquare,
  FolderOpen,
  AlertCircle,
  FileText,
} from 'lucide-react'

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  created: <FolderOpen className="size-4 text-primary" />,
  stage_changed: <ChevronRight className="size-4 text-blue-600" />,
  sample: <FileText className="size-4 text-purple-600" />,
  quote: <DollarSign className="size-4 text-green-600" />,
  note: <FileText className="size-4 text-muted-foreground" />,
  notification: <AlertCircle className="size-4 text-amber-600" />,
}

function timeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [
    { data: project },
    { data: allStages },
    { data: stakeholders },
    { data: specifications },
    { data: activities },
    { data: products },
    { data: tasks },
    { data: samples },
    { data: quotes },
    { data: profile },
    { data: contacts },
  ] = await Promise.all([
    supabase
      .from('project')
      .select(
        `id, name, segment, city, estimated_value, created_at,
         current_stage:current_stage_id(id, label, color, is_paving_stage),
         owner:owner_id(full_name),
         buyer_firm:buyer_firm_id(id, name),
         architect_firm:architect_firm_id(id, name)`
      )
      .eq('id', id)
      .is('deleted_at', null)
      .single(),
    supabase
      .from('pipeline_stage')
      .select('id, label, color, order_index, is_terminal, segment')
      .order('order_index'),
    supabase
      .from('project_stakeholder')
      .select('role, is_primary, contact:contact_id(full_name, role_title, phone, email, firm:firm_id(name))')
      .eq('project_id', id),
    supabase
      .from('specification')
      .select('id, finish, quantity, unit, is_confirmed, product:product_id(name, sku_code)')
      .eq('project_id', id)
      .is('deleted_at', null)
      .order('created_at'),
    supabase
      .from('activity')
      .select('id, type, content, created_at, actor:actor_id(full_name)')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('product')
      .select('id, sku_code, name, unit, category, base_price')
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('task')
      .select('id, title, type, priority, is_done, due_at')
      .eq('project_id', id)
      .is('deleted_at', null)
      .order('is_done', { ascending: true })
      .order('due_at', { ascending: true }),
    supabase
      .from('sample_request')
      .select('id, status, quantity, notes, outcome_notes, created_at, dispatched_at, delivered_at, product:product_id(name, sku_code), contact:contact_id(full_name)')
      .eq('project_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('quotation')
      .select('id, quotation_number, status, total, valid_until, notes, sent_at, created_at, lines:quotation_line(id, quantity, unit_price, line_total, notes, product:product_id(name, sku_code))')
      .eq('project_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('user_profile')
      .select('role')
      .eq('id', user.id)
      .single(),
    supabase
      .from('contact')
      .select('id, full_name, role_title, firm:firm_id(name)')
      .is('deleted_at', null)
      .order('full_name'),
  ])

  // Slice 2: Orders module — read for the project's Orders tab
  const [{ data: ordersRaw }, { data: orderQuotesRaw }] = await Promise.all([
    supabase
      .from('sales_order')
      .select(
        `id, order_number, value, expected_delivery_at,
         stage:current_stage_id(id, label, color)`
      )
      .eq('project_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('quotation')
      .select('id, quotation_number, status, total')
      .eq('project_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])

  if (!project) notFound()

  // Read-model: one server-side assembler for the scannable header.
  // The component itself never touches Order/Dispatch/Invoice tables.
  const progress = await getProjectProgress(id)

  const currentStage = (project.current_stage as unknown) as { id: string; label: string; color: string; is_paving_stage: boolean } | null
  const specificStages = (allStages ?? []).filter((s) => s.segment === project.segment)
  const segmentStages = specificStages.length > 0
    ? specificStages
    : (allStages ?? []).filter((s) => s.segment === 'generic')

  const owner = (project.owner as unknown) as { full_name: string } | null
  const buyerFirm = (project.buyer_firm as unknown) as { id: string; name: string } | null
  const architectFirm = (project.architect_firm as unknown) as { id: string; name: string } | null

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/projects" className="hover:text-foreground transition-colors">Projects</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium truncate">{project.name}</span>
      </div>

      <Card>
        <CardContent className="pt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold text-foreground">{project.name}</h1>
                <Badge variant="outline" className="capitalize text-xs border-border text-muted-foreground">
                  {project.segment}
                </Badge>
                {currentStage && (
                  <Badge
                    variant="outline"
                    className="border-0 text-xs"
                    style={{
                      backgroundColor: `${currentStage.color}20`,
                      color: currentStage.color,
                    }}
                  >
                    {currentStage.label}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                {owner && (
                  <span className="flex items-center gap-1">
                    <User className="size-3.5" />
                    {owner.full_name}
                  </span>
                )}
                {project.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    {project.city}
                  </span>
                )}
                {project.estimated_value != null && (
                  <span className="flex items-center gap-1 tabular-nums">
                    <DollarSign className="size-3.5" />
                    ₹{project.estimated_value.toLocaleString('en-IN')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {progress && (
            <div className="border-t border-border pt-4">
              <ScannableProgressHeader progress={progress} />
            </div>
          )}

          {segmentStages.length > 0 && currentStage && (
            <div className="border-t border-border pt-4">
              <StageStepper
                stages={segmentStages}
                currentStageId={currentStage.id}
                projectId={project.id}
                displayMode="advance-only"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList variant="line" className="w-full justify-start border-b border-border rounded-none h-auto pb-0 gap-0">
          <TabsTrigger value="overview" className="rounded-none pb-3 px-4">Overview</TabsTrigger>
          <TabsTrigger value="stakeholders" className="rounded-none pb-3 px-4">
            Stakeholders
            {(stakeholders ?? []).length > 0 && (
              <span className="ml-1.5 tabular-nums text-xs text-muted-foreground">
                {stakeholders!.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="specifications" className="rounded-none pb-3 px-4">
            Specifications
            {(specifications ?? []).length > 0 && (
              <span className="ml-1.5 tabular-nums text-xs text-muted-foreground">
                {specifications!.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="timeline" className="rounded-none pb-3 px-4">Timeline</TabsTrigger>
          <TabsTrigger value="tasks" className="rounded-none pb-3 px-4">
            Tasks
            {(tasks ?? []).filter((t) => !t.is_done).length > 0 && (
              <span className="ml-1.5 tabular-nums text-xs text-muted-foreground">
                {(tasks ?? []).filter((t) => !t.is_done).length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="samples" className="rounded-none pb-3 px-4">
            Samples
            {(samples ?? []).length > 0 && (
              <span className="ml-1.5 tabular-nums text-xs text-muted-foreground">
                {(samples ?? []).length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="quotes" className="rounded-none pb-3 px-4">
            Quotes
            {(quotes ?? []).length > 0 && (
              <span className="ml-1.5 tabular-nums text-xs text-muted-foreground">
                {(quotes ?? []).length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="orders" className="rounded-none pb-3 px-4">
            Orders
            {(ordersRaw ?? []).length > 0 && (
              <span className="ml-1.5 tabular-nums text-xs text-muted-foreground">
                {(ordersRaw ?? []).length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card size="sm">
              <CardContent className="pt-3 flex flex-col gap-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Project details</p>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Segment</span>
                    <span className="capitalize font-medium">{project.segment}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Stage</span>
                    <span className="font-medium">{currentStage?.label ?? '—'}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">City</span>
                    <span className="font-medium">{project.city ?? '—'}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Est. value</span>
                    <span className="tabular-nums font-medium">
                      {project.estimated_value != null
                        ? `₹${project.estimated_value.toLocaleString('en-IN')}`
                        : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Created</span>
                    <span className="font-medium tabular-nums">
                      {new Date(project.created_at as string).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric'
                      })}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardContent className="pt-3 flex flex-col gap-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Associated parties</p>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                      <User className="size-3.5" /> Owner
                    </span>
                    <span className="font-medium text-right">{owner?.full_name ?? '—'}</span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                      <Building2 className="size-3.5" /> Buyer
                    </span>
                    {buyerFirm ? (
                      <Link
                        href={`/customers/${buyerFirm.id}`}
                        className="font-medium text-right hover:text-primary inline-flex items-center gap-1"
                      >
                        {buyerFirm.name}
                        <ChevronRight className="size-3 text-muted-foreground/60" />
                      </Link>
                    ) : (
                      <span className="font-medium text-right">—</span>
                    )}
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                      <Building2 className="size-3.5" /> Architect
                    </span>
                    {architectFirm ? (
                      <Link
                        href={`/customers/${architectFirm.id}`}
                        className="font-medium text-right hover:text-primary inline-flex items-center gap-1"
                      >
                        {architectFirm.name}
                        <ChevronRight className="size-3 text-muted-foreground/60" />
                      </Link>
                    ) : (
                      <span className="font-medium text-right">—</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="stakeholders" className="mt-4">
          <StakeholdersTab
            projectId={project.id}
            stakeholders={(stakeholders ?? []) as unknown as {
              role: string
              is_primary: boolean
              contact: { full_name: string; role_title: string | null; phone: string | null; firm: { name: string } | null } | null
            }[]}
            contacts={(contacts ?? []) as unknown as {
              id: string
              full_name: string
              role_title: string | null
              firm: { name: string } | null
            }[]}
          />
        </TabsContent>

        <TabsContent value="specifications" className="mt-4">
          <SpecificationsTab
            projectId={project.id}
            specs={(specifications ?? []) as unknown as {
              id: string
              finish: string | null
              quantity: number | null
              unit: string | null
              is_confirmed: boolean
              product: { name: string; sku_code: string } | null
            }[]}
            products={(products ?? []) as {
              id: string
              sku_code: string
              name: string
              unit: string
              category: string | null
            }[]}
          />
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          {(activities ?? []).length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-12 text-center">
              <Clock className="size-7 mb-3 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">No activity yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Changes and interactions will appear here.
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {(activities ?? []).map((a, index) => {
                const actor = (a.actor as unknown) as { full_name: string } | null
                const content = a.content as { note?: string; remark?: string } | null
                const isLast = index === (activities?.length ?? 0) - 1
                return (
                  <div key={a.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="flex size-7 items-center justify-center rounded-full bg-muted border border-border shrink-0 mt-0.5">
                        {ACTIVITY_ICONS[a.type] ?? <Clock className="size-4 text-muted-foreground" />}
                      </div>
                      {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
                    </div>
                    <div className={`pb-4 min-w-0 flex-1 ${isLast ? '' : ''}`}>
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <p className="text-sm text-foreground">
                          {content?.note ?? a.type.replace(/_/g, ' ')}
                        </p>
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {timeAgo(a.created_at as string)}
                        </span>
                      </div>
                      {content?.remark && (
                        <p className="mt-0.5 text-xs text-muted-foreground italic">{content.remark}</p>
                      )}
                      {actor && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{actor.full_name}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <QuickNote projectId={project.id} />
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <TasksTab
            projectId={project.id}
            tasks={(tasks ?? []) as {
              id: string
              title: string
              type: string | null
              priority: string | null
              is_done: boolean
              due_at: string | null
            }[]}
          />
        </TabsContent>

        <TabsContent value="samples" className="mt-4">
          <SamplesTab
            projectId={project.id}
            samples={(samples ?? []) as unknown as {
              id: string
              status: string
              quantity: number
              notes: string | null
              outcome_notes: string | null
              created_at: string
              dispatched_at: string | null
              delivered_at: string | null
              product: { name: string; sku_code: string } | null
              contact: { full_name: string } | null
            }[]}
            products={(products ?? []) as {
              id: string
              name: string
              sku_code: string
              unit: string
              base_price: number | null
            }[]}
          />
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          <OrdersTab
            projectId={project.id}
            orders={((ordersRaw ?? []) as unknown as Array<{
              id: string
              order_number: string
              value: number
              expected_delivery_at: string | null
              stage: { id: string; label: string; color: string } | { id: string; label: string; color: string }[] | null
            }>).map((o) => ({
              id: o.id,
              order_number: o.order_number,
              value: o.value,
              expected_delivery_at: o.expected_delivery_at,
              stage: Array.isArray(o.stage) ? (o.stage[0] ?? null) : o.stage,
            }))}
            quotes={(orderQuotesRaw ?? []) as { id: string; quotation_number: string; status: string; total: number | null }[]}
          />
        </TabsContent>

        <TabsContent value="quotes" className="mt-4">
          <QuotesTab
            projectId={project.id}
            quotes={(quotes ?? []) as unknown as {
              id: string
              quotation_number: string
              status: string
              total: number | null
              valid_until: string | null
              notes: string | null
              sent_at: string | null
              created_at: string
              lines: {
                id: string
                quantity: number
                unit_price: number
                line_total: number
                notes: string | null
                product: { name: string; sku_code: string } | null
              }[]
            }[]}
            products={(products ?? []) as {
              id: string
              name: string
              sku_code: string
              unit: string
              base_price: number | null
            }[]}
            userRole={profile?.role ?? undefined}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
