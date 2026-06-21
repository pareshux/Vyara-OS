#!/usr/bin/env tsx
/**
 * scripts/seed-raj-pipeline.ts — Raj demo Phase 1 pipeline seed.
 *
 * Seeds Raj Avinsys's two pipeline templates by inserting tenant-scoped
 * pipeline_stage rows. Run AFTER `scripts/onboard-tenant.ts` has created
 * the raj-avinsys tenant. Idempotent — re-runs upsert on
 * (tenant_id, segment, stage_key) so safe to re-run.
 *
 * Schema note: there is no `pipeline_template` table; templates are
 * represented by the `segment` column on pipeline_stage. Vyara uses
 * `segment='architect'` for its 6-stage flow; Raj will use
 * `segment='epc_project'` (16 main + on_hold + lost = 18 rows) and
 * `segment='panel_order'` (10 main + on_hold + cancelled = 12 rows).
 *
 * Auth: requires SUPABASE_SERVICE_ROLE_KEY (bypasses RLS so the script
 * can write tenant-scoped rows on Raj's behalf).
 *
 * Run:
 *
 *   tsx scripts/seed-raj-pipeline.ts
 *
 * Idempotency guard: looks up raj-avinsys tenant by slug. If the tenant
 * doesn't exist, exits with a helpful message pointing at the onboarding
 * CLI. Never creates the tenant itself — separation of concerns from
 * onboard-tenant.ts.
 *
 * Constitution v3 / 2026-06-22 — first cross-industry seed.
 */
import { createClient } from '@supabase/supabase-js'

const RAJ_SLUG = 'raj-avinsys'

// ─── Stage definitions ─────────────────────────────────────────────

type StageRow = {
  segment: string
  stage_key: string
  label: string
  color: string
  order_index: number
  is_terminal: boolean
  /** is_paving_stage deliberately omitted — that's a Vyara-Tiles quirk
   *  (paving-stage-followup Inngest hero). Generalising it to a per-tenant
   *  hero_stage is a Phase 6 (Vyara-isms hunt) decision. */
}

// EPC project pipeline — 16 main stages + 2 off-pipeline states
const EPC_STAGES: StageRow[] = [
  { segment: 'epc_project', stage_key: 'lead',              label: 'Lead',                          color: '#94a3b8', order_index:  1, is_terminal: false },
  { segment: 'epc_project', stage_key: 'qualified',         label: 'Qualified',                     color: '#60a5fa', order_index:  2, is_terminal: false },
  { segment: 'epc_project', stage_key: 'site_survey_done',  label: 'Site survey done',              color: '#38bdf8', order_index:  3, is_terminal: false },
  { segment: 'epc_project', stage_key: 'design_ready',      label: 'Design / SLD ready',            color: '#818cf8', order_index:  4, is_terminal: false },
  { segment: 'epc_project', stage_key: 'quote_sent',        label: 'BoQ + quote sent',              color: '#a78bfa', order_index:  5, is_terminal: false },
  { segment: 'epc_project', stage_key: 'negotiation',       label: 'Negotiation',                   color: '#fbbf24', order_index:  6, is_terminal: false },
  { segment: 'epc_project', stage_key: 'po_received',       label: 'PO received',                   color: '#fb923c', order_index:  7, is_terminal: false },
  { segment: 'epc_project', stage_key: 'drawings_issued',   label: 'Drawings issued for approval',  color: '#f97316', order_index:  8, is_terminal: false },
  { segment: 'epc_project', stage_key: 'drawings_approved', label: 'Drawings approved',             color: '#f59e0b', order_index:  9, is_terminal: false },
  { segment: 'epc_project', stage_key: 'procurement_open',  label: 'Procurement open',              color: '#84cc16', order_index: 10, is_terminal: false },
  { segment: 'epc_project', stage_key: 'manufacturing',     label: 'Manufacturing / assembly',      color: '#65a30d', order_index: 11, is_terminal: false },
  { segment: 'epc_project', stage_key: 'fat_passed',        label: 'FAT passed',                    color: '#16a34a', order_index: 12, is_terminal: false },
  { segment: 'epc_project', stage_key: 'dispatched',        label: 'Dispatched to site',            color: '#14b8a6', order_index: 13, is_terminal: false },
  { segment: 'epc_project', stage_key: 'installation',      label: 'Installation in progress',      color: '#0d9488', order_index: 14, is_terminal: false },
  { segment: 'epc_project', stage_key: 'commissioned',      label: 'Commissioned (SAT passed)',     color: '#06b6d4', order_index: 15, is_terminal: false },
  { segment: 'epc_project', stage_key: 'handed_over',       label: 'Handed over (DLP active)',      color: '#22c55e', order_index: 16, is_terminal: true  },
  // Off-pipeline states — order_index 90/99 sorts them to the bottom of stage lists
  { segment: 'epc_project', stage_key: 'on_hold',           label: 'On hold',                       color: '#6b7280', order_index: 90, is_terminal: false },
  { segment: 'epc_project', stage_key: 'lost',              label: 'Lost',                          color: '#ef4444', order_index: 99, is_terminal: true  },
]

// Panel order pipeline — 10 main stages + 2 off-pipeline states
const PANEL_STAGES: StageRow[] = [
  { segment: 'panel_order', stage_key: 'rfq_received',         label: 'RFQ received',          color: '#94a3b8', order_index:  1, is_terminal: false },
  { segment: 'panel_order', stage_key: 'quote_sent',           label: 'Quote sent',            color: '#a78bfa', order_index:  2, is_terminal: false },
  { segment: 'panel_order', stage_key: 'po_received',          label: 'PO received',           color: '#fb923c', order_index:  3, is_terminal: false },
  { segment: 'panel_order', stage_key: 'drawings_for_approval',label: 'Drawings for approval', color: '#f97316', order_index:  4, is_terminal: false },
  { segment: 'panel_order', stage_key: 'drawings_approved',    label: 'Drawings approved',     color: '#f59e0b', order_index:  5, is_terminal: false },
  { segment: 'panel_order', stage_key: 'bom_finalized',        label: 'BOM finalised',         color: '#84cc16', order_index:  6, is_terminal: false },
  { segment: 'panel_order', stage_key: 'manufacturing',        label: 'Manufacturing',         color: '#65a30d', order_index:  7, is_terminal: false },
  { segment: 'panel_order', stage_key: 'fat_passed',           label: 'FAT passed',            color: '#16a34a', order_index:  8, is_terminal: false },
  { segment: 'panel_order', stage_key: 'dispatched',           label: 'Dispatched',            color: '#14b8a6', order_index:  9, is_terminal: false },
  { segment: 'panel_order', stage_key: 'sat_close',            label: 'SAT / close',           color: '#22c55e', order_index: 10, is_terminal: true  },
  { segment: 'panel_order', stage_key: 'on_hold',              label: 'On hold',               color: '#6b7280', order_index: 90, is_terminal: false },
  { segment: 'panel_order', stage_key: 'cancelled',            label: 'Cancelled',             color: '#ef4444', order_index: 99, is_terminal: true  },
]

// ─── Service-role client ───────────────────────────────────────────

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set')
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ─── Main ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const supabase = getServiceClient()

  // 1. Look up the raj-avinsys tenant. Don't create it here — that's
  //    onboard-tenant.ts's job (separation of concerns).
  const { data: tenant, error: tErr } = await supabase
    .from('tenant')
    .select('id, name')
    .eq('slug', RAJ_SLUG)
    .maybeSingle()

  if (tErr) throw new Error(`tenant lookup failed: ${tErr.message}`)
  if (!tenant) {
    console.error(
      `tenant '${RAJ_SLUG}' not found — provision it first:\n` +
      `  tsx scripts/onboard-tenant.ts ./scripts/onboard-tenant-config.raj.json`,
    )
    process.exit(2)
  }

  const tenantId = tenant.id as string

  // 2. Build the row set. Same shape for both segments, tenant-scoped.
  const rows = [...EPC_STAGES, ...PANEL_STAGES].map((s) => ({
    tenant_id: tenantId,
    segment: s.segment,
    stage_key: s.stage_key,
    label: s.label,
    color: s.color,
    order_index: s.order_index,
    is_terminal: s.is_terminal,
    is_paving_stage: false,
  }))

  // 3. Idempotency via delete-then-insert (PostgREST upsert couldn't infer
  //    the partial unique index on (tenant_id, segment, stage_key) WHERE
  //    tenant_id IS NOT NULL AND deleted_at IS NULL — partial-index inference
  //    is conservative). Safe because all rows are tenant-scoped to Raj.
  //    First delete any existing Raj rows for these two segments, then insert.
  const { error: delErr } = await supabase
    .from('pipeline_stage')
    .delete()
    .eq('tenant_id', tenantId)
    .in('segment', ['epc_project', 'panel_order'])
  if (delErr) throw new Error(`pipeline_stage delete failed: ${delErr.message}`)

  const { error: insErr, count } = await supabase
    .from('pipeline_stage')
    .insert(rows, { count: 'exact' })

  if (insErr) throw new Error(`pipeline_stage insert failed: ${insErr.message}`)

  console.log(JSON.stringify({
    ok: true,
    tenant: { id: tenantId, name: tenant.name, slug: RAJ_SLUG },
    segments: {
      epc_project: EPC_STAGES.length,
      panel_order: PANEL_STAGES.length,
    },
    rows_written: count ?? rows.length,
  }, null, 2))
}

main().catch((err) => {
  console.error(`seed-raj-pipeline failed: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
