import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, AlertCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  draft:        { bg: '#F3F4F6', color: '#6B7280', label: 'Draft' },
  sent:         { bg: '#DBEAFE', color: '#1D4ED8', label: 'Sent' },
  paid:         { bg: '#DCFCE7', color: '#15803D', label: 'Paid' },
  partial_paid: { bg: '#FEF3C7', color: '#B45309', label: 'Partial paid' },
  cancelled:    { bg: '#F3F4F6', color: '#6B7280', label: 'Cancelled' },
  written_off:  { bg: '#FEE2E2', color: '#B91C1C', label: 'Written off' },
}

export default async function DealerInvoicesListPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: 'open' | 'paid' | 'overdue' }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const filter = sp.filter ?? null

  // RLS automatically scopes to this dealer's firm
  const { data: invoices } = await supabase
    .from('invoice')
    .select(
      `id, invoice_number, external_invoice_number, invoice_date, due_date,
       total, billed_amount, paid_amount, retention_amount, status, is_running_bill,
       running_bill_seq`
    )
    .is('deleted_at', null)
    .order('invoice_date', { ascending: false })

  type Invoice = {
    id: string
    invoice_number: string
    external_invoice_number: string | null
    invoice_date: string
    due_date: string
    total: number
    billed_amount: number
    paid_amount: number
    retention_amount: number
    status: string
    is_running_bill: boolean
    running_bill_seq: number | null
  }
  const all = (invoices ?? []) as Invoice[]
  const now = new Date()

  function isOpen(i: Invoice) { return !['paid', 'cancelled', 'written_off'].includes(i.status) }
  function isOverdue(i: Invoice) { return isOpen(i) && new Date(i.due_date) < now }

  const filtered = all.filter((i) => {
    if (filter === 'open') return isOpen(i)
    if (filter === 'paid') return i.status === 'paid'
    if (filter === 'overdue') return isOverdue(i)
    return true
  })

  const counts = {
    all: all.length,
    open: all.filter(isOpen).length,
    paid: all.filter((i) => i.status === 'paid').length,
    overdue: all.filter(isOverdue).length,
  }
  const totalOutstanding = all
    .filter(isOpen)
    .reduce((s, i) => s + Math.max(0, Number(i.billed_amount) - Number(i.paid_amount)), 0)

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-5xl">
      <div>
        <h1 className="text-lg font-semibold text-foreground">My invoices</h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          {all.length} invoices · ₹{totalOutstanding.toLocaleString('en-IN')} outstanding
        </p>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {([
          { key: null,       label: 'All',     count: counts.all },
          { key: 'open',     label: 'Open',    count: counts.open },
          { key: 'overdue',  label: 'Overdue', count: counts.overdue, danger: true },
          { key: 'paid',     label: 'Paid',    count: counts.paid },
        ]).map((c) => {
          const active = filter === c.key
          const href = c.key ? `/dealer-portal/invoices?filter=${c.key}` : '/dealer-portal/invoices'
          const baseClass = active
            ? 'bg-primary text-primary-foreground border-primary'
            : c.danger && c.count > 0
              ? 'bg-red-50 text-red-700 border-transparent hover:bg-red-100'
              : 'bg-card text-muted-foreground border-border hover:text-foreground'
          return (
            <Link
              key={c.label}
              href={href}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${baseClass}`}
            >
              {c.danger && c.count > 0 && <AlertCircle className="size-3" />}
              {c.label}
              <span className="tabular-nums font-semibold">{c.count}</span>
            </Link>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">
              {filter ? `No ${filter} invoices` : 'No invoices yet'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {filter ? 'Try clearing the filter.' : 'Invoices raised by Vyara to your account will appear here.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Invoice #</th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground md:table-cell">Date</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Due</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground sm:table-cell">Total</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const ss = STATUS_STYLES[i.status] ?? STATUS_STYLES.draft
                const outstanding = Math.max(0, Number(i.billed_amount) - Number(i.paid_amount))
                const daysOverdue = isOverdue(i)
                  ? Math.floor((now.getTime() - new Date(i.due_date).getTime()) / 86_400_000)
                  : 0
                return (
                  <tr key={i.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link href={`/dealer-portal/invoices/${i.id}`} className="text-foreground hover:text-primary">
                        {i.invoice_number}
                      </Link>
                      {i.is_running_bill && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">RA-Bill {i.running_bill_seq}</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-2 text-muted-foreground tabular-nums text-xs md:table-cell">
                      {new Date(i.invoice_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums text-xs">
                      {new Date(i.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      {daysOverdue > 0 && (
                        <span className="ml-1 text-destructive font-medium">+{daysOverdue}d</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="border-0 text-xs" style={{ backgroundColor: ss.bg, color: ss.color }}>
                        {ss.label}
                      </Badge>
                    </td>
                    <td className="hidden px-3 py-2 text-right tabular-nums text-muted-foreground sm:table-cell">
                      ₹{Number(i.total).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {outstanding > 0
                        ? <span className={daysOverdue > 0 ? 'text-destructive' : ''}>₹{outstanding.toLocaleString('en-IN')}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
