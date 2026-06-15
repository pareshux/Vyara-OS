export type Invoice = {
  id: string;
  tenant_id: string;
  project_id: string;
  order_id?: string;
  customer_id: string;
  tally_invoice_no?: string;
  amount: number;
  outstanding_amount: number;
  due_date: string;
  days_overdue?: number;
  source: 'tally' | 'manual';
  synced_at?: string;
  created_at: string;
};

export type Receipt = {
  id: string;
  tenant_id: string;
  invoice_id: string;
  amount: number;
  payment_mode: 'cheque' | 'neft' | 'rtgs' | 'upi' | 'cash';
  payment_reference?: string;
  received_at: string;
  created_by: string;
};

export type PromiseToPay = {
  id: string;
  tenant_id: string;
  invoice_id: string;
  promise_amount: number;
  promise_date: string;
  contact_id?: string;
  is_honoured?: boolean;
  notes?: string;
  created_by: string;
  created_at: string;
};

export type CollectionInstance = {
  id: string;
  tenant_id: string;
  invoice_id: string;
  workflow_instance_id: string;
  current_stage: string;
  payment_reference?: string;
  created_at: string;
};
