import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, User, Phone, Mail, Building2, Calendar, FileText } from 'lucide-react'
import { QuoteActions } from './quote-actions'

export const dynamic = 'force-dynamic'

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  draft:    { bg: '#F3F4F6', text: '#6B7280', label: 'Draft' },
  sent:     { bg: '#FFFBEB', text: '#B45309', label: 'Sent' },
  revised:  { bg: '#EFF6FF', text: '#1D4ED8', label: 'Revised' },
  accepted: { bg: '#F0FDF4', text: '#15803D', label: 'Won' },
  rejected: { bg: '#FFF1F2', text: '#BE123C', label: 'Lost' },
  expired:  { bg: '#F3F4F6', text: '#6B7280', label: 'Expired' },
}

function formatINR(amount: number) {
  return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function one<T>(x: T | T[] | null): T | null {
  return Array.isArray(x) ? (x[0] ?? null) : (x ?? null)
}

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: quoteRaw }, { data: profile }] = await Promise.all([
    supabase
      .from('quotation')
      .select(`
        id, quotation_number, status, total, subtotal, discount_pct,
        created_at, valid_until, sent_at, notes,
        project_id, lead_id, created_by, sent_to_contact_id,
        project:project_id(id, name),
        lead:lead_id(id, title, lead_number),
        sent_to_contact:sent_to_contact_id(id, full_name, phone, email, firm:firm_id(name)),
        lines:quotation_line(
          id, quantity, unit_price, line_total, discount_pct, notes, sort_order,
          product:product_id(name, sku_code, unit)
        )
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase.from('user_profile').select('role').eq('id', user.id).single(),
  ])

  if (!quoteRaw) notFound()

  // Resolve creator name
  const { data: creatorProfile } = quoteRaw.created_by
    ? await supabase.from('user_profile').select('full_name').eq('id', quoteRaw.created_by as string).single()
    : { data: null }

  // Fetch contacts for the "Mark Sent" dialog
  const { data: contacts } = await supabase
    .from('contact')
    .select('id, full_name, role_title, firm:firm_id(name)')
    .is('deleted_at', null)
    .order('full_name')
    .limit(100)

  const project = one(quoteRaw.project as { id: string; name: string } | { id: string; name: string }[] | null)
  const lead = one(quoteRaw.lead as { id: string; title: string; lead_number: string } | { id: string; title: string; lead_number: string }[] | null)
  const sentToContact = one(quoteRaw.sent_to_contact as {
    id: string; full_name: string; phone: string | null; email: string | null
    firm: { name: string } | { name: string }[] | null
  } | {
    id: string; full_name: string; phone: string | null; email: string | null
    firm: { name: string } | { name: string }[] | null
  }[] | null)
  const sentToFirm = sentToContact ? one(sentToContact.firm as { name: string } | { name: string }[] | null) : null

  const lines = ((quoteRaw.lines ?? []) as unknown as {
    id: string; quantity: number; unit_price: number; line_total: number;
    discount_pct: number | null; notes: string | null; sort_order: number
    product: { name: string; sku_code: string; unit: string } | { name: string; sku_code: string; unit: string }[] | null
  }[]).sort((a, b) => a.sort_order - b.sort_order)

  const statusStyle = STATUS_STYLES[quoteRaw.status as string] ?? STATUS_STYLES.draft
  const isSalesEngineer = profile?.role === 'sales_engineer'
  const canSend = (quoteRaw.status === 'draft' || quoteRaw.status === 'revised') && !isSalesEngineer
  const canMarkWon = quoteRaw.status === 'sent'
  const canMarkLost = quoteRaw.status !== 'rejected' && quoteRaw.status !== 'accepted' && quoteRaw.status !== 'expired'
  const isExpiringSoon = quoteRaw.valid_until && quoteRaw.status === 'sent' &&
    new Date(quoteRaw.valid_until as string).getTime() - Date.now() < 7 * 86_400_000

  const backHref = project ? `/projects/${project.id}` : lead ? `/leads/${lead.id}` : '/quotes'
  const backLabel = project ? project.name : lead ? lead.title : 'Quotes'

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
        <Link href="/quotes" className="hover:text-foreground">Quotes</Link>
        <ChevronRight className="size-3.5" />
        <Link href={backHref} className="hover:text-foreground truncate max-w-[180px]">{backLabel}</Link>
        <ChevronRight className="size-3.5" />
        <span className="font-mono text-foreground">{quoteRaw.quotation_number as string}</span>
      </div>

      {/* Header */}
      <Card>
        <CardContent className="pt-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-semibold font-mono">{quoteRaw.quotation_number as string}</h1>
                <Badge
                  variant="outline"
                  className="border-0 text-xs"
                  style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
                >
                  {statusStyle.label}
                </Badge>
                {isExpiringSoon && (
                  <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 text-xs">
                    Expiring soon
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                {project && (
                  <Link href={`/projects/${project.id}`} className="hover:text-foreground">
                    Project: {project.name}
                  </Link>
                )}
                {lead && (
                  <Link href={`/leads/${lead.id}`} className="hover:text-foreground">
                    Lead: <span className="font-mono">{lead.lead_number}</span> · {lead.title}
                  </Link>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Quote value</p>
              <p className="text-2xl font-semibold tabular-nums text-primary">
                {quoteRaw.total != null ? formatINR(Number(quoteRaw.total)) : '—'}
              </p>
            </div>
          </div>

          {/* Actions */}
          {(canSend || canMarkWon || canMarkLost) && (
            <QuoteActions
              quoteId={id}
              canSend={canSend}
              canMarkWon={canMarkWon}
              canMarkLost={canMarkLost}
              contacts={(contacts ?? []) as unknown as { id: string; full_name: string; role_title: string | null; firm: { name: string } | null }[]}
            />
          )}
        </CardContent>
      </Card>

      {/* Info grid */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Created by */}
        <Card size="sm">
          <CardContent className="pt-3 flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Created by</p>
            <div className="flex flex-col gap-1 text-sm">
              <span className="flex items-center gap-2">
                <User className="size-3.5 text-muted-foreground" />
                <span className="text-foreground font-medium">{creatorProfile?.full_name ?? '—'}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(quoteRaw.created_at as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                {' '}at{' '}
                {new Date(quoteRaw.created_at as string).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Sent to */}
        <Card size="sm">
          <CardContent className="pt-3 flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Sent to</p>
            {sentToContact ? (
              <div className="flex flex-col gap-1 text-sm">
                <span className="flex items-center gap-2">
                  <User className="size-3.5 text-muted-foreground" />
                  <span className="text-foreground font-medium">{sentToContact.full_name}</span>
                </span>
                {sentToFirm && (
                  <span className="flex items-center gap-2 text-muted-foreground text-xs">
                    <Building2 className="size-3.5" />
                    {sentToFirm.name}
                  </span>
                )}
                {sentToContact.phone && (
                  <span className="flex items-center gap-2 text-muted-foreground text-xs">
                    <Phone className="size-3.5" />
                    {sentToContact.phone}
                  </span>
                )}
                {sentToContact.email && (
                  <span className="flex items-center gap-2 text-muted-foreground text-xs truncate">
                    <Mail className="size-3.5 shrink-0" />
                    {sentToContact.email}
                  </span>
                )}
                {quoteRaw.sent_at && (
                  <span className="text-xs text-muted-foreground pt-0.5">
                    Sent on {new Date(quoteRaw.sent_at as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {quoteRaw.sent_at ? (
                  <span className="text-xs text-muted-foreground">
                    Sent on {new Date(quoteRaw.sent_at as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · contact not recorded
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Not sent yet</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Validity */}
        <Card size="sm">
          <CardContent className="pt-3 flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Validity</p>
            <div className="flex flex-col gap-1 text-sm">
              {quoteRaw.valid_until ? (
                <span className={`flex items-center gap-2 ${isExpiringSoon ? 'text-amber-700' : 'text-foreground'}`}>
                  <Calendar className="size-3.5 text-muted-foreground" />
                  {new Date(quoteRaw.valid_until as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {isExpiringSoon && <span className="text-xs">— expiring soon</span>}
                </span>
              ) : (
                <span className="text-muted-foreground text-xs">No expiry set</span>
              )}
              <a
                href={`/quotes/${id}/boq`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
              >
                <FileText className="size-3.5" />
                Open BOQ / PDF
              </a>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Line items */}
      <div>
        <h2 className="text-sm font-semibold mb-2">Line items</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Product</th>
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground tabular-nums">Qty</th>
                {!isSalesEngineer && (
                  <th className="hidden px-3 py-2.5 text-right font-medium text-muted-foreground tabular-nums sm:table-cell">Unit price</th>
                )}
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground tabular-nums">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const prod = one(line.product)
                return (
                  <tr key={line.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-foreground">{prod?.name ?? line.notes ?? '—'}</div>
                      {prod?.sku_code && (
                        <div className="font-mono text-xs text-muted-foreground">{prod.sku_code}</div>
                      )}
                      {line.notes && prod && (
                        <div className="text-xs text-muted-foreground italic">{line.notes}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {line.quantity.toLocaleString('en-IN')} {prod?.unit ?? ''}
                    </td>
                    {!isSalesEngineer && (
                      <td className="hidden px-3 py-2.5 text-right tabular-nums text-muted-foreground sm:table-cell">
                        {formatINR(line.unit_price)}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-foreground">
                      {formatINR(line.line_total)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              {!isSalesEngineer && Number(quoteRaw.discount_pct ?? 0) > 0 && (
                <tr className="border-t border-border">
                  <td colSpan={3} className="px-3 py-2 text-right text-xs text-muted-foreground">
                    Subtotal
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatINR(Number(quoteRaw.subtotal))}
                  </td>
                </tr>
              )}
              {!isSalesEngineer && Number(quoteRaw.discount_pct ?? 0) > 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right text-xs text-muted-foreground">
                    Discount ({Number(quoteRaw.discount_pct).toFixed(1)}%)
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-destructive">
                    −{formatINR(Number(quoteRaw.subtotal) - Number(quoteRaw.total))}
                  </td>
                </tr>
              )}
              <tr className="border-t border-border bg-muted/30">
                <td colSpan={isSalesEngineer ? 2 : 3} className="px-3 py-2.5 text-right font-medium text-muted-foreground">
                  Total
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-foreground text-base">
                  {quoteRaw.total != null ? formatINR(Number(quoteRaw.total)) : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Notes */}
      {quoteRaw.notes && (
        <Card size="sm">
          <CardContent className="pt-3 flex flex-col gap-1">
            <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Notes / Terms</p>
            <p className="text-sm whitespace-pre-wrap">{quoteRaw.notes as string}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
