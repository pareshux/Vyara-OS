'use server'

/**
 * Lead module server actions.
 *
 * Reuses the platform spine: activity for the timeline, task for follow-ups,
 * notification for owner alerts. Cross-module communication via Inngest events
 * (lead.created, lead.stage_changed, lead.won, lead.lost) — never direct writes.
 *
 * Margin/cost guard: lead.estimated_value is visible to all roles by design
 * (it's the deal-size signal sales engineers use to prioritise). Cost/margin
 * still lives on quote/order where it's masked from sales_engineer.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { inngest } from '@/lib/inngest/client'

async function getActorContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role, full_name')
    .eq('id', user.id)
    .single()
  if (!profile) return null
  return { supabase, userId: user.id, tenantId: profile.tenant_id, role: profile.role, fullName: profile.full_name }
}

// ─── createLead ─────────────────────────────────────────────────────────────

export async function createLead(params: {
  title: string
  segment: 'architect' | 'dealer' | 'tender' | 'retail' | 'government' | 'corporate' | 'generic'
  source_id?: string
  owner_id?: string
  buyer_firm_id?: string
  primary_contact_id?: string
  contact_name_raw?: string
  contact_phone_raw?: string
  contact_email_raw?: string
  city?: string
  state?: string
  territory?: string
  estimated_value?: number
  expected_close_at?: string  // YYYY-MM-DD
  notes?: string
}): Promise<{ id: string; lead_number: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  if (!params.title.trim()) return { error: 'Title is required' }

  // Resolve initial stage = 'new' (system seed)
  const { data: stage } = await supabase
    .from('lead_stage')
    .select('id')
    .is('tenant_id', null)
    .eq('stage_key', 'new')
    .single()
  if (!stage) return { error: 'Lead stages not seeded — run migration 0022.' }

  // Default owner = current user; explicit owner_id overrides
  const ownerId = params.owner_id ?? userId

  const { data: lead, error } = await supabase
    .from('lead')
    .insert({
      tenant_id: tenantId,
      title: params.title.trim(),
      segment: params.segment,
      source_id: params.source_id ?? null,
      current_stage_id: stage.id,
      owner_id: ownerId,
      buyer_firm_id: params.buyer_firm_id ?? null,
      primary_contact_id: params.primary_contact_id ?? null,
      contact_name_raw: params.contact_name_raw ?? null,
      contact_phone_raw: params.contact_phone_raw ?? null,
      contact_email_raw: params.contact_email_raw ?? null,
      city: params.city ?? null,
      state: params.state ?? 'Gujarat',
      territory: params.territory ?? null,
      estimated_value: params.estimated_value ?? null,
      expected_close_at: params.expected_close_at ?? null,
      notes: params.notes ?? null,
      created_by: userId,
      updated_by: userId,
    })
    .select('id, lead_number')
    .single()

  if (error) return { error: error.message }

  // Write initial stage history
  await supabase.from('lead_stage_history').insert({
    tenant_id: tenantId,
    lead_id: lead.id,
    from_stage_id: null,
    to_stage_id: stage.id,
    actor_id: userId,
    remark: 'Lead captured',
  })

  // Notify owner if not self-assigned
  if (ownerId !== userId) {
    await supabase.from('notification').insert({
      tenant_id: tenantId,
      user_id: ownerId,
      type: 'lead_assigned',
      title: `New lead: ${lead.lead_number}`,
      body: `${params.title} — ${ctx.fullName ?? 'a teammate'} assigned this to you.`,
      entity_type: 'lead',
      entity_id: lead.id,
    })
  }

  try {
    await inngest.send({ name: 'lead.captured' as never, data: { lead_id: lead.id, tenant_id: tenantId, source: params.source_id ?? 'unknown' } } as never)
  } catch (e) { console.warn('inngest.send(lead.captured) failed (non-fatal):', e) }

  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return { id: lead.id, lead_number: lead.lead_number as string }
}

// ─── advanceLeadStage ──────────────────────────────────────────────────────

export async function advanceLeadStage(
  leadId: string,
  toStageId: string,
  remark?: string
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  const { data: lead } = await supabase
    .from('lead')
    .select('id, current_stage_id, title, lead_number, owner_id')
    .eq('id', leadId)
    .single()
  if (!lead) return { error: 'Lead not found' }
  if (lead.current_stage_id === toStageId) return { ok: true }

  const { data: toStage } = await supabase
    .from('lead_stage')
    .select('id, label, is_terminal, is_won, is_lost')
    .eq('id', toStageId)
    .single()
  if (!toStage) return { error: 'Target stage not found' }

  // Block won/lost via this action — markLeadWon/Lost have richer side-effects
  if (toStage.is_won || toStage.is_lost) {
    return { error: 'Use Mark Won / Mark Lost actions for terminal stages.' }
  }

  const nowIso = new Date().toISOString()
  const { error: uErr } = await supabase
    .from('lead')
    .update({
      current_stage_id: toStageId,
      last_activity_at: nowIso,
      updated_at: nowIso,
      updated_by: userId,
    })
    .eq('id', leadId)
  if (uErr) return { error: uErr.message }

  await supabase.from('lead_stage_history').insert({
    tenant_id: tenantId,
    lead_id: leadId,
    from_stage_id: lead.current_stage_id,
    to_stage_id: toStageId,
    actor_id: userId,
    remark: remark ?? null,
  })

  await supabase.from('activity').insert({
    tenant_id: tenantId,
    entity_type: 'lead',
    entity_id: leadId,
    project_id: null,
    type: 'stage_changed',
    actor_id: userId,
    content: { note: `Stage advanced to ${toStage.label}`, remark: remark ?? null },
  })

  try {
    await inngest.send({
      name: 'lead.stage_changed' as never,
      data: { lead_id: leadId, from_stage: lead.current_stage_id, to_stage: toStageId, actor_id: userId },
    } as never)
  } catch (e) { console.warn('inngest.send(lead.stage_changed) failed (non-fatal):', e) }

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  return { ok: true }
}

// ─── assignLead ────────────────────────────────────────────────────────────

export async function assignLead(
  leadId: string,
  newOwnerId: string
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId, fullName } = ctx

  const { data: lead } = await supabase
    .from('lead')
    .select('owner_id, lead_number, title')
    .eq('id', leadId)
    .single()
  if (!lead) return { error: 'Lead not found' }
  if (lead.owner_id === newOwnerId) return { ok: true }

  const { error } = await supabase
    .from('lead')
    .update({ owner_id: newOwnerId, updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', leadId)
  if (error) return { error: error.message }

  // Get new owner's display name for the activity
  const { data: newOwner } = await supabase
    .from('user_profile')
    .select('full_name')
    .eq('id', newOwnerId)
    .single()

  await supabase.from('activity').insert({
    tenant_id: tenantId,
    entity_type: 'lead',
    entity_id: leadId,
    project_id: null,
    type: 'lead_assigned',
    actor_id: userId,
    content: { note: `Assigned to ${newOwner?.full_name ?? 'new owner'}` },
  })

  await supabase.from('notification').insert({
    tenant_id: tenantId,
    user_id: newOwnerId,
    type: 'lead_assigned',
    title: `Lead assigned: ${lead.lead_number}`,
    body: `${lead.title} — ${fullName ?? 'a teammate'} assigned this to you.`,
    entity_type: 'lead',
    entity_id: leadId,
  })

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  return { ok: true }
}

// ─── logLeadActivity (call / visit / note / meeting) ───────────────────────

export async function logLeadActivity(params: {
  lead_id: string
  type: 'call' | 'visit' | 'note' | 'lead_meeting'
  note: string
}): Promise<{ ok: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  if (!params.note.trim()) return { error: 'A note is required.' }

  await supabase.from('activity').insert({
    tenant_id: tenantId,
    entity_type: 'lead',
    entity_id: params.lead_id,
    project_id: null,
    type: params.type,
    actor_id: userId,
    content: { note: params.note.trim() },
  })

  await supabase
    .from('lead')
    .update({ last_activity_at: new Date().toISOString() })
    .eq('id', params.lead_id)

  revalidatePath(`/leads/${params.lead_id}`)
  return { ok: true }
}

// ─── markLeadWon (creates linked project) ──────────────────────────────────

export async function markLeadWon(
  leadId: string,
  params: { remark?: string; create_project?: boolean }
): Promise<{ ok: true; project_id: string | null } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  const { data: lead } = await supabase
    .from('lead')
    .select(
      `id, current_stage_id, title, segment, lead_number, owner_id,
       buyer_firm_id, architect_firm_id, city, state, estimated_value, won_project_id`
    )
    .eq('id', leadId)
    .single()
  if (!lead) return { error: 'Lead not found' }
  if (lead.won_project_id) return { error: 'Lead already won and converted.' }

  const { data: wonStage } = await supabase
    .from('lead_stage')
    .select('id, label')
    .is('tenant_id', null)
    .eq('stage_key', 'won')
    .single()
  if (!wonStage) return { error: 'Won stage not seeded.' }

  // Optionally create the linked project
  let projectId: string | null = null
  if (params.create_project !== false) {
    // Resolve the project initial stage for this segment
    const { data: initStage } = await supabase
      .from('pipeline_stage')
      .select('id')
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .eq('segment', lead.segment.toLowerCase())
      .order('order_index', { ascending: true })
      .limit(1)
      .single()

    if (initStage) {
      const { data: newProj } = await supabase
        .from('project')
        .insert({
          tenant_id: tenantId,
          name: lead.title,
          segment: lead.segment,
          current_stage_id: initStage.id,
          owner_id: lead.owner_id,
          buyer_firm_id: lead.buyer_firm_id ?? null,
          architect_firm_id: lead.architect_firm_id ?? null,
          city: lead.city ?? null,
          estimated_value: lead.estimated_value ?? null,
        })
        .select('id')
        .single()
      projectId = newProj?.id ?? null

      if (projectId) {
        await supabase.from('project_stage_history').insert({
          tenant_id: tenantId,
          project_id: projectId,
          from_stage_id: null,
          to_stage_id: initStage.id,
          actor_id: userId,
          remark: `Converted from won lead ${lead.lead_number}`,
        })

        await supabase.from('activity').insert({
          tenant_id: tenantId,
          entity_type: 'project',
          entity_id: projectId,
          project_id: projectId,
          type: 'created',
          actor_id: userId,
          content: { note: `Project created from won lead ${lead.lead_number}` },
        })
      }
    }
  }

  // Update the lead — terminal state
  const nowIso = new Date().toISOString()
  await supabase
    .from('lead')
    .update({
      current_stage_id: wonStage.id,
      won_at: nowIso,
      won_project_id: projectId,
      last_activity_at: nowIso,
      updated_at: nowIso,
      updated_by: userId,
    })
    .eq('id', leadId)

  await supabase.from('lead_stage_history').insert({
    tenant_id: tenantId,
    lead_id: leadId,
    from_stage_id: lead.current_stage_id,
    to_stage_id: wonStage.id,
    actor_id: userId,
    remark: params.remark ?? 'Won',
  })

  await supabase.from('activity').insert({
    tenant_id: tenantId,
    entity_type: 'lead',
    entity_id: leadId,
    project_id: projectId,
    type: 'lead_won',
    actor_id: userId,
    content: {
      note: projectId ? `Won — project created` : 'Won',
      remark: params.remark ?? null,
      project_id: projectId,
    },
  })

  try {
    await inngest.send({
      name: 'lead.won' as never,
      data: { lead_id: leadId, project_id: projectId, value: lead.estimated_value },
    } as never)
  } catch (e) { console.warn('inngest.send(lead.won) failed (non-fatal):', e) }

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  revalidatePath('/dashboard')
  if (projectId) revalidatePath(`/projects/${projectId}`)
  return { ok: true, project_id: projectId }
}

// ─── markLeadLost ──────────────────────────────────────────────────────────

export async function markLeadLost(
  leadId: string,
  params: { reason_id: string; remark?: string }
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  if (!params.reason_id) return { error: 'A loss reason is required.' }

  const { data: lead } = await supabase
    .from('lead')
    .select('id, current_stage_id, lead_number')
    .eq('id', leadId)
    .single()
  if (!lead) return { error: 'Lead not found' }

  const { data: lostStage } = await supabase
    .from('lead_stage')
    .select('id, label')
    .is('tenant_id', null)
    .eq('stage_key', 'lost')
    .single()
  if (!lostStage) return { error: 'Lost stage not seeded.' }

  const nowIso = new Date().toISOString()
  const { error } = await supabase
    .from('lead')
    .update({
      current_stage_id: lostStage.id,
      lost_at: nowIso,
      lost_reason_id: params.reason_id,
      lost_remark: params.remark ?? null,
      last_activity_at: nowIso,
      updated_at: nowIso,
      updated_by: userId,
    })
    .eq('id', leadId)
  if (error) return { error: error.message }

  await supabase.from('lead_stage_history').insert({
    tenant_id: tenantId,
    lead_id: leadId,
    from_stage_id: lead.current_stage_id,
    to_stage_id: lostStage.id,
    actor_id: userId,
    remark: params.remark ?? 'Lost',
  })

  await supabase.from('activity').insert({
    tenant_id: tenantId,
    entity_type: 'lead',
    entity_id: leadId,
    project_id: null,
    type: 'lead_lost',
    actor_id: userId,
    content: { note: 'Lead marked lost', remark: params.remark ?? null, reason_id: params.reason_id },
  })

  try {
    await inngest.send({
      name: 'lead.lost' as never,
      data: { lead_id: leadId, reason_id: params.reason_id },
    } as never)
  } catch (e) { console.warn('inngest.send(lead.lost) failed (non-fatal):', e) }

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  return { ok: true }
}
