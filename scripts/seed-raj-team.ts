#!/usr/bin/env tsx
/**
 * scripts/seed-raj-team.ts — Seed 5 additional users for the Raj demo.
 *
 * The Raj tenant already has 1 admin user (admin@rajavinsys.example).
 * This script adds 5 more so each of the 6 demo personas has their own
 * login + sees their own filtered sidebar:
 *
 *   1. Sandeep   · Director              · admin       · /owner
 *   2. Rakesh    · Project Manager       · manager     · /projects
 *   3. Anil      · Site Engineer         · sales_eng   · /field
 *   4. Mehul     · Procurement Manager   · manager     · /procurement
 *   5. Priya     · Accounts Manager      · manager     · /procurement/bills
 *   6. Vikas     · Service Engineer      · sales_eng   · /complaints
 *
 * (Sandeep replaces the existing admin@rajavinsys.example role —
 *  we re-attribute the existing admin user_profile to "Sandeep" with
 *  job_title="Director" + department="management".)
 *
 * Idempotent on email — re-running this script is safe.
 *
 * Run:
 *   SUPABASE_SERVICE_ROLE_KEY="..." NEXT_PUBLIC_SUPABASE_URL="..." \
 *     tsx scripts/seed-raj-team.ts
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('Missing env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}

const supabase = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type Persona = {
  email: string
  password: string
  full_name: string
  job_title: string
  role: 'admin' | 'manager' | 'sales_engineer'
  department: 'management' | 'projects' | 'field_sales' | 'procurement' | 'accounts' | 'service'
  phone: string
}

const RAJ_PERSONAS: Persona[] = [
  // Director — replaces / upgrades the existing admin@rajavinsys.example
  // (we keep that email since it's already provisioned)
  {
    email: 'admin@rajavinsys.example',
    password: 'RajDemo@1234',
    full_name: 'Sandeep',
    job_title: 'Director',
    role: 'admin',
    department: 'management',
    phone: '+91 98765 10001',
  },
  {
    email: 'rakesh@rajavinsys.example',
    password: 'RajDemo@1234',
    full_name: 'Rakesh',
    job_title: 'Project Manager',
    role: 'manager',
    department: 'projects',
    phone: '+91 98765 10002',
  },
  {
    email: 'anil@rajavinsys.example',
    password: 'RajDemo@1234',
    full_name: 'Anil',
    job_title: 'Site Engineer',
    role: 'sales_engineer',
    department: 'field_sales',
    phone: '+91 98765 10003',
  },
  {
    email: 'mehul@rajavinsys.example',
    password: 'RajDemo@1234',
    full_name: 'Mehul',
    job_title: 'Procurement Manager',
    role: 'manager',
    department: 'procurement',
    phone: '+91 98765 10004',
  },
  {
    email: 'priya@rajavinsys.example',
    password: 'RajDemo@1234',
    full_name: 'Priya',
    job_title: 'Accounts Manager',
    role: 'manager',
    department: 'accounts',
    phone: '+91 98765 10005',
  },
  {
    email: 'vikas@rajavinsys.example',
    password: 'RajDemo@1234',
    full_name: 'Vikas',
    job_title: 'Service Engineer',
    role: 'sales_engineer',
    department: 'service',
    phone: '+91 98765 10006',
  },
]

async function main() {
  // 1. Resolve tenant
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenant')
    .select('id, slug, name')
    .eq('slug', 'raj-avinsys')
    .single()
  if (tenantErr || !tenant) {
    console.error('Raj tenant not found — run scripts/onboard-tenant.ts first')
    process.exit(1)
  }
  console.log(`Raj tenant: ${tenant.id} (${tenant.name})`)

  // 2. Provision each persona
  for (const p of RAJ_PERSONAS) {
    let userId: string | null = null

    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: p.email,
      password: p.password,
      email_confirm: true,
      user_metadata: { full_name: p.full_name },
    })

    if (createErr) {
      if (/already been registered|already exists/i.test(createErr.message)) {
        const { data: list } = await supabase.auth.admin.listUsers({ perPage: 200 })
        const found = list?.users?.find((u) => u.email?.toLowerCase() === p.email.toLowerCase())
        if (!found) {
          console.error(`User ${p.email} exists but couldn't be found via listUsers`)
          continue
        }
        userId = found.id
        console.log(`  · ${p.full_name.padEnd(8)} · ${p.job_title.padEnd(22)} · exists, updating profile`)
      } else {
        console.error(`auth.admin.createUser failed for ${p.email}: ${createErr.message}`)
        continue
      }
    } else {
      userId = created.user.id
      console.log(`  · ${p.full_name.padEnd(8)} · ${p.job_title.padEnd(22)} · CREATED`)
    }

    if (!userId) continue

    const { error: upsertErr } = await supabase.from('user_profile').upsert(
      {
        id: userId,
        tenant_id: tenant.id,
        role: p.role,
        full_name: p.full_name,
        phone: p.phone,
        department: p.department,
        job_title: p.job_title,
        is_active: true,
      },
      { onConflict: 'id' },
    )
    if (upsertErr) {
      console.error(`user_profile upsert failed for ${p.email}: ${upsertErr.message}`)
      continue
    }
  }

  console.log('\nDone. Sign in URLs (localhost:3000):')
  for (const p of RAJ_PERSONAS) {
    console.log(`  /login → ${p.email.padEnd(28)} / ${p.password}  (${p.job_title})`)
  }
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
