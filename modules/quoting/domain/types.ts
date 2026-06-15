export type QuotationStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'sent'
  | 'negotiating'
  | 'won'
  | 'lost'
  | 'expired';

export type Quotation = {
  id: string;
  tenant_id: string;
  project_id: string;
  workflow_instance_id: string;
  status: QuotationStatus;
  customer_id: string;
  validity_days: number;
  /** Snapshotted price list at time of creation */
  price_list_id: string;
  /** Discount % applied — may require approval if above tier threshold */
  discount_pct: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  final_value?: number; // set on negotiation resolution
  loss_reason_code?: string;
  sent_at?: string;
  won_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type QuotationLine = {
  id: string;
  quotation_id: string;
  sku_id: string;
  /** Snapshot — never recalculate from live catalog after quote is sent */
  sku_code: string;
  sku_name: string;
  unit: string;
  quantity: number;
  unit_price: number;  // snapshotted from price list
  discount_pct: number;
  line_total: number;
};

export type PriceList = {
  id: string;
  tenant_id: string;
  name: string;
  segment?: string;
  valid_from: string;
  valid_to?: string;
  is_active: boolean;
};
