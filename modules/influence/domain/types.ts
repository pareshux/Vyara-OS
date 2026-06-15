export type InfluenceContact = {
  id: string;
  tenant_id: string;
  name: string;
  firm_id: string;
  role: 'architect' | 'consultant' | 'interior_designer' | 'contractor' | 'influencer';
  influence_score?: number;
  created_at: string;
};

export type SpecificationRecord = {
  id: string;
  tenant_id: string;
  project_id: string;
  sku_id: string;
  specified_by_contact_id: string;
  quantity?: number;
  area_sqft?: number;
  notes?: string;
  is_confirmed: boolean;
  created_at: string;
};
