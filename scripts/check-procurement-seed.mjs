import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local','utf8').split('\n').reduce((a,l)=>{const m=l.match(/^([^=#]+)=(.*)$/);if(m)a[m[1].trim()]=m[2].trim().replace(/^["']|["']$/g,'');return a},{})

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

for (const slug of ['vyara-tiles','raj-avinsys']) {
  const { data: t } = await sb.from('tenant').select('id').eq('slug', slug).single()
  const { data: vendors } = await sb.from('vendor').select('code,name,gst_state_code,msme_status').eq('tenant_id', t.id).order('code')
  const { data: pos } = await sb.from('purchase_order').select('po_number,status,total').eq('tenant_id', t.id).order('po_number')
  const { data: ars } = await sb.from('approval_request').select('id').eq('tenant_id', t.id).eq('entity_type','purchase_order').eq('status','pending')
  const { data: grns } = await sb.from('goods_receipt_note').select('grn_number,status,po_id,qc_status').eq('tenant_id', t.id).order('grn_number')
  const poById = Object.fromEntries((pos ?? []).map(p => [p.po_number, p]))
  const poNumberById = {}
  for (const p of pos ?? []) {
    const { data: poRow } = await sb.from('purchase_order').select('id,po_number').eq('po_number', p.po_number).single()
    if (poRow) poNumberById[poRow.id] = poRow.po_number
  }
  console.log(`\n=== ${slug} ===`)
  console.log(`Vendors: ${vendors?.length ?? 0}`)
  ;(vendors??[]).forEach(v=>console.log(`  ${v.code.padEnd(10)} ${v.name.padEnd(40)} state=${v.gst_state_code ?? '—'} msme=${v.msme_status ?? '—'}`))
  console.log(`Purchase orders: ${pos?.length ?? 0}`)
  ;(pos??[]).forEach(p=>console.log(`  ${p.po_number.padEnd(20)} ${p.status.padEnd(20)} ₹${Number(p.total).toLocaleString('en-IN')}`))
  console.log(`Pending approval_requests: ${ars?.length ?? 0}`)
  console.log(`Goods receipts: ${grns?.length ?? 0}`)
  ;(grns??[]).forEach(g=>console.log(`  ${g.grn_number.padEnd(22)} ${g.status.padEnd(10)} qc=${(g.qc_status ?? '—').padEnd(15)} → PO ${poNumberById[g.po_id] ?? g.po_id}`))
  // suppress unused-var warning
  void poById
}
