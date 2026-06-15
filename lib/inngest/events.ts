/**
 * Inngest event catalog — every domain event Vyara emits.
 *
 * Convention: <domain>/<noun>.<past_verb>
 * Add events here as new domains are built; never publish unlisted events.
 */

export type VyaraEvents = {
  // Workflow
  'workflow/actions.dispatch': {
    data: {
      instance_id: string;
      log_id: string;
      transition_id: string;
      from_stage: string;
      to_stage: string;
      actor_id: string;
      actor_role: string;
      entity_snapshot: Record<string, unknown>;
      actions: unknown[];
    };
  };
  'workflow/sla.breached': {
    data: { instance_id: string; stage: string; entity_type: string; entity_id: string };
  };

  // Lead / Sales
  'lead.captured': { data: { lead_id: string; tenant_id: string; source: string } };
  'lead.assigned': { data: { lead_id: string; assigned_to: string } };
  'lead.qualified': { data: { lead_id: string } };

  // Project
  'project.created': { data: { project_id: string; segment: string } };
  'project.stage_changed': {
    data: {
      project_id: string;
      from_stage: string;
      to_stage: string;
      actor_id: string;
      is_back_flow: boolean;
    };
  };
  'project.dormant': { data: { project_id: string; days_inactive: number } };

  // Specification
  'specification.recorded': { data: { spec_id: string; project_id: string } };
  'specification.paving_stage_reached': { data: { project_id: string } };

  // Sample
  'sample.requested': { data: { sample_id: string; project_id: string } };
  'sample.dispatched': { data: { sample_id: string } };
  'sample.no_outcome': { data: { sample_id: string; days_since_dispatch: number } };

  // Quote
  'quote.created': { data: { quote_id: string; project_id: string } };
  'quote.submitted_for_approval': { data: { quote_id: string; approver_id: string } };
  'quote.approved': { data: { quote_id: string } };
  'quote.sent': { data: { quote_id: string } };
  'quote.won': { data: { quote_id: string; order_value: number } };
  'quote.lost': { data: { quote_id: string; reason_code: string } };

  // Order / Dispatch
  'order.created': { data: { order_id: string; quote_id: string } };
  'dispatch.scheduled': { data: { dispatch_id: string; order_id: string } };
  'dispatch.completed': { data: { dispatch_id: string; pod_url?: string } };

  // Finance
  'invoice.synced': { data: { invoice_id: string; source: 'tally' | 'manual' } };
  'invoice.overdue': { data: { invoice_id: string; days_overdue: number } };
  'payment.promised': { data: { promise_id: string; amount: number; promise_date: string } };
  'payment.received': { data: { invoice_id: string; amount: number } };

  // Complaint
  'complaint.logged': { data: { complaint_id: string; project_id: string } };
  'complaint.sla_breached': { data: { complaint_id: string } };
  'complaint.resolved': { data: { complaint_id: string } };

  // Document
  'document.received': { data: { doc_id: string; source: string; raw_type?: string } };
  'document.extracted': { data: { doc_id: string; doc_type: string } };
  'document.approved': { data: { doc_id: string } };

  // Approval
  'approval.requested': { data: { approval_id: string; type: string; entity_id: string } };
  'approval.granted': { data: { approval_id: string } };
  'approval.rejected': { data: { approval_id: string; reason: string } };

  // AI
  'ai.action_logged': {
    data: {
      skill: string;
      entity_type: string;
      entity_id: string;
      actor: 'autonomous' | 'assisted';
      outcome: 'accepted' | 'edited' | 'rejected';
    };
  };
};
