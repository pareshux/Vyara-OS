import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { BookOpen } from 'lucide-react'

export const dynamic = 'force-dynamic'

const DATE_RANGES: Array<{ key: string; label: string; days: number | null }> = [
  { key: '30',  label: '30 days',  days: 30 },
  { key: '90',  label: '90 days',  days: 90 },
  { key: '180', label: '180 days', days: 180 },
  { key: 'all', label: 'All time', days: null },
]

export default async function DealerLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const range = DATE_RANGES.find((r) => r.key === sp.range) ?? DATE_RANGES[1]  // default 90 days

  // RLS scopes dealer_ledger_v automatically (inherits from invoice + receipt RLS)
  let q = supabase
    .from('dealer_ledger_v')
    .select('*')
    .order('txn_date', { ascending: false })
  if (range.days !== null) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - range.days)
    q = q.gte('txn_date', cutoff.toISOString().slice(0, 10))
  }
  const { data: ledger } = await q

  type Row = {
    txn_date: string
    txn_type: string
    source_id: string
    source_ref: string
    debit: number
    credit: number
    description: string
    running_balance: number
  }
  const rows = (ledger ?? []) as Row[]

  // Current balance = first row's running_balance (sorted desc) — that's the most recent
  // Actually since the view's window function uses ASC ordering internally, the running_balance
  // at the most-recent row IS the current balance regardless of the SELECT order.
  const currentBalance = rows.length > 0 ? Number(rows[0].running_balance) : 0
  const totalDebits = rows.reduce((s, r) => s + Number(r.debit), 0)
  const totalCredits = rows.reduce((s, r) => s + Number(r.credit), 0)

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Ledger</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            Running balance of invoices (debits) and payments (credits) on your account.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {DATE_RANGES.map((r) => {
            const active = range.key === r.key
            return (
              <Link
                key={r.key}
                href={`/dealer-portal/ledger?range=${r.key}`}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                  active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:text-foreground'
                }`}
              >
                {r.label}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Balance summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card size="sm">
          <CardContent className="pt-3 pb-3 flex flex-col">
            <span className="text-xs uppercase text-muted-foreground">Invoiced ({range.label})</span>
            <span className="tabular-nums text-base font-semibold text-foreground">
              ₹{totalDebits.toLocaleString('en-IN')}
            </span>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="pt-3 pb-3 flex flex-col">
            <span className="text-xs uppercase text-muted-foreground">Paid ({range.label})</span>
            <span className="tabular-nums text-base font-semibold text-foreground">
              ₹{totalCredits.toLocaleString('en-IN')}
            </span>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="pt-3 pb-3 flex flex-col">
            <span className="text-xs uppercase text-muted-foreground">Current balance</span>
            <span className={`tabular-nums text-base font-semibold ${currentBalance > 0 ? 'text-destructive' : 'text-emerald-700'}`}>
              ₹{currentBalance.toLocaleString('en-IN')}
            </span>
          </CardContent>
        </Card>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <BookOpen className="size-8 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No transactions in this range</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a longer date range, or check back once invoices have been raised to your account.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Reference</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Debit</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Credit</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.txn_type}-${r.source_id}-${i}`} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-muted-foreground tabular-nums text-xs whitespace-nowrap">
                    {new Date(r.txn_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-3 py-2 capitalize">
                    {r.txn_type === 'invoice' ? (
                      <span className="text-foreground">Invoice</span>
                    ) : (
                      <span className="text-emerald-700">Payment</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.txn_type === 'invoice' ? (
                      <Link href={`/dealer-portal/invoices/${r.source_id}`} className="font-mono text-xs hover:text-primary">
                        {r.source_ref}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs">{r.source_ref}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Number(r.debit) > 0 ? <span>₹{Number(r.debit).toLocaleString('en-IN')}</span> : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Number(r.credit) > 0 ? <span className="text-emerald-700">₹{Number(r.credit).toLocaleString('en-IN')}</span> : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    ₹{Number(r.running_balance).toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground italic">
        CSV / PDF download is on the roadmap. Contact Vyara&apos;s accounts team for statement copies in the meantime.
      </p>
    </div>
  )
}
