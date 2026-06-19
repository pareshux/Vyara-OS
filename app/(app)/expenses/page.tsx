/**
 * /expenses — rep + manager view of expense line items.
 *
 * Reps see their own. Managers/admins see the whole team (no per-rep
 * filter yet — added when team scale needs it).
 *
 * Shows: status filter, date-range header, totals by status, line
 * list with category / amount / status / receipt count.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { listMyExpenses, type ExpenseRow, type ExpenseStatus } from '@/lib/actions/expenses'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Receipt,
  Wallet,
  CheckCircle2,
  Clock,
  XCircle,
  Ban,
  FileText,
} from 'lucide-react'
import { LogExpenseSheet } from '@/components/expense/log-expense-sheet'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<ExpenseStatus, string> = {
  draft: 'Draft',
  submitted: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  exported: 'Exported',
}

const STATUS_TINT: Record<ExpenseStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
  cancelled: 'bg-muted text-muted-foreground',
  exported: 'bg-slate-100 text-slate-700',
}

const STATUS_ICON: Record<ExpenseStatus, typeof Receipt> = {
  draft: FileText,
  submitted: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  cancelled: Ban,
  exported: Wallet,
}

function formatINR(v: number): string {
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
}

export default async function ExpensesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role, full_name')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')

  const tenantId = profile.tenant_id as string
  const isAdminish = profile.role === 'admin' || profile.role === 'manager'

  const result = await listMyExpenses({ status: 'all' })
  const rows: ExpenseRow[] = result.ok ? result.expenses : []
  const total = result.ok ? result.totalAmount : 0

  // Rollups by status.
  const byStatus = new Map<ExpenseStatus, { count: number; total: number }>()
  for (const r of rows) {
    const cur = byStatus.get(r.status) ?? { count: 0, total: 0 }
    byStatus.set(r.status, { count: cur.count + 1, total: cur.total + r.amount })
  }

  // Group by date for the list.
  const byDate = new Map<string, ExpenseRow[]>()
  for (const r of rows) {
    const list = byDate.get(r.expense_date) ?? []
    list.push(r)
    byDate.set(r.expense_date, list)
  }
  const sortedDates = [...byDate.keys()].sort().reverse()

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Wallet className="size-5 text-primary" />
        <h1 className="text-xl font-semibold">{isAdminish ? 'Team expenses' : 'My expenses'}</h1>
        <Badge variant="outline" className="ml-1 text-[10px] uppercase">
          {rows.length} items
        </Badge>
        <span className="text-xs text-muted-foreground tabular-nums ml-auto">
          {formatINR(total)} total
        </span>
      </div>

      {/* Rollup cards */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {(['submitted', 'approved', 'rejected', 'exported'] as ExpenseStatus[]).map((s) => {
            const r = byStatus.get(s) ?? { count: 0, total: 0 }
            const Icon = STATUS_ICON[s]
            return (
              <Card key={s}>
                <CardContent className="py-3 flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon className="size-3.5" />
                    {STATUS_LABEL[s]}
                  </div>
                  <p className="text-sm font-semibold tabular-nums">{formatINR(r.total)}</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">{r.count} items</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Quick-add button */}
      <div className="flex justify-end">
        <LogExpenseSheet
          tenantId={tenantId}
          triggerLabel="Log expense"
          triggerVariant="default"
        />
      </div>

      {/* Day groups */}
      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 flex flex-col items-center gap-2 text-center">
            <Wallet className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">No expenses logged yet.</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Snap a receipt or log an amount — it'll roll up into your monthly claim.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {sortedDates.map((date) => {
            const dayRows = byDate.get(date)!
            const daySum = dayRows.reduce((acc, r) => acc + r.amount, 0)
            return (
              <Card key={date}>
                <CardContent className="py-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold">{formatDate(date)}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{formatINR(daySum)}</p>
                  </div>
                  <ul className="flex flex-col divide-y">
                    {dayRows.map((r) => {
                      const StatusIcon = STATUS_ICON[r.status]
                      return (
                        <li key={r.id} className="flex items-start gap-2 py-2">
                          <Receipt className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium">{r.category_label}</p>
                              <Badge variant="outline" className={`text-[10px] uppercase border ${STATUS_TINT[r.status]}`}>
                                <StatusIcon className="size-3 mr-0.5" />
                                {STATUS_LABEL[r.status]}
                              </Badge>
                            </div>
                            {isAdminish && r.user_name && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">{r.user_name}</p>
                            )}
                            {r.notes && (
                              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{r.notes}</p>
                            )}
                            {r.rejection_reason && (
                              <p className="text-[11px] text-rose-700 mt-0.5">{r.rejection_reason}</p>
                            )}
                            {r.subject_type === 'field_visit' && r.subject_id && (
                              <p className="text-[11px] mt-0.5">
                                <Link href={`/field`} className="text-primary hover:underline">
                                  → tied to a visit
                                </Link>
                              </p>
                            )}
                          </div>
                          <p className="text-sm font-semibold tabular-nums shrink-0">{formatINR(r.amount)}</p>
                        </li>
                      )
                    })}
                  </ul>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
