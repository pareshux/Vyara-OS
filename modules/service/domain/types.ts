export type ComplaintStatus =
  | 'logged'
  | 'triaged'
  | 'assigned'
  | 'in_progress'
  | 'resolved'
  | 'escalated'
  | 'closed';

export type Complaint = {
  id: string;
  tenant_id: string;
  project_id: string;
  customer_id: string;
  workflow_instance_id: string;
  status: ComplaintStatus;
  category: string;
  description: string;
  assigned_to?: string;
  resolution_notes?: string;
  resolved_at?: string;
  created_at: string;
};

export type Dealer = {
  id: string;
  tenant_id: string;
  company_id: string;
  tier: 'platinum' | 'gold' | 'silver' | 'registered';
  credit_limit?: number;
  outstanding_balance: number;
  territory_id?: string;
  onboarded_at: string;
  is_active: boolean;
};
