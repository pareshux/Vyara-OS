import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  CheckSquare,
  FolderKanban,
  AlertCircle,
  ArrowRight,
  Layers,
  CalendarClock,
  UserPlus,
} from 'lucide-react'
import { getLatestDigest } from '@/lib/actions/daily-digest'
import { DigestCard } from './digest-card'

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-red-50 text-red-700',
  medium: 'bg-amber-50 text-amber-700',
  low: 'bg-muted text-muted-foreground',
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('full_name, tenant_id, role, department')
    .eq('id', user.id)
    .single()

  // Department-aware landing: each persona starts on their primary
  // workspace. This is the demo-friendly path — a procurement manager
  // shouldn't land on the generic dashboard when their job is at
  // /procurement. Management department + null department fall through
  // to the standard /dashboard view (the multi-purpose home).
  const dept = profile?.department
  if (dept === 'projects') redirect('/projects')
  if (dept === 'field_sales') redirect('/field')
  if (dept === 'procurement') redirect('/procurement')
  if (dept === 'accounts') redirect('/procurement/bills')
  if (dept === 'service') redirect('/complaints')

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const canManageDigest = profile?.role === 'admin' || profile?.role === 'manager'

  // Fetch latest daily digest (null if not generated yet)
  const latestDigest = await getLatestDigest()

  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const [
    { count: pendingTaskCount },
    { data: pavingStagesRaw },
    { data: allProjects },
    { count: totalProjectCount },
    { data: stagesRaw },
    { data: todayTasksRaw },
    { data: openLeadsRaw },
  ] = await Promise.all([
    supabase.from('task').select('*', { count: 'exact', head: true }).eq('is_done', false).is('deleted_at', null),
    supabase.from('pipeline_stage').select('id, label, color').eq('is_paving_stage', true),
    supabase
      .from('project')
      .select('id, name, city, current_stage_id')
      .is('deleted_at', null)
      .not('current_stage_id', 'is', null)
      .limit(100),
    supabase
      .from('project')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null),
    supabase
      .from('pipeline_stage')
      .select('id, label, color, order_index')
      .order('order_index'),
    supabase
      .from('task')
      .select('id, title, priority, due_at, project:project_id(id, name)')
      .eq('is_done', false)
      .is('deleted_at', null)
      .lte('due_at', todayEnd.toISOString())
      .order('due_at', { ascending: true })
      .limit(10),
    supabase
      .from('lead')
      .select(
        `id, lead_number, title, estimated_value, last_activity_at,
         stage:current_stage_id(label, color, is_terminal),
         owner:owner_id(full_name)`
      )
      .is('deleted_at', null)
      .order('estimated_value', { ascending: false, nullsFirst: false })
      .limit(50),
  ])

  // --- Paving-stage projects ---
  const pavingStageIds = new Set((pavingStagesRaw ?? []).map((s) => s.id))
  const pavingStageMap = Object.fromEntries(
    (pavingStagesRaw ?? []).map((s) => [s.id, { label: s.label, color: s.color }])
  )

  type Project = { id: string; name: string; city: string | null; current_stage_id: string | null }
  const projects = (allProjects ?? []) as Project[]
  const pavingStageProjects = projects.filter(
    (p) => p.current_stage_id && pavingStageIds.has(p.current_stage_id)
  )

  // --- Pipeline breakdown ---
  const stages = stagesRaw ?? []
  const stageCounts = stages.map((stage) => ({
    ...stage,
    count: projects.filter((p) => p.current_stage_id === stage.id).length,
  }))
  const maxCount = Math.max(1, ...stageCounts.map((s) => s.count))

  // --- Today's tasks ---
  type TodayTask = {
    id: string
    title: string
    priority: string | null
    due_at: string | null
    project: { id: string; name: string } | { id: string; name: string }[] | null
  }
  const todayTasks = (todayTasksRaw ?? []) as unknown as TodayTask[]

  // --- Leads ---
  type LeadRow = {
    id: string
    lead_number: string
    title: string
    estimated_value: number | null
    last_activity_at: string
    stage: { label: string; color: string; is_terminal: boolean } | { label: string; color: string; is_terminal: boolean }[] | null
    owner: { full_name: string } | { full_name: string }[] | null
  }
  const allLeads = (openLeadsRaw ?? []) as unknown as LeadRow[]
  const openLeads = allLeads.filter((l) => {
    const s = Array.isArray(l.stage) ? l.stage[0] : l.stage
    return s && !s.is_terminal
  })
  const pipelineValue = openLeads.reduce((s, l) => s + Number(l.estimated_value ?? 0), 0)
  const stalledLeads = openLeads.filter((l) => {
    const days = (Date.now() - new Date(l.last_activity_at).getTime()) / 86_400_000
    return days >= 7
  })
  const hotLeads = openLeads.slice(0, 5)

  // --- Greeting ---
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-5xl">
      {/* Greeting */}
      <Card>
        <CardContent className="pt-4">
          <p className="text-lg font-semibold text-foreground">
            {greeting}, {firstName}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Here&apos;s what needs your attention today.
          </p>
        </CardContent>
      </Card>

      {/* AI-generated daily digest (managers + admins) */}
      <DigestCard
        digest={latestDigest}
        canGenerate={canManageDigest}
      />

      {/* KPI cards — 4 up */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Link href="/leads" className="block">
          <Card className="hover:bg-muted/30 transition-colors cursor-pointer">
            <CardContent className="pt-4 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <UserPlus className="size-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Open Leads</span>
              </div>
              <p className="tabular-nums text-2xl font-semibold text-foreground">
                {openLeads.length}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                ₹{pipelineValue.toLocaleString('en-IN')} in pipeline
                {stalledLeads.length > 0 && <span className="text-amber-700"> · {stalledLeads.length} stalled</span>}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardContent className="pt-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CheckSquare className="size-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Pending Tasks</span>
            </div>
            <p className="tabular-nums text-2xl font-semibold text-foreground">
              {pendingTaskCount ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <AlertCircle className="size-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Paving Stage</span>
            </div>
            <p className="tabular-nums text-2xl font-semibold text-foreground">
              {pavingStageProjects.length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Layers className="size-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Total Projects</span>
            </div>
            <p className="tabular-nums text-2xl font-semibold text-foreground">
              {totalProjectCount ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline by Stage */}
      {stages.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Pipeline</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {stageCounts.map((stage) => {
              const pct = stage.count > 0 ? Math.round((stage.count / maxCount) * 100) : 0
              return (
                <Card key={stage.id} size="sm">
                  <CardContent className="pt-3 pb-3">
                    <div className="tabular-nums text-lg font-semibold text-foreground">
                      {stage.count}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {stage.label}
                    </div>
                    <div
                      className="mt-2 h-1 rounded-full"
                      style={{ backgroundColor: stage.color ? `${stage.color}30` : 'var(--muted)' }}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: stage.color ?? 'var(--primary)',
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Today's Tasks */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <CalendarClock className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Due Today</h2>
        </div>
        {todayTasks.length > 0 ? (
          <div className="flex flex-col gap-2">
            {todayTasks.map((task) => {
              const priority = task.priority ?? 'medium'
              const dueDate = task.due_at ? new Date(task.due_at) : null
              const isOverdue = dueDate && dueDate < new Date()
              // Supabase returns joined rows as array; normalise to single object
              const taskProject = Array.isArray(task.project)
                ? (task.project[0] ?? null)
                : task.project
              return (
                <Card key={task.id} size="sm">
                  <CardContent className="flex items-center gap-3 py-3">
                    {/* Priority dot */}
                    <div
                      className={`size-2 rounded-full shrink-0 ${
                        priority === 'high'
                          ? 'bg-red-500'
                          : priority === 'medium'
                            ? 'bg-amber-500'
                            : 'bg-muted-foreground/40'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                      {taskProject && (
                        <p className="text-xs text-muted-foreground truncate">{taskProject.name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 py-0 capitalize ${PRIORITY_STYLES[priority] ?? ''}`}
                      >
                        {priority}
                      </Badge>
                      {dueDate && (
                        <span
                          className={`text-xs tabular-nums ${isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}
                        >
                          {isOverdue
                            ? 'Overdue'
                            : dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
            <div className="mt-1">
              <Button size="sm" variant="ghost" asChild className="text-muted-foreground">
                <Link href="/tasks">View all tasks <ArrowRight className="size-3.5 ml-1" /></Link>
              </Button>
            </div>
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center">
              <CheckSquare className="size-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No tasks due today. You&apos;re all caught up!</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Paving Stage Alert */}
      {pavingStageProjects.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <AlertCircle className="size-4" style={{ color: '#B7791F' }} />
            <h2 className="text-sm font-semibold text-foreground">Paving Stage — Follow Up Required</h2>
          </div>
          <div className="flex flex-col gap-2">
            {pavingStageProjects.map((project) => {
              const stage = project.current_stage_id ? pavingStageMap[project.current_stage_id] : null
              return (
                <Card key={project.id} size="sm">
                  <CardContent className="flex items-center justify-between gap-4 py-3">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <p className="font-medium text-foreground truncate">{project.name}</p>
                      {project.city && (
                        <p className="text-xs text-muted-foreground">{project.city}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {stage && (
                        <Badge
                          variant="outline"
                          className="border-0 text-xs"
                          style={{ backgroundColor: `${stage.color}20`, color: stage.color }}
                        >
                          {stage.label}
                        </Badge>
                      )}
                      <Button size="sm" asChild>
                        <Link href={`/projects/${project.id}`}>
                          Follow up
                          <ArrowRight className="size-3.5 ml-1" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {pavingStageProjects.length === 0 && (
        <Card>
          <CardContent className="py-6 text-center">
            <FolderKanban className="size-7 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No projects at paving stage right now.</p>
            <Button size="sm" variant="outline" asChild className="mt-3">
              <Link href="/projects">View all projects</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
