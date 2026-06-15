'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function getActorContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) return null
  return { supabase, userId: user.id, tenantId: profile.tenant_id, role: profile.role }
}

export async function createTask(params: {
  project_id?: string
  title: string
  priority?: string
  due_at?: string
  type?: string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }

  const { supabase, userId, tenantId } = ctx

  const { data: task, error } = await supabase
    .from('task')
    .insert({
      tenant_id: tenantId,
      project_id: params.project_id ?? null,
      type: params.type ?? 'manual',
      title: params.title,
      priority: params.priority ?? 'medium',
      due_at: params.due_at ?? null,
      is_done: false,
      assignee_id: userId,
      created_by: userId,
      updated_by: userId,
    })
    .select('id')
    .single()

  if (error) {
    console.error('createTask error', error)
    return { error: error.message }
  }

  if (params.project_id) {
    await supabase.from('activity').insert({
      tenant_id: tenantId,
      entity_type: 'task',
      entity_id: task.id,
      project_id: params.project_id,
      type: 'created',
      actor_id: userId,
      content: { note: `Task created: ${params.title}` },
    })
    revalidatePath(`/projects/${params.project_id}`)
  }

  revalidatePath('/tasks')
  revalidatePath('/dashboard')
  return { id: task.id }
}

export async function toggleTask(
  taskId: string
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }

  const { supabase, userId, tenantId } = ctx

  const { data: existing, error: fetchError } = await supabase
    .from('task')
    .select('id, is_done, title, project_id')
    .eq('id', taskId)
    .single()

  if (fetchError || !existing) return { error: 'Task not found' }

  const newDone = !existing.is_done

  const { error: updateError } = await supabase
    .from('task')
    .update({ is_done: newDone, updated_by: userId })
    .eq('id', taskId)

  if (updateError) {
    console.error('toggleTask error', updateError)
    return { error: updateError.message }
  }

  if (existing.project_id) {
    await supabase.from('activity').insert({
      tenant_id: tenantId,
      entity_type: 'task',
      entity_id: taskId,
      project_id: existing.project_id,
      type: newDone ? 'completed' : 'reopened',
      actor_id: userId,
      content: {
        note: newDone
          ? `Task completed: ${existing.title}`
          : `Task reopened: ${existing.title}`,
      },
    })
    revalidatePath(`/projects/${existing.project_id}`)
  }

  revalidatePath('/tasks')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function createNote(params: {
  project_id: string
  content: string
}): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }

  const { supabase, userId, tenantId } = ctx

  const { error } = await supabase.from('activity').insert({
    tenant_id: tenantId,
    entity_type: 'project',
    entity_id: params.project_id,
    project_id: params.project_id,
    type: 'note',
    actor_id: userId,
    content: { note: params.content },
  })

  if (error) {
    console.error('createNote error', error)
    return { error: error.message }
  }

  revalidatePath(`/projects/${params.project_id}`)
  return { success: true }
}
