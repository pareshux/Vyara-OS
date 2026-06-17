'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function getActorContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) return null
  return { supabase, userId: user.id, tenantId: profile.tenant_id, role: profile.role }
}

export async function createProject(params: {
  name: string
  segment: string
  owner_id: string
  buyer_firm_id?: string
  architect_firm_id?: string
  city?: string
  estimated_value?: number
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }

  const { supabase, userId, tenantId } = ctx

  const { data: initialStage, error: stageError } = await supabase
    .from('pipeline_stage')
    .select('id')
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .eq('segment', params.segment.toLowerCase())
    .order('order_index', { ascending: true })
    .limit(1)
    .single()

  if (stageError || !initialStage) {
    const { data: fallbackStage } = await supabase
      .from('pipeline_stage')
      .select('id')
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .order('order_index', { ascending: true })
      .limit(1)
      .single()

    if (!fallbackStage) return { error: 'No pipeline stages configured' }

    return insertProject(supabase, tenantId, userId, params, fallbackStage.id)
  }

  return insertProject(supabase, tenantId, userId, params, initialStage.id)
}

async function insertProject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tenantId: string,
  userId: string,
  params: {
    name: string
    segment: string
    owner_id: string
    buyer_firm_id?: string
    architect_firm_id?: string
    city?: string
    estimated_value?: number
  },
  stageId: string
): Promise<{ id: string } | { error: string }> {
  const { data: project, error: projectError } = await supabase
    .from('project')
    .insert({
      tenant_id: tenantId,
      name: params.name,
      segment: params.segment,
      current_stage_id: stageId,
      owner_id: params.owner_id,
      buyer_firm_id: params.buyer_firm_id ?? null,
      architect_firm_id: params.architect_firm_id ?? null,
      city: params.city ?? null,
      estimated_value: params.estimated_value ?? null,
    })
    .select('id')
    .single()

  if (projectError) {
    console.error('createProject error', projectError)
    return { error: projectError.message }
  }

  await supabase.from('project_stage_history').insert({
    tenant_id: tenantId,
    project_id: project.id,
    from_stage_id: null,
    to_stage_id: stageId,
    actor_id: userId,
    remark: 'Project created',
  })

  await supabase.from('activity').insert({
    tenant_id: tenantId,
    entity_type: 'project',
    entity_id: project.id,
    project_id: project.id,
    type: 'created',
    actor_id: userId,
    content: { note: 'Project created' },
  })

  revalidatePath('/projects')
  return { id: project.id }
}

export async function addProjectStakeholder(params: {
  project_id: string
  contact_id: string
  role: 'specifier' | 'buyer' | 'influencer' | 'decision_maker' | 'contractor'
  is_primary?: boolean
}): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }

  const { supabase, tenantId } = ctx

  const { error } = await supabase.from('project_stakeholder').insert({
    tenant_id: tenantId,
    project_id: params.project_id,
    contact_id: params.contact_id,
    role: params.role,
    is_primary: params.is_primary ?? false,
  })

  if (error) {
    console.error('addProjectStakeholder error', error)
    return { error: error.message }
  }

  revalidatePath(`/projects/${params.project_id}`)
  return { success: true }
}

export async function advanceStage(
  projectId: string,
  toStageId: string,
  remark?: string
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }

  const { supabase, userId, tenantId } = ctx

  const { data: project, error: fetchError } = await supabase
    .from('project')
    .select('current_stage_id, name')
    .eq('id', projectId)
    .single()

  if (fetchError || !project) return { error: 'Project not found' }

  const fromStageId = project.current_stage_id

  const { error: updateError } = await supabase
    .from('project')
    .update({ current_stage_id: toStageId })
    .eq('id', projectId)

  if (updateError) {
    console.error('advanceStage error', updateError)
    return { error: updateError.message }
  }

  const { data: toStage } = await supabase
    .from('pipeline_stage')
    .select('label, is_paving_stage')
    .eq('id', toStageId)
    .single()

  await supabase.from('project_stage_history').insert({
    tenant_id: tenantId,
    project_id: projectId,
    from_stage_id: fromStageId,
    to_stage_id: toStageId,
    actor_id: userId,
    remark: remark ?? null,
  })

  await supabase.from('activity').insert({
    tenant_id: tenantId,
    entity_type: 'project',
    entity_id: projectId,
    project_id: projectId,
    type: 'stage_changed',
    actor_id: userId,
    content: {
      note: `Stage advanced to ${toStage?.label ?? 'next stage'}`,
      remark: remark ?? null,
    },
  })

  if (toStage?.is_paving_stage) {
    await supabase.from('task').insert({
      tenant_id: tenantId,
      project_id: projectId,
      type: 'paving_followup',
      title: `Follow up: ${project.name} has reached paving stage`,
      priority: 'high',
      is_done: false,
      assignee_id: userId,
    })
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/projects')
  revalidatePath('/dashboard')
  return { success: true }
}
