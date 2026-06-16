import { inngest } from './client'
import { createClient } from '@supabase/supabase-js'

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
