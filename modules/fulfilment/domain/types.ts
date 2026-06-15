export type SalesOrder = {
  id: string;
  tenant_id: string;
  project_id: string;
  quotation_id: string;
  customer_id: string;
  status: 'created' | 'in_production' | 'ready_to_dispatch' | 'partially_dispatched' | 'fully_dispatched';
  total_value: number;
  notes?: string;
  created_at: string;
};

export type Dispatch = {
  id: string;
  tenant_id: string;
  order_id: string;
  project_id: string;
  scheduled_at?: string;
  dispatched_at?: string;
  delivered_at?: string;
  transporter?: string;
  lr_number?: string;        // Lorry Receipt
  pod_url?: string;          // Proof of Delivery document
  status: 'scheduled' | 'dispatched' | 'delivered' | 'pod_uploaded';
};
