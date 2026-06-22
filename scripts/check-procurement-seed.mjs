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

  // Service-role can't read ageing view by default since it has security_invoker=true.
  // Query vendor_bill directly instead.
  const { data: bills } = await sb.from('vendor_bill')
    .select('bill_number,vendor_invoice_no,status,match_status,received_at,due_date,total,amount_outstanding')
    .eq('tenant_id', t.id).order('bill_number')
  console.log(`Vendor bills: ${bills?.length ?? 0}`)
  ;(bills??[]).forEach(b=>{
    const today = new Date()
    const due = b.due_date ? new Date(b.due_date) : null
    const recv = b.received_at ? new Date(b.received_at) : null
    const overdue = due ? Math.max(0, Math.floor((today - due)/(1000*60*60*24))) : 0
    const sinceRecv = recv ? Math.floor((today - recv)/(1000*60*60*24)) : null
    const bucket = !due || today <= due ? 'current'
      : overdue <= 30 ? '1-30'
      : overdue <= 60 ? '31-60'
      : overdue <= 90 ? '61-90'
      : '90+'
    console.log(`  ${b.bill_number.padEnd(22)} ${b.status.padEnd(11)} ${b.match_status.padEnd(13)} ₹${Number(b.amount_outstanding).toLocaleString('en-IN').padStart(10)} due ${(b.due_date??'—').padEnd(10)} overdue ${String(overdue).padStart(3)}d · bucket ${bucket}${sinceRecv ? ` · ${sinceRecv}d since recv` : ''}`)
  })
  // suppress unused-var warning
  void poById
}
