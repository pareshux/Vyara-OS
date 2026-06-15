export type PipelineSegment =
  | 'architect'
  | 'dealer'
  | 'tender'
  | 'retail'
  | 'government'
  | 'corporate';

export type Lead = {
  id: string;
  tenant_id: string;
  name: string;
  company_id?: string;
  contact_id?: string;
  source: 'inbound' | 'outbound' | 'indiamart' | 'website' | 'referral' | 'tender';
  segment: PipelineSegment;
  estimated_value?: number;
  assigned_to?: string;
  status: 'new' | 'qualified' | 'converted' | 'dead';
  created_at: string;
};

export type Project = {
  id: string;
  tenant_id: string;
  name: string;
  segment: PipelineSegment;
  pipeline_template_id: string;
  workflow_instance_id: string;
  current_stage: string;
  /** The buying company */
  buyer_company_id: string;
  /** The specifying architect firm, if any */
  architect_firm_id?: string;
  territory_id: string;
  owner_id: string;        // field engineer / inside sales
  estimated_value?: number;
  order_value?: number;
  won_quote_id?: string;
  loss_reason_code?: string;
  city?: string;
  /** JSON blob for custom fields — Phase 2 graduates to a full form engine */
  custom_fields: Record<string, unknown>;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
};

export type ProjectStakeholder = {
  id: string;
  project_id: string;
  contact_id: string;
  role: 'specifier' | 'buyer' | 'influencer' | 'decision_maker' | 'contractor';
  is_primary: boolean;
};
