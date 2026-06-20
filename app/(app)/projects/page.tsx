import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProjectsClient } from './projects-client'
import { getProjectProgressBatch, type Health } from '@/lib/read-models/project-progress'

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

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; owner?: string; segment?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const stageFilter = sp.stage ?? null
  const ownerFilter = sp.owner ?? null
  const segmentFilter = sp.segment ?? null

  const [{ data: allProjectsRaw }, { data: firms }, { data: users }] = await Promise.all([
    supabase
      .from('project')
      .select(
        'id, name, segment, city, estimated_value, current_stage:current_stage_id(id, label, color), owner:owner_id(id, full_name)'
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase.from('firm').select('id, name').is('deleted_at', null).order('name'),
    supabase.from('user_profile').select('id, full_name').eq('is_active', true).order('full_name'),
  ])

  type ProjectBase = {
    id: string
    name: string
    segment: string
    city: string | null
    estimated_value: number | null
    current_stage: { id: string; label: string; color: string } | null
    owner: { id: string; full_name: string } | null
  }

  const allProjects = (allProjectsRaw ?? []) as unknown as ProjectBase[]

  // Stage count distribution from the FULL set (always shows true totals)
  const stageCounts = allProjects.reduce<Record<string, { label: string; color: string; count: number }>>(
    (acc, p) => {
      if (!p.current_stage) return acc
      const key = p.current_stage.id
      if (!acc[key]) acc[key] = { label: p.current_stage.label, color: p.current_stage.color, count: 0 }
      acc[key].count++
      return acc
    },
    {}
  )

  // Unique filter options derived from data
  const stageOptionsMap = new Map<string, { id: string; label: string; color: string }>()
  const ownerOptionsMap = new Map<string, { id: string; label: string }>()
  for (const p of allProjects) {
    if (p.current_stage) stageOptionsMap.set(p.current_stage.id, { id: p.current_stage.id, label: p.current_stage.label, color: p.current_stage.color })
    if (p.owner) ownerOptionsMap.set(p.owner.id, { id: p.owner.id, label: p.owner.full_name })
  }
  const stageOptions = [...stageOptionsMap.values()]
  const ownerOptions = [...ownerOptionsMap.values()]

  const segmentOptions = [
    ...new Set(allProjects.map((p) => p.segment).filter(Boolean)),
  ].map((s) => ({ value: s, label: SEG_LABELS[s] ?? s }))

  // Apply filters in-memory (avoids a second DB round-trip; project list is bounded)
  let filtered = allProjects
  if (q) {
    const needle = q.toLowerCase()
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.city ?? '').toLowerCase().includes(needle)
    )
  }
  if (stageFilter) filtered = filtered.filter((p) => p.current_stage?.id === stageFilter)
  if (ownerFilter) filtered = filtered.filter((p) => p.owner?.id === ownerFilter)
  if (segmentFilter) filtered = filtered.filter((p) => p.segment === segmentFilter)

  // Health dots for the filtered set only
  const progressMap = await getProjectProgressBatch(filtered.map((p) => p.id))
  const projectList = filtered.map((p) => ({
    ...p,
    health: (progressMap.get(p.id)?.health ?? 'on_track') as Health,
    health_reason: progressMap.get(p.id)?.health_reason ?? 'On track',
  }))

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl">
      <ProjectsClient
        projects={projectList}
        firms={(firms ?? []) as { id: string; name: string }[]}
        users={(users ?? []) as { id: string; full_name: string }[]}
        currentUserId={user.id}
        stageCounts={Object.values(stageCounts)}
        stageOptions={stageOptions}
        ownerOptions={ownerOptions}
        segmentOptions={segmentOptions}
        totalCount={allProjects.length}
        filteredCount={filtered.length}
      />
    </div>
  )
}
