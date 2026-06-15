import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ExecuteTransitionParams,
  GuardCheckResult,
  GuardCondition,
  Stage,
  Transition,
  TransitionResult,
  WorkflowTemplate,
} from './types';
import { inngest } from '@/lib/inngest/client';

// ─── Guard evaluation ─────────────────────────────────────────────────────────

function evaluateGuard(
  guard: GuardCondition,
  ctx: {
    entity: Record<string, unknown>;
    document_types: string[];
    approval_types: string[];
  }
): GuardCheckResult {
  if (guard.type === 'required_fields') {
    const missing = guard.config.fields.filter((f) => {
      const val = f.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], ctx.entity);
      return val === null || val === undefined || val === '';
    });
    return missing.length === 0
      ? { guard, passed: true }
      : { guard, passed: false, error_message: guard.config.error_message };
  }

  if (guard.type === 'required_documents') {
    const missing = guard.config.document_types.filter(
      (dt) => !ctx.document_types.includes(dt)
    );
    return missing.length === 0
      ? { guard, passed: true }
      : { guard, passed: false, error_message: guard.config.error_message };
  }

  if (guard.type === 'approval_granted') {
    const granted = ctx.approval_types.includes(guard.config.approval_type);
    return granted
      ? { guard, passed: true }
      : { guard, passed: false, error_message: guard.config.error_message };
  }

  // Unknown guard type — fail safe
  return { guard, passed: false, error_message: 'Unknown guard type' };
}

function checkAllGuards(
  guards: GuardCondition[],
  ctx: Parameters<typeof evaluateGuard>[1]
): GuardCheckResult[] {
  return guards.map((g) => evaluateGuard(g, ctx));
}

// ─── Transition resolution ────────────────────────────────────────────────────

function resolveTransition(
  template: WorkflowTemplate,
  transition_id: string,
  current_stage: string
): { transition: Transition; stage: Stage } | null {
  const transition = template.transitions.find((t) => t.id === transition_id);
  if (!transition) return null;

  const matchesFrom =
    transition.from_stage === '*' || transition.from_stage === current_stage;
  if (!matchesFrom) return null;

  const stage = template.stages.find((s) => s.id === current_stage);
  if (!stage) return null;

  return { transition, stage };
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export async function executeTransition(
  db: SupabaseClient,
  params: ExecuteTransitionParams
): Promise<TransitionResult> {
  const { instance_id, transition_id, actor_id, actor_role, remark, entity_snapshot, attached_document_types, granted_approval_types } = params;

  // 1. Load instance + template
  const { data: instance, error: instanceErr } = await db
    .from('workflow_instance')
    .select('*, workflow_template(*)')
    .eq('id', instance_id)
    .single();

  if (instanceErr || !instance) {
    return { ok: false, error: 'Instance not found', failed_guards: [] };
  }

  const template = instance.workflow_template as WorkflowTemplate;
  const resolved = resolveTransition(template, transition_id, instance.current_stage);

  if (!resolved) {
    return {
      ok: false,
      error: `Transition '${transition_id}' is not valid from stage '${instance.current_stage}'`,
      failed_guards: [],
    };
  }

  const { transition, stage } = resolved;

  // 2. RBAC check
  if (!transition.allowed_roles.includes(actor_role)) {
    return {
      ok: false,
      error: `Role '${actor_role}' is not permitted to execute this transition`,
      failed_guards: [],
    };
  }

  // 3. Remark enforcement (back-flows always require it)
  if ((transition.requires_remark || transition.is_back_flow) && !remark?.trim()) {
    return {
      ok: false,
      error: 'A remark is required before this transition can be executed',
      failed_guards: [],
    };
  }

  // 4. Guard evaluation: stage exit_conditions first, then transition guards
  const guardCtx = {
    entity: entity_snapshot,
    document_types: attached_document_types,
    approval_types: granted_approval_types,
  };

  const allGuards = [...stage.exit_conditions, ...transition.guard_conditions];
  const guardResults = checkAllGuards(allGuards, guardCtx);
  const failed = guardResults.filter((r) => !r.passed);

  if (failed.length > 0) {
    return { ok: false, error: failed[0].error_message ?? 'Guard failed', failed_guards: failed };
  }

  // 5. Compute new SLA deadline
  const toStage = template.stages.find((s) => s.id === transition.to_stage);
  const sla_deadline_at = toStage?.sla
    ? new Date(Date.now() + toStage.sla.duration_hours * 3_600_000).toISOString()
    : null;

  // 6. Commit transition atomically
  const { data: logEntry, error: txError } = await db.rpc('commit_workflow_transition', {
    p_instance_id: instance_id,
    p_to_stage: transition.to_stage,
    p_sla_deadline_at: sla_deadline_at,
    p_transition_id: transition_id,
    p_from_stage: instance.current_stage,
    p_is_back_flow: transition.is_back_flow,
    p_actor_id: actor_id,
    p_actor_role: actor_role,
    p_remark: remark ?? null,
    p_guard_results: guardResults,
    p_actions_queued: [...(toStage?.entry_actions ?? []), ...transition.actions],
  });

  if (txError || !logEntry) {
    return { ok: false, error: 'Failed to commit transition', failed_guards: [] };
  }

  // 7. Dispatch actions to Inngest (non-blocking, survives failures)
  const actionsToFire = [...(toStage?.entry_actions ?? []), ...transition.actions];
  if (actionsToFire.length > 0) {
    await inngest.send({
      name: 'workflow/actions.dispatch',
      data: {
        instance_id,
        log_id: logEntry.id,
        transition_id,
        from_stage: instance.current_stage,
        to_stage: transition.to_stage,
        actor_id,
        actor_role,
        entity_snapshot,
        actions: actionsToFire,
      },
    });
  }

  return { ok: true, new_stage: transition.to_stage, log_id: logEntry.id };
}

// ─── Available transitions (for UI) ──────────────────────────────────────────

export function getAvailableTransitions(
  template: WorkflowTemplate,
  current_stage: string,
  actor_role: string
): Transition[] {
  return template.transitions.filter(
    (t) =>
      (t.from_stage === '*' || t.from_stage === current_stage) &&
      t.allowed_roles.includes(actor_role)
  );
}
