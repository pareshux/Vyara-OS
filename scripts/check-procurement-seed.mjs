import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local','utf8').split('\n').reduce((a,l)=>{const m=l.match(/^([^=#]+)=(.*)$/);if(m)a[m[1].trim()]=m[2].trim().replace(/^["']|["']$/g,'');return a},{})

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

for (const slug of ['vyara-tiles','raj-avinsys']) {
  const { data: t } = await sb.from('tenant').select('id').eq('slug', slug).single()
  const { data: vendors } = await sb.from('vendor').select('code,name,gst_state_code,msme_status').eq('tenant_id', t.id).order('code')
  const { data: pos } = await sb.from('purchase_order').select('po_number,status,total').eq('tenant_id', t.id).order('po_number')
  const { data: ars } = await sb.from('approval_request').select('id').eq('tenant_id', t.id).eq('entity_type','purchase_order').eq('status','pending')
  console.log(`\n=== ${slug} ===`)
  console.log(`Vendors: ${vendors?.length ?? 0}`)
  ;(vendors??[]).forEach(v=>console.log(`  ${v.code.padEnd(10)} ${v.name.padEnd(40)} state=${v.gst_state_code ?? '—'} msme=${v.msme_status ?? '—'}`))
  console.log(`Purchase orders: ${pos?.length ?? 0}`)
  ;(pos??[]).forEach(p=>console.log(`  ${p.po_number.padEnd(20)} ${p.status.padEnd(20)} ₹${Number(p.total).toLocaleString('en-IN')}`))
  console.log(`Pending approval_requests: ${ars?.length ?? 0}`)
}
