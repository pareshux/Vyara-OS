/**
 * /amc — CS-009 list page (Raj demo Phase 4 minimal).
 *
 * Server component. Shows AMC contracts with status, visit progress
 * (done / scheduled / overdue), value, and days-to-expiry. Click a
 * contract to drill — but /amc/[id] detail page is deferred to v2.
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listAmcContracts, type AmcListRow } from '@/lib/actions/amc'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CalendarClock, CheckCircle2, AlertTriangle, Clock, Building2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

function formatINR(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} cr`
  if (n >=    100_000) return `₹${(n /    100_000).toFixed(1)} L`
  return `₹${n.toLocaleString('en-IN')}`
}

export default async function AmcPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const r = await listAmcContracts()
  if (!r.ok) {
    return (
      <div className="p-6">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-6 text-destructive">Failed to load AMC contracts: {r.error}</CardContent>
        </Card>
      </div>
    )
  }

  const contracts = r.data
  const active = contracts.filter((c) => c.status === 'active')
  const otherStates = contracts.filter((c) => c.status !== 'active')
  const expiringSoon = active.filter((c) => c.days_to_expiry <= 60 && c.days_to_expiry > 0)
  const totalOverdueVisits = active.reduce((s, c) => s + c.visits_overdue, 0)

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 shrink-0">
            <CalendarClock className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">AMC contracts</h1>
            <p className="text-sm text-muted-foreground">Customer Success · annual maintenance + scheduled visits</p>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid md:grid-cols-4 gap-3">
        <KpiCard label="Active" value={`${active.length}`} icon={CheckCircle2} iconClass="bg-emerald-100 text-emerald-700" />
        <KpiCard label="Annual value" value={formatINR(active.reduce((s, c) => s + Number(c.value || 0), 0))} icon={CalendarClock} iconClass="bg-cyan-100 text-cyan-700" />
        <KpiCard label="Visits overdue" value={`${totalOverdueVisits}`} icon={AlertTriangle} iconClass={totalOverdueVisits > 0 ? 'bg-orange-100 text-orange-700' : 'bg-muted text-muted-foreground'} />
        <KpiCard label="Expiring ≤60d" value={`${expiringSoon.length}`} icon={Clock} iconClass={expiringSoon.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'} />
      </div>

      {/* Active contracts */}
      <Section title="Active contracts">
        {active.length === 0 ? (
          <Card><CardContent className="pt-6 text-sm text-muted-foreground">No active AMC contracts.</CardContent></Card>
        ) : active.map((c) => <AmcRow key={c.id} c={c} />)}
      </Section>

      {/* Others */}
      {otherStates.length > 0 && (
        <Section title="Draft / expired / renewed / cancelled">
          {otherStates.map((c) => <AmcRow key={c.id} c={c} muted />)}
        </Section>
      )}
    </div>
  )
}

function KpiCard({ label, value, icon: Icon, iconClass }: {
  label: string; value: string; icon: typeof CalendarClock; iconClass: string
}) {
  return (
    <Card size="sm">
      <CardContent className="pt-4 flex items-center gap-3">
        <div className={`flex size-9 items-center justify-center rounded-md ${iconClass}`}>
          <Icon className="size-4" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e', draft: '#94a3b8', expired: '#f97316', renewed: '#60a5fa', cancelled: '#ef4444',
}

function AmcRow({ c, muted = false }: { c: AmcListRow; muted?: boolean }) {
  const expiryColor = c.days_to_expiry < 30 ? 'text-orange-700' : c.days_to_expiry < 60 ? 'text-amber-700' : 'text-muted-foreground'
  const visitProgress = c.visits_done + c.visits_scheduled > 0
    ? `${c.visits_done} / ${c.visits_done + c.visits_scheduled} visits`
    : 'No visits scheduled'

  return (
    <Card size="sm" className={muted ? 'opacity-70' : ''}>
      <CardContent className="pt-4 flex items-center gap-3 flex-wrap">
        <Badge variant="outline" style={{ borderColor: STATUS_COLORS[c.status] ?? '#94a3b8', color: STATUS_COLORS[c.status] ?? '#94a3b8' }}>
          {c.status}
        </Badge>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-muted-foreground">{c.contract_number}</span>
            <span className="text-sm font-medium truncate">{c.title}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
            <Building2 className="size-3" />
            <span>{c.firm_name ?? '—'}</span>
            <span>·</span>
            <span className="tabular-nums">{visitProgress}</span>
            {c.visits_overdue > 0 && (
              <Badge variant="outline" className="text-xs h-5 text-orange-700 border-orange-300">
                {c.visits_overdue} overdue
              </Badge>
            )}
            <span>·</span>
            <span>{c.visit_frequency}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium tabular-nums">{formatINR(c.value)}</div>
          <div className={`text-xs tabular-nums ${expiryColor}`}>
            {c.status === 'active' ? `${c.days_to_expiry}d to expiry` : new Date(c.end_date).toLocaleDateString('en-IN')}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
