import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProjectsClient } from './projects-client'
import { getProjectProgressBatch, type Health } from '@/lib/read-models/project-progress'

export default async function ProjectsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: projects }, { data: firms }, { data: users }] = await Promise.all([
    supabase
      .from('project')
      .select(
        'id, name, segment, city, estimated_value, current_stage:current_stage_id(id, label, color), owner:owner_id(full_name)'
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase.from('firm').select('id, name').is('deleted_at', null).order('name'),
    supabase.from('user_profile').select('id, full_name').eq('is_active', true).order('full_name'),
  ])

  const projectListBase = (projects ?? []) as unknown as {
    id: string
    name: string
    segment: string
    city: string | null
    estimated_value: number | null
    current_stage: { id: string; label: string; color: string } | null
    owner: { full_name: string } | null
  }[]

  // Batch progress lookup for the health dot — one server-side assembler.
  const progressMap = await getProjectProgressBatch(projectListBase.map((p) => p.id))
  const projectList = projectListBase.map((p) => ({
    ...p,
    health: (progressMap.get(p.id)?.health ?? 'on_track') as Health,
    health_reason: progressMap.get(p.id)?.health_reason ?? 'On track',
  }))

  const stageCounts = projectList.reduce<Record<string, { label: string; color: string; count: number }>>(
    (acc, p) => {
      if (!p.current_stage) return acc
      const key = p.current_stage.id
      if (!acc[key]) {
        acc[key] = { label: p.current_stage.label, color: p.current_stage.color, count: 0 }
      }
      acc[key].count++
      return acc
    },
    {}
  )

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl">
      <ProjectsClient
        projects={projectList}
        firms={(firms ?? []) as { id: string; name: string }[]}
        users={(users ?? []) as { id: string; full_name: string }[]}
        currentUserId={user.id}
        stageCounts={Object.values(stageCounts)}
      />
    </div>
  )
}
