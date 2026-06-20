import { inngest } from './client'
import { createClient } from '@supabase/supabase-js'

const STALE_SAMPLE_DAYS = 7

export const pavingStageCheck = inngest.createFunction(
  { id: 'paving-stage-daily-check', triggers: [{ cron: '0 9 * * *' }] },
  async ({ logger }: { logger: { info: (msg: string, meta?: unknown) => void; warn: (msg: string, meta?: unknown) => void; error: (msg: string, meta?: unknown) => void } }) => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 1. Find all paving stage IDs (across all tenants)
    const { data: pavingStages, error: stagesError } = await supabase
      .from('pipeline_stage')
      .select('id, tenant_id, label')
      .eq('is_paving_stage', true)

    if (stagesError || !pavingStages?.length) {
      logger.warn('No paving stages found', { error: stagesError })
      return { checked: 0, tasksCreated: 0 }
    }

    logger.info(`Found ${pavingStages.length} paving stage(s)`)

    // 2. Find projects currently at a paving stage
    const pavingStageIds = pavingStages.map((s) => s.id)

    const { data: pavingProjects, error: projectsError } = await supabase
      .from('project')
      .select('id, tenant_id, name, owner_id, current_stage_id')
      .in('current_stage_id', pavingStageIds)
      .is('deleted_at', null)

    if (projectsError) {
      logger.error('Error fetching paving projects', { error: projectsError })
      return { checked: 0, tasksCreated: 0 }
    }

    if (!pavingProjects?.length) {
      logger.info('No projects currently at paving stage')
      return { checked: 0, tasksCreated: 0 }
    }

    logger.info(`Found ${pavingProjects.length} project(s) at paving stage`)

    // 3. Find which projects already have an open paving_followup task
    const projectIds = pavingProjects.map((p) => p.id)

    const { data: existingTasks } = await supabase
      .from('task')
      .select('project_id')
      .in('project_id', projectIds)
      .eq('type', 'paving_followup')
      .eq('is_done', false)
      .is('deleted_at', null)

    const projectsWithTask = new Set((existingTasks ?? []).map((t) => t.project_id))

    // 4. For projects without an open paving_followup task, create one
    const projectsNeedingTask = pavingProjects.filter((p) => !projectsWithTask.has(p.id))

    logger.info(`Creating tasks for ${projectsNeedingTask.length} project(s)`)

    let tasksCreated = 0

    for (const project of projectsNeedingTask) {
      const { data: task, error: taskError } = await supabase
        .from('task')
        .insert({
          tenant_id: project.tenant_id,
          project_id: project.id,
          type: 'paving_followup',
          title: `Follow up: ${project.name} has reached paving stage`,
          priority: 'high',
          is_done: false,
          assignee_id: project.owner_id,
        })
        .select('id')
        .single()

      if (taskError) {
        logger.error(`Failed to create task for project ${project.id}`, { error: taskError })
        continue
      }

      // Create notification for the owner
      await supabase.from('notification').insert({
        tenant_id: project.tenant_id,
        user_id: project.owner_id,
        type: 'paving_stage_alert',
        title: 'Project reached paving stage',
        body: `${project.name} is at the paving stage. Follow up now to avoid losing this specification.`,
        is_read: false,
        entity_type: 'project',
        entity_id: project.id,
      })

      // Log activity on the project timeline
      await supabase.from('activity').insert({
        tenant_id: project.tenant_id,
        entity_type: 'project',
        entity_id: project.id,
        project_id: project.id,
        type: 'notification',
        actor_id: project.owner_id,
        content: {
          note: 'Paving stage follow-up task created automatically',
          task_id: task.id,
        },
      })

      tasksCreated++
      logger.info(`Created follow-up task for project ${project.id} (${project.name})`)
    }

    return { checked: pavingProjects.length, tasksCreated }
  }
)

export const staleSampleCheck = inngest.createFunction(
  { id: 'sample-stale-check', triggers: [{ cron: '30 4 * * *' }] }, // 10:00 AM IST daily
  async ({ logger }: { logger: { info: (msg: string, meta?: unknown) => void; warn: (msg: string, meta?: unknown) => void; error: (msg: string, meta?: unknown) => void } }) => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const cutoff = new Date(Date.now() - STALE_SAMPLE_DAYS * 24 * 60 * 60 * 1000).toISOString()

    // Find samples that were dispatched 7+ days ago and still have no outcome
    const { data: staleSamples, error: fetchErr } = await supabase
      .from('sample_request')
      .select('id, tenant_id, project_id, dispatched_at, product:product_id(name), contact:contact_id(full_name)')
      .in('status', ['dispatched', 'delivered'])
      .lt('dispatched_at', cutoff)
      .is('deleted_at', null)

    if (fetchErr) {
      logger.error('Error fetching stale samples', { error: fetchErr })
      return { checked: 0, tasksCreated: 0 }
    }

    if (!staleSamples?.length) {
      logger.info('No stale samples found')
      return { checked: 0, tasksCreated: 0 }
    }

    logger.info(`Found ${staleSamples.length} stale sample(s)`)

    // Find which samples already have an open follow-up task
    const sampleIds = staleSamples.map((s) => s.id)
    const { data: existingTasks } = await supabase
      .from('task')
      .select('source_entity_id')
      .in('source_entity_id', sampleIds)
      .eq('type', 'sample_outcome')
      .eq('is_done', false)
      .is('deleted_at', null)

    const samplesWithTask = new Set((existingTasks ?? []).map((t) => t.source_entity_id))

    let tasksCreated = 0

    for (const sample of staleSamples) {
      if (samplesWithTask.has(sample.id)) continue

      const product = (Array.isArray(sample.product) ? sample.product[0] : sample.product) as { name: string } | null
      const contact = (Array.isArray(sample.contact) ? sample.contact[0] : sample.contact) as { full_name: string } | null

      const contactLabel = contact?.full_name ? ` (sent to ${contact.full_name})` : ''
      const productLabel = product?.name ?? 'sample'
      const daysStale = Math.floor((Date.now() - new Date(sample.dispatched_at as string).getTime()) / (24 * 60 * 60 * 1000))

      const { error: taskErr } = await supabase.from('task').insert({
        tenant_id: sample.tenant_id,
        project_id: sample.project_id,
        type: 'sample_outcome',
        title: `Follow up: ${productLabel} sample dispatched ${daysStale} days ago — no outcome recorded${contactLabel}`,
        priority: 'high',
        is_done: false,
        source_entity_type: 'sample_request',
        source_entity_id: sample.id,
      })

      if (taskErr) {
        logger.error(`Failed to create task for sample ${sample.id}`, { error: taskErr })
        continue
      }

      // Write to project timeline
      await supabase.from('activity').insert({
        tenant_id: sample.tenant_id,
        entity_type: 'project',
        entity_id: sample.project_id,
        project_id: sample.project_id,
        type: 'notification',
        content: {
          note: `Sample follow-up task auto-created: ${productLabel} dispatched ${daysStale} days ago with no outcome`,
        },
      })

      tasksCreated++
      logger.info(`Created sample_outcome task for sample ${sample.id}`)
    }

    return { checked: staleSamples.length, tasksCreated }
  }
)
