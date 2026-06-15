import { Redis } from '@upstash/redis';

export const redis = Redis.fromEnv();

// ─── Cache key namespaces ─────────────────────────────────────────────────────
// Keep keys predictable and easy to invalidate by prefix.

export const CacheKeys = {
  pricingList: (tenantId: string, priceListId: string) =>
    `t:${tenantId}:pricing:${priceListId}`,
  catalogSku: (tenantId: string, skuId: string) =>
    `t:${tenantId}:sku:${skuId}`,
  workflowTemplate: (tenantId: string, type: string, segment: string | null) =>
    `t:${tenantId}:wf:${type}:${segment ?? 'all'}`,
  dashboardSummary: (tenantId: string, userId: string) =>
    `t:${tenantId}:dash:${userId}`,
} as const;

export const TTL = {
  SHORT: 60,           // 1 min  — dashboard aggregates
  MEDIUM: 300,         // 5 min  — SKU / pricing
  LONG: 3_600,         // 1 hr   — workflow templates (invalidate on config save)
} as const;
