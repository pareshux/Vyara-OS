/**
 * Workflow Engine — Config Schema
 *
 * One engine drives ALL state machines in Vyara:
 * projects (per segment), quotations, samples, collections, complaints.
 *
 * A WorkflowTemplate is pure config stored in the DB.
 * The engine reads config + entity state → decides what's allowed → executes.
 * No code changes required to add a new pipeline or modify an existing one.
 */

// ─── Action types ─────────────────────────────────────────────────────────────

export type NotifyAction = {
  type: 'notify';
  config: {
    template: string;
    recipients: Array<'owner' | 'assignee' | 'manager' | 'coo' | 'accounts' | string>;
    channels: Array<'email' | 'whatsapp' | 'sms' | 'in_app'>;
  };
};

export type AssignAction = {
  type: 'assign';
  config: {
    to_role: string;
    round_robin?: boolean;
  };
};

export type CreateTaskAction = {
  type: 'create_task';
  config: {
    title: string;
    due_offset_hours: number;
    assigned_to_role: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
  };
};

export type WebhookAction = {
  type: 'webhook';
  config: {
    url: string;
    method: 'POST' | 'PUT';
    payload_template: string; // Handlebars template string
  };
};

export type GenerateDocumentAction = {
  type: 'generate_document';
  config: {
    template_key: string;
    output_type: 'pdf' | 'docx';
    attach_to_entity: boolean;
  };
};

export type SetFieldAction = {
  type: 'set_field';
  config: {
    field: string;
    value: unknown; // static value; supports {{transition.actor_id}} tokens
  };
};

export type WorkflowAction =
  | NotifyAction
  | AssignAction
  | CreateTaskAction
  | WebhookAction
  | GenerateDocumentAction
  | SetFieldAction;

// ─── Guard conditions ──────────────────────────────────────────────────────────

/**
 * Guards block a transition until the entity satisfies all conditions.
 * v1 supports three types only — deliberately simple.
 */
export type RequiredFieldsGuard = {
  type: 'required_fields';
  config: {
    fields: string[]; // dot-notation paths on the entity, e.g. "architect_firm_id"
    error_message: string;
  };
};

export type RequiredDocumentsGuard = {
  type: 'required_documents';
  config: {
    document_types: string[];
    error_message: string;
  };
};

export type ApprovalGrantedGuard = {
  type: 'approval_granted';
  config: {
    approval_type: string; // matches approval_request.type
    error_message: string;
  };
};

export type GuardCondition =
  | RequiredFieldsGuard
  | RequiredDocumentsGuard
  | ApprovalGrantedGuard;

// ─── SLA ──────────────────────────────────────────────────────────────────────

export type SLAConfig = {
  duration_hours: number;
  reminder_at_percent?: number; // e.g. 80 → notify when 80% of SLA elapsed
  escalation_actions: WorkflowAction[];
};

// ─── Stage ────────────────────────────────────────────────────────────────────

export type SubStage = {
  id: string;
  label: string;
  order: number;
  is_optional: boolean;
};

export type Stage = {
  id: string;
  label: string;
  order: number;
  color?: string; // hex — used in Kanban + stepper
  is_terminal: boolean;
  sub_stages?: SubStage[];
  sla?: SLAConfig;
  /** Fired when the engine enters this stage (after transition commits). */
  entry_actions: WorkflowAction[];
  /**
   * Must all pass before ANY forward transition from this stage executes.
   * Checked in addition to transition-level guard_conditions.
   * Use for "you can't leave this stage without X" invariants.
   */
  exit_conditions: GuardCondition[];
};

// ─── Transition ───────────────────────────────────────────────────────────────

export type Transition = {
  id: string;
  label: string;
  /** Stage id, or '*' to match any current stage (used for back-flow shortcuts). */
  from_stage: string;
  to_stage: string;
  /**
   * true = regression. UI renders differently (warning colour, remark enforced).
   * requires_remark is auto-forced to true when is_back_flow is true.
   */
  is_back_flow: boolean;
  requires_remark: boolean;
  /** All must pass. Evaluated after stage exit_conditions. */
  guard_conditions: GuardCondition[];
  /** RBAC: only these roles may trigger this transition. */
  allowed_roles: string[];
  /** Queued to Inngest after the DB transition commits. Async, non-blocking. */
  actions: WorkflowAction[];
};

// ─── Template ─────────────────────────────────────────────────────────────────

export type WorkflowType =
  | 'project'
  | 'quotation'
  | 'sample'
  | 'collection'
  | 'complaint';

export type WorkflowTemplate = {
  id: string;
  /** 'system' = platform default; UUID = tenant override */
  tenant_id: string;
  workflow_type: WorkflowType;
  /** Null = applies to all segments of this type */
  segment: string | null;
  version: number;
  label: string;
  initial_stage: string;
  stages: Stage[];
  transitions: Transition[];
};

// ─── Runtime types (engine state) ─────────────────────────────────────────────

export type WorkflowInstance = {
  id: string;
  tenant_id: string;
  template_id: string;
  entity_type: WorkflowType;
  entity_id: string;
  current_stage: string;
  sla_deadline_at: string | null; // ISO timestamp
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TransitionLogEntry = {
  id: string;
  tenant_id: string;
  instance_id: string;
  transition_id: string;
  from_stage: string;
  to_stage: string;
  is_back_flow: boolean;
  actor_id: string;
  actor_role: string;
  remark: string | null;
  guard_results: GuardCheckResult[];
  actions_queued: WorkflowAction[];
  created_at: string;
};

export type GuardCheckResult = {
  guard: GuardCondition;
  passed: boolean;
  error_message?: string;
};

export type TransitionResult =
  | { ok: true; new_stage: string; log_id: string }
  | { ok: false; error: string; failed_guards: GuardCheckResult[] };

// ─── Engine input ─────────────────────────────────────────────────────────────

export type ExecuteTransitionParams = {
  instance_id: string;
  transition_id: string;
  actor_id: string;
  actor_role: string;
  remark?: string;
  /** Resolved entity snapshot used for guard evaluation */
  entity_snapshot: Record<string, unknown>;
  /** Document types currently attached to the entity */
  attached_document_types: string[];
  /** Granted approval types on the entity */
  granted_approval_types: string[];
};
