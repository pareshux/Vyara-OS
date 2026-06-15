-- ============================================================
-- 01_surat_scenario.sql
-- Seed data: Vyara Tiles pilot — Surat scenario
--
-- All UUIDs are fixed so re-running is idempotent (ON CONFLICT DO NOTHING).
-- Compatible with: supabase db query --linked, psql, Supabase SQL editor.
--
-- Personas  (password: Vyara@1234)
--   admin@vyaratiles.com   — Vyara Admin
--   manager@vyaratiles.com — Nisha Kapoor (Manager)
--   mehul@vyaratiles.com   — Mehul Vora (Field SE)
--   priya@vyaratiles.com   — Priya Shah (Inside Sales / SE)
--
-- Projects
--   Greenvista Township Phase 1   → Paving Stage  (hero trigger scenario)
--   Surat Smart City Sector 5     → Quoting
--   Rajhans Mall Expansion        → Tracking
-- ============================================================


-- ─── TENANT ──────────────────────────────────────────────────────────────────

INSERT INTO tenant (id, name, slug, plan, is_active, settings)
VALUES (
  'a1111111-1111-1111-1111-111111111111',
  'Vyara Tiles',
  'vyara-tiles',
  'starter',
  true,
  '{"whatsapp_enabled": false, "currency": "INR", "timezone": "Asia/Kolkata"}'
)
ON CONFLICT (id) DO NOTHING;


-- ─── AUTH USERS ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (
  id, instance_id, email, encrypted_password,
  email_confirmed_at, role, aud,
  created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
VALUES
  (
    'b0000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'admin@vyaratiles.com',
    crypt('Vyara@1234', gen_salt('bf')),
    now(), 'authenticated', 'authenticated', now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Vyara Admin"}'::jsonb
  ),
  (
    'b0000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'manager@vyaratiles.com',
    crypt('Vyara@1234', gen_salt('bf')),
    now(), 'authenticated', 'authenticated', now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Nisha Kapoor"}'::jsonb
  ),
  (
    'b0000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'mehul@vyaratiles.com',
    crypt('Vyara@1234', gen_salt('bf')),
    now(), 'authenticated', 'authenticated', now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Mehul Vora"}'::jsonb
  ),
  (
    'b0000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'priya@vyaratiles.com',
    crypt('Vyara@1234', gen_salt('bf')),
    now(), 'authenticated', 'authenticated', now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Priya Shah"}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;


-- ─── USER PROFILES ───────────────────────────────────────────────────────────

INSERT INTO user_profile (id, tenant_id, role, full_name, phone, territory, is_active)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'admin',          'Vyara Admin',  NULL,            NULL,    true),
  ('b0000000-0000-0000-0000-000000000002', 'a1111111-1111-1111-1111-111111111111', 'manager',         'Nisha Kapoor', '+919825000002', 'Surat', true),
  ('b0000000-0000-0000-0000-000000000003', 'a1111111-1111-1111-1111-111111111111', 'sales_engineer',  'Mehul Vora',   '+919825000003', 'Surat', true),
  ('b0000000-0000-0000-0000-000000000004', 'a1111111-1111-1111-1111-111111111111', 'sales_engineer',  'Priya Shah',   '+919825000004', 'Surat', true)
ON CONFLICT (id) DO NOTHING;


-- ─── PIPELINE STAGES (system — tenant_id NULL) ───────────────────────────────

INSERT INTO pipeline_stage (id, tenant_id, segment, stage_key, label, order_index, color, is_paving_stage, is_terminal)
VALUES
  ('c0000000-0000-0000-0000-000000000001', NULL, 'architect', 'specified',    'Specified',    1, '#60a5fa', false, false),
  ('c0000000-0000-0000-0000-000000000002', NULL, 'architect', 'tracking',     'Tracking',     2, '#fbbf24', false, false),
  ('c0000000-0000-0000-0000-000000000003', NULL, 'architect', 'paving_stage', 'Paving Stage', 3, '#f97316', true,  false),
  ('c0000000-0000-0000-0000-000000000004', NULL, 'architect', 'quoting',      'Quoting',      4, '#a78bfa', false, false),
  ('c0000000-0000-0000-0000-000000000005', NULL, 'architect', 'won',          'Won',          5, '#22c55e', false, true),
  ('c0000000-0000-0000-0000-000000000006', NULL, 'architect', 'lost',         'Lost',         6, '#ef4444', false, true),
  (gen_random_uuid(), NULL, 'generic', 'specified',    'Specified',    1, '#60a5fa', false, false),
  (gen_random_uuid(), NULL, 'generic', 'tracking',     'Tracking',     2, '#fbbf24', false, false),
  (gen_random_uuid(), NULL, 'generic', 'paving_stage', 'Paving Stage', 3, '#f97316', true,  false),
  (gen_random_uuid(), NULL, 'generic', 'quoting',      'Quoting',      4, '#a78bfa', false, false),
  (gen_random_uuid(), NULL, 'generic', 'won',          'Won',          5, '#22c55e', false, true),
  (gen_random_uuid(), NULL, 'generic', 'lost',         'Lost',         6, '#ef4444', false, true)
ON CONFLICT DO NOTHING;


-- ─── PRODUCTS (~10 SKUs) ─────────────────────────────────────────────────────

INSERT INTO product (id, tenant_id, sku_code, name, category, unit, base_price, mrp, description, is_active)
VALUES
  ('f0000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'INTLK-300-GRY',  'Interlocking Paver 300×300mm Grey',      'Paver',       'sqft',   48.00,  65.00, 'Standard grey interlocking paver, 60mm thick, M-35 grade',       true),
  ('f0000000-0000-0000-0000-000000000002', 'a1111111-1111-1111-1111-111111111111', 'INTLK-300-RED',  'Interlocking Paver 300×300mm Red',        'Paver',       'sqft',   52.00,  70.00, 'Red oxide interlocking paver, 60mm thick, M-35 grade',           true),
  ('f0000000-0000-0000-0000-000000000003', 'a1111111-1111-1111-1111-111111111111', 'INTLK-300-YLW',  'Interlocking Paver 300×300mm Yellow',     'Paver',       'sqft',   52.00,  70.00, 'Yellow oxide interlocking paver, 60mm thick, M-35 grade',        true),
  ('f0000000-0000-0000-0000-000000000004', 'a1111111-1111-1111-1111-111111111111', 'COBBLE-100-GRY', 'Cobble Stone 100×100mm Grey',             'Cobble',      'sqft',   75.00,  98.00, 'Natural-finish cobblestone, 60mm thick, ideal for pathways',     true),
  ('f0000000-0000-0000-0000-000000000005', 'a1111111-1111-1111-1111-111111111111', 'KERB-500-GRY',   'Kerb Stone 500×200mm Grey',               'Kerb',        'nos',    85.00, 110.00, 'Standard road kerb 500×200×150mm, M-40 grade',                  true),
  ('f0000000-0000-0000-0000-000000000006', 'a1111111-1111-1111-1111-111111111111', 'STEP-300-GRY',   'Step Stone 300×600mm Grey',               'Step',        'nos',   120.00, 155.00, 'Precast step stone 300×600×150mm, anti-skid finish',            true),
  ('f0000000-0000-0000-0000-000000000007', 'a1111111-1111-1111-1111-111111111111', 'GRASS-PVR-GRY',  'Grass Paver Grey',                        'Grass Paver', 'sqft',   42.00,  58.00, 'Open-cell grass paver for driveways and parking lots',          true),
  ('f0000000-0000-0000-0000-000000000008', 'a1111111-1111-1111-1111-111111111111', 'HEX-200-GRY',    'Hexagon Paver 200mm Grey',                'Paver',       'sqft',   68.00,  88.00, 'Decorative hexagonal paver for plazas and pedestrian areas',    true),
  ('f0000000-0000-0000-0000-000000000009', 'a1111111-1111-1111-1111-111111111111', 'PLAZA-400-GRY',  'Plaza Paver 400×400mm Grey',              'Paver',       'sqft',   72.00,  95.00, 'Large format plaza paver, 80mm thick, commercial grade',        true),
  ('f0000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'DRAIN-300-GRY',  'Drainage Channel Cover 300mm Grey',       'Drain',       'rft',   145.00, 185.00, 'Precast drainage channel cover, 300mm wide, load class C250',   true)
ON CONFLICT (tenant_id, sku_code) DO NOTHING;


-- ─── FIRMS ───────────────────────────────────────────────────────────────────

INSERT INTO firm (id, tenant_id, name, type, city, state, phone, email, created_by)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'Ravi & Associates',             'architect',  'Surat', 'Gujarat', '+912612345678', 'contact@raviarc.com',            'b0000000-0000-0000-0000-000000000003'),
  ('d0000000-0000-0000-0000-000000000002', 'a1111111-1111-1111-1111-111111111111', 'Greenfield Developers Pvt Ltd', 'developer',  'Surat', 'Gujarat', '+912619876543', 'projects@greenfielddev.in',       'b0000000-0000-0000-0000-000000000003'),
  ('d0000000-0000-0000-0000-000000000003', 'a1111111-1111-1111-1111-111111111111', 'Surat Municipal Corporation',   'government', 'Surat', 'Gujarat', '+912612345000', 'smartcity@suratmunicipal.gov.in', 'b0000000-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000004', 'a1111111-1111-1111-1111-111111111111', 'Shree Constructions',           'contractor', 'Surat', 'Gujarat', '+912615551234', 'shreecons@example.com',           'b0000000-0000-0000-0000-000000000003'),
  ('d0000000-0000-0000-0000-000000000005', 'a1111111-1111-1111-1111-111111111111', 'Rajhans Group',                 'developer',  'Surat', 'Gujarat', '+912612222333', 'projects@rajhans.co.in',          'b0000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;


-- ─── CONTACTS ────────────────────────────────────────────────────────────────

INSERT INTO contact (id, tenant_id, firm_id, full_name, role_title, phone, email, city, created_by)
VALUES
  ('e0000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001', 'Rakesh Joshi',  'Principal Architect',     '+919898001001', 'rakesh.joshi@raviarc.com',    'Surat', 'b0000000-0000-0000-0000-000000000003'),
  ('e0000000-0000-0000-0000-000000000002', 'a1111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000002', 'Amit Patel',    'Director – Projects',     '+919898002002', 'amit.patel@greenfielddev.in', 'Surat', 'b0000000-0000-0000-0000-000000000003'),
  ('e0000000-0000-0000-0000-000000000003', 'a1111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000004', 'Suresh Mehta',  'Site Engineer',           '+919898003003', 'suresh@shreecons.com',        'Surat', 'b0000000-0000-0000-0000-000000000003'),
  ('e0000000-0000-0000-0000-000000000004', 'a1111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000003', 'Dinesh Kumar',  'Jr Engineer – Roads',     '+919898004004', 'dinesh.kumar@smc.gov.in',     'Surat', 'b0000000-0000-0000-0000-000000000002'),
  ('e0000000-0000-0000-0000-000000000005', 'a1111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000005', 'Pooja Rajhans', 'VP – Projects & Infra',   '+919898005005', 'pooja@rajhans.co.in',         'Surat', 'b0000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;


-- ─── PROJECTS ────────────────────────────────────────────────────────────────

INSERT INTO project (id, tenant_id, name, segment, current_stage_id,
                     buyer_firm_id, architect_firm_id, territory, owner_id,
                     city, estimated_value, created_by, updated_by, created_at, updated_at)
VALUES
  (
    'abcdef00-0000-0000-0000-000000000001',
    'a1111111-1111-1111-1111-111111111111',
    'Greenvista Township Phase 1',
    'architect',
    'c0000000-0000-0000-0000-000000000003',  -- Paving Stage
    'd0000000-0000-0000-0000-000000000002',  -- Greenfield Developers
    'd0000000-0000-0000-0000-000000000001',  -- Ravi & Associates
    'Surat',
    'b0000000-0000-0000-0000-000000000003',  -- Mehul
    'Surat', 3500000.00,
    'b0000000-0000-0000-0000-000000000003',
    'b0000000-0000-0000-0000-000000000003',
    now() - interval '45 days', now() - interval '3 days'
  ),
  (
    'abcdef00-0000-0000-0000-000000000002',
    'a1111111-1111-1111-1111-111111111111',
    'Surat Smart City Sector 5',
    'architect',
    'c0000000-0000-0000-0000-000000000004',  -- Quoting
    'd0000000-0000-0000-0000-000000000003',  -- SMC
    'd0000000-0000-0000-0000-000000000001',  -- Ravi & Associates
    'Surat',
    'b0000000-0000-0000-0000-000000000004',  -- Priya
    'Surat', 8200000.00,
    'b0000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000004',
    now() - interval '60 days', now() - interval '7 days'
  ),
  (
    'abcdef00-0000-0000-0000-000000000003',
    'a1111111-1111-1111-1111-111111111111',
    'Rajhans Mall Expansion – Footpaths',
    'architect',
    'c0000000-0000-0000-0000-000000000002',  -- Tracking
    'd0000000-0000-0000-0000-000000000005',  -- Rajhans Group
    'd0000000-0000-0000-0000-000000000001',  -- Ravi & Associates
    'Surat',
    'b0000000-0000-0000-0000-000000000003',  -- Mehul
    'Surat', 1200000.00,
    'b0000000-0000-0000-0000-000000000003',
    'b0000000-0000-0000-0000-000000000003',
    now() - interval '20 days', now() - interval '10 days'
  )
ON CONFLICT (id) DO NOTHING;


-- ─── PROJECT STAKEHOLDERS ────────────────────────────────────────────────────

INSERT INTO project_stakeholder (tenant_id, project_id, contact_id, role, is_primary)
VALUES
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'specifier',  true),
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'buyer',      true),
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003', 'contractor', false),
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'specifier',  true),
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000004', 'buyer',      true),
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', 'specifier',  true),
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000005', 'buyer',      true)
ON CONFLICT (project_id, contact_id, role) DO NOTHING;


-- ─── PROJECT STAGE HISTORY ───────────────────────────────────────────────────

INSERT INTO project_stage_history (tenant_id, project_id, from_stage_id, to_stage_id, actor_id, remark, created_at)
VALUES
  -- Greenvista: Specified → Tracking → Paving Stage
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000001', NULL,                                     'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'Project opened. Rakesh confirmed specification.',       now() - interval '45 days'),
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', 'Tracking construction progress with Greenfield team.',  now() - interval '25 days'),
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000003', 'Site team confirmed paving starts in 2 weeks.',         now() - interval '3 days'),
  -- Smart City: Specified → Tracking → Paving Stage → Quoting
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000002', NULL,                                     'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'SMC tendered. Rakesh confirmed our spec in BOQ.',       now() - interval '60 days'),
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'Awaiting SMC budget approval.',                         now() - interval '45 days'),
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000004', 'Budget approved. Paving in sector 5 starts Jan 2026.',  now() - interval '20 days'),
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000004', 'BOQ received. Starting commercial quote.',              now() - interval '7 days'),
  -- Rajhans: Specified → Tracking
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000003', NULL,                                     'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'Pooja confirmed Vyara in approved vendor list.',        now() - interval '20 days'),
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', 'Construction starts Q2. Tracking paving schedule.',     now() - interval '10 days')
ON CONFLICT DO NOTHING;


-- ─── SPECIFICATIONS ──────────────────────────────────────────────────────────

INSERT INTO specification (tenant_id, project_id, product_id, specified_by_contact_id,
                           finish, quantity, unit, area_sqft, notes, is_confirmed, created_by, created_at)
VALUES
  -- Greenvista
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001',
   'Natural', 12000, 'sqft', 12000, 'Main internal roads, herringbone pattern, 60mm thick', true,
   'b0000000-0000-0000-0000-000000000003', now() - interval '40 days'),

  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000001',
   NULL, 800, 'nos', NULL, 'Kerbs along all internal roads', true,
   'b0000000-0000-0000-0000-000000000003', now() - interval '40 days'),

  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001',
   'Natural', 2500, 'sqft', 2500, 'Pedestrian walkways and entrance plaza', false,
   'b0000000-0000-0000-0000-000000000003', now() - interval '38 days'),

  -- Smart City
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000009', 'e0000000-0000-0000-0000-000000000001',
   'Exposed', 8000, 'sqft', 8000, 'Sector 5 public plaza — large format grey', true,
   'b0000000-0000-0000-0000-000000000002', now() - interval '55 days'),

  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001',
   NULL, 350, 'rft', NULL, 'Drainage channels along sector 5 arterial road', true,
   'b0000000-0000-0000-0000-000000000002', now() - interval '55 days'),

  -- Rajhans
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000008', 'e0000000-0000-0000-0000-000000000001',
   'Natural', 3200, 'sqft', 3200, 'Decorative hexagonal pavers for mall entrance footpaths', false,
   'b0000000-0000-0000-0000-000000000003', now() - interval '18 days')
ON CONFLICT DO NOTHING;


-- ─── SAMPLE REQUESTS ─────────────────────────────────────────────────────────

INSERT INTO sample_request (tenant_id, project_id, contact_id, product_id,
                            quantity, status, dispatched_at, delivered_at,
                            outcome_notes, created_by, created_at)
VALUES
  -- Greenvista: positive outcome
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
   4, 'outcome_positive', now() - interval '35 days', now() - interval '33 days',
   'Rakesh approved. Confirmed herringbone pattern for internal roads.',
   'b0000000-0000-0000-0000-000000000003', now() - interval '36 days'),

  -- Smart City: delivered, awaiting feedback
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000009',
   6, 'delivered', now() - interval '15 days', now() - interval '12 days',
   NULL,
   'b0000000-0000-0000-0000-000000000004', now() - interval '16 days'),

  -- Rajhans: pending dispatch
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000008',
   3, 'pending', NULL, NULL, NULL,
   'b0000000-0000-0000-0000-000000000003', now() - interval '5 days')
ON CONFLICT DO NOTHING;


-- ─── QUOTATION ───────────────────────────────────────────────────────────────

INSERT INTO quotation (id, tenant_id, project_id, quotation_number, status,
                       valid_until, subtotal, discount_pct, total,
                       notes, created_by, created_at)
VALUES (
  'fedcba00-0000-0000-0000-000000000001',
  'a1111111-1111-1111-1111-111111111111',
  'abcdef00-0000-0000-0000-000000000002',
  'VT-QT-2026-0001', 'draft',
  (now() + interval '30 days')::date,
  950000.00, 5.00, 902500.00,
  'Commercial quote for SMC Sector 5. Plaza pavers and drainage covers.',
  'b0000000-0000-0000-0000-000000000004',
  now() - interval '5 days'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO quotation_line (tenant_id, quotation_id, product_id,
                            product_name, sku_code, unit,
                            quantity, unit_price, discount_pct, line_total, sort_order)
VALUES
  ('a1111111-1111-1111-1111-111111111111', 'fedcba00-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000009',
   'Plaza Paver 400×400mm Grey', 'PLAZA-400-GRY', 'sqft',
   8000, 95.00, 5.00, 722000.00, 1),

  ('a1111111-1111-1111-1111-111111111111', 'fedcba00-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000a',
   'Drainage Channel Cover 300mm Grey', 'DRAIN-300-GRY', 'rft',
   350, 185.00, 5.00, 61512.50, 2)
ON CONFLICT DO NOTHING;


-- ─── TASKS ───────────────────────────────────────────────────────────────────

INSERT INTO task (tenant_id, project_id, type, title, description,
                  due_at, priority, is_done, assignee_id, created_by_id,
                  source_entity_type, source_entity_id, created_at)
VALUES
  -- Hero task: paving follow-up for Greenvista
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000001',
   'paving_followup',
   'Follow up — Greenvista paving starts soon',
   'Greenvista Township has reached Paving Stage. Confirm paving schedule with Suresh and submit a quote to Amit Patel before work begins.',
   now() + interval '2 days', 'urgent', false,
   'b0000000-0000-0000-0000-000000000004',
   'b0000000-0000-0000-0000-000000000001',
   'project', 'abcdef00-0000-0000-0000-000000000001',
   now() - interval '3 days'),

  -- Rajhans site visit
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000003',
   'manual',
   'Site visit — Rajhans Mall footpath layout',
   'Walk the footpath zone with Pooja Rajhans to finalise hexagon paver layout. Bring sample tile.',
   now() + interval '5 days', 'medium', false,
   'b0000000-0000-0000-0000-000000000003',
   'b0000000-0000-0000-0000-000000000003',
   NULL, NULL,
   now() - interval '9 days'),

  -- Smart City: send quote
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000002',
   'manual',
   'Finalise and send quote VT-QT-2026-0001 to SMC',
   'Get manager approval on the 5% discount and send to Dinesh Kumar.',
   now() + interval '1 day', 'high', false,
   'b0000000-0000-0000-0000-000000000004',
   'b0000000-0000-0000-0000-000000000004',
   'quotation', 'fedcba00-0000-0000-0000-000000000001',
   now() - interval '4 days'),

  -- Completed task on Greenvista
  ('a1111111-1111-1111-1111-111111111111', 'abcdef00-0000-0000-0000-000000000001',
   'manual',
   'Collect spec sheet from Rakesh Joshi',
   NULL,
   now() - interval '30 days', 'high', true,
   'b0000000-0000-0000-0000-000000000003',
   'b0000000-0000-0000-0000-000000000003',
   NULL, NULL,
   now() - interval '38 days')
ON CONFLICT DO NOTHING;

-- Mark the completed task as done (trigger fires → logs task_done activity)
UPDATE task
SET is_done = true, done_at = now() - interval '30 days', updated_at = now() - interval '30 days'
WHERE title = 'Collect spec sheet from Rakesh Joshi'
  AND tenant_id = 'a1111111-1111-1111-1111-111111111111';


-- ─── MANUAL ACTIVITY ENTRIES ─────────────────────────────────────────────────

INSERT INTO activity (tenant_id, entity_type, entity_id, project_id, type, actor_id, content, created_at)
VALUES
  ('a1111111-1111-1111-1111-111111111111', 'project', 'abcdef00-0000-0000-0000-000000000001', 'abcdef00-0000-0000-0000-000000000001',
   'visit', 'b0000000-0000-0000-0000-000000000003',
   '{"note": "Met Suresh Mehta on site. Confirmed paving sequence: internal roads first, then walkways. Stock needed within 10 days of paving start."}',
   now() - interval '4 days'),

  ('a1111111-1111-1111-1111-111111111111', 'project', 'abcdef00-0000-0000-0000-000000000002', 'abcdef00-0000-0000-0000-000000000002',
   'call', 'b0000000-0000-0000-0000-000000000004',
   '{"note": "Rakesh confirmed no changes to the plaza paver spec. Dinesh is pushing for 48-hr delivery turnaround once PO is raised."}',
   now() - interval '8 days'),

  ('a1111111-1111-1111-1111-111111111111', 'project', 'abcdef00-0000-0000-0000-000000000003', 'abcdef00-0000-0000-0000-000000000003',
   'note', 'b0000000-0000-0000-0000-000000000003',
   '{"note": "Pooja asked for a colour option brochure. Will carry physical samples on site visit."}',
   now() - interval '7 days')
ON CONFLICT DO NOTHING;


-- ─── NOTIFICATIONS ───────────────────────────────────────────────────────────

INSERT INTO notification (tenant_id, user_id, type, title, body,
                          project_id, entity_type, entity_id, is_read, created_at)
VALUES
  ('a1111111-1111-1111-1111-111111111111',
   'b0000000-0000-0000-0000-000000000002',  -- Nisha (manager)
   'paving_stage_alert',
   'Paving Stage Reached — Greenvista Township Phase 1',
   'Greenvista Township Phase 1 has reached the Paving Stage. A follow-up task has been created for Priya Shah. Act now to avoid losing this spec.',
   'abcdef00-0000-0000-0000-000000000001', 'project', 'abcdef00-0000-0000-0000-000000000001',
   false, now() - interval '3 days'),

  ('a1111111-1111-1111-1111-111111111111',
   'b0000000-0000-0000-0000-000000000004',  -- Priya
   'paving_stage_alert',
   'Urgent: Submit quote — Greenvista is at Paving Stage',
   'Greenvista Township Phase 1 is at Paving Stage. You have 48 hours to submit a commercial quote to Amit Patel. Check the task for details.',
   'abcdef00-0000-0000-0000-000000000001', 'project', 'abcdef00-0000-0000-0000-000000000001',
   false, now() - interval '3 days')
ON CONFLICT DO NOTHING;
