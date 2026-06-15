import { createClient } from '@/lib/supabase/server'
import { TasksClient } from './tasks-client'

export default async function TasksPage() {
  const supabase = await createClient()

  const { data: tasks } = await supabase
    .from('task')
    .select('id, title, type, priority, is_done, due_at, project:project_id(name)')
    .is('deleted_at', null)
    .order('is_done', { ascending: true })
    .order('due_at', { ascending: true })
    .limit(100)

  return (
    <TasksClient
      tasks={((tasks ?? []) as unknown as {
        id: string
        title: string
        type: string | null
        priority: string | null
        is_done: boolean
        due_at: string | null
        project: { name: string } | null
      }[])}
    />
  )
}
