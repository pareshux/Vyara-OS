'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { inngest } from '@/lib/inngest/client'

async function getActorContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()
  if (!profile) return null
  return { supabase, userId: user.id, tenantId: profile.tenant_id, role: profile.role }
}

function computeMoney(params: {
  subtotal: number
  gst_pct: number
  retention_pct: number
}): { gst_amount: number; total: number; retention_amount: number; billed_amount: number } {
  const gst_amount = Math.round((params.subtotal * params.gst_pct) / 100 * 100) / 100
  const total = Math.round((params.subtotal + gst_amount) * 100) / 100
  const retention_amount = Math.round((total * params.retention_pct) / 100 * 100) / 100
  const billed_amount = Math.round((total - retention_amount) * 100) / 100
  return { gst_amount, total, retention_amount, billed_amount }
}

export async function createInvoiceManual(params: {
  project_id?: string
  sales_order_id?: string
  buyer_firm_id?: string
  invoice_date: string                          // ISO date
  due_date: string                              // ISO date
  payment_terms_days?: number
  external_invoice_number?: string
  subtotal: number
  gst_pct?: number
  retention_pct?: number
  is_running_bill?: boolean
  running_bill_seq?: number
  is_final_bill?: boolean
  notes?: string
  lines?: Array<{ description: string; sku_code?: string; quantity?: number; unit?: string; unit_price?: number; line_total: number }>
}): Promise<{ id: string; invoice_number: string } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  const gst_pct = params.gst_pct ?? 18
  const retention_pct = params.retention_pct ?? 0
  const money = computeMoney({ subtotal: params.subtotal, gst_pct, retention_pct })

  const { data: invoice, error } = await supabase
    .from('invoice')
    .insert({
      tenant_id: tenantId,
      source: 'manual',
      external_invoice_number: params.external_invoice_number ?? null,
      project_id: params.project_id ?? null,
      sales_order_id: params.sales_order_id ?? null,
      buyer_firm_id: params.buyer_firm_id ?? null,
      invoice_date: params.invoice_date,
      due_date: params.due_date,
      payment_terms_days: params.payment_terms_days ?? 30,
      subtotal: params.subtotal,
      gst_pct,
      gst_amount: money.gst_amount,
      total: money.total,
      retention_pct,
      retention_amount: money.retention_amount,
      billed_amount: money.billed_amount,
      paid_amount: 0,
      is_running_bill: params.is_running_bill ?? false,
      running_bill_seq: params.running_bill_seq ?? null,
      is_final_bill: params.is_final_bill ?? false,
      status: 'draft',
      notes: params.notes ?? null,
      created_by: userId,
      updated_by: userId,
    })
    .select('id, invoice_number')
    .single()

  if (error) return { error: error.message }

  if (params.lines && params.lines.length > 0) {
    const { error: lineErr } = await supabase.from('invoice_line').insert(
      params.lines.map((l, i) => ({
        tenant_id: tenantId,
        invoice_id: invoice.id,
        description: l.description,
        sku_code: l.sku_code ?? null,
        quantity: l.quantity ?? null,
        unit: l.unit ?? null,
        unit_price: l.unit_price ?? null,
        line_total: l.line_total,
        sort_order: i,
      }))
    )
    if (lineErr) return { error: lineErr.message }
  }

  await inngest.send({ name: 'invoice.synced', data: { invoice_id: invoice.id, source: 'manual' } })

  revalidatePath('/invoices')
  revalidatePath('/collections')
  if (params.project_id) revalidatePath(`/projects/${params.project_id}`)
  return { id: invoice.id, invoice_number: invoice.invoice_number as string }
}

export async function importInvoicesCSV(csvText: string): Promise<
  | { imported: number; skipped: number; errors: string[] }
  | { error: string }
> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId, tenantId } = ctx

  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return { error: 'CSV must contain a header row + at least one data row' }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const required = ['external_invoice_number', 'invoice_date', 'due_date', 'subtotal']
  for (const r of required) {
    if (!header.includes(r)) return { error: `Missing required column: ${r}` }
  }

  const idx = (col: string) => header.indexOf(col)
  const errors: string[] = []
  let imported = 0
  let skipped = 0

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i])
    const ext = row[idx('external_invoice_number')]?.trim()
    if (!ext) {
      skipped++
      continue
    }

    // dedupe by external number
    const { data: existing } = await supabase
      .from('invoice')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('external_invoice_number', ext)
      .maybeSingle()
    if (existing) {
      skipped++
      continue
    }

    const subtotal = Number(row[idx('subtotal')] ?? '0')
    const gst_pct = idx('gst_pct') >= 0 ? Number(row[idx('gst_pct')] ?? '18') : 18
    const retention_pct = idx('retention_pct') >= 0 ? Number(row[idx('retention_pct')] ?? '0') : 0
    const money = computeMoney({ subtotal, gst_pct, retention_pct })

    const { error: insErr } = await supabase.from('invoice').insert({
      tenant_id: tenantId,
      source: 'csv',
      external_invoice_number: ext,
      invoice_date: row[idx('invoice_date')],
      due_date: row[idx('due_date')],
      subtotal,
      gst_pct,
      gst_amount: money.gst_amount,
      total: money.total,
      retention_pct,
      retention_amount: money.retention_amount,
      billed_amount: money.billed_amount,
      paid_amount: 0,
      status: 'sent',  // imported invoices are considered already issued
      notes: idx('notes') >= 0 ? row[idx('notes')] : null,
      source_metadata: { csv_row: i + 1 },
      created_by: userId,
      updated_by: userId,
    })
    if (insErr) {
      errors.push(`Row ${i + 1}: ${insErr.message}`)
      continue
    }
    imported++
  }

  revalidatePath('/invoices')
  revalidatePath('/collections')
  return { imported, skipped, errors }
}

// Quote-aware CSV row parser (handles "a,b","c" patterns)
function parseCSVRow(row: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < row.length; i++) {
    const c = row[i]
    if (c === '"') {
      if (inQuotes && row[i + 1] === '"') { cur += '"'; i++ } else { inQuotes = !inQuotes }
    } else if (c === ',' && !inQuotes) {
      out.push(cur); cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out
}

export async function updateInvoiceStatus(
  invoiceId: string,
  status: 'sent' | 'paid' | 'cancelled' | 'written_off'
): Promise<{ success: true } | { error: string }> {
  const ctx = await getActorContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { supabase, userId } = ctx

  const { error } = await supabase
    .from('invoice')
    .update({ status, updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', invoiceId)
  if (error) return { error: error.message }

  revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath('/invoices')
  revalidatePath('/collections')
  return { success: true }
}
