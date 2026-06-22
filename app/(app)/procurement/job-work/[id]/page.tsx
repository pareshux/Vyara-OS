/**
 * /procurement/job-work/[id] — Challan detail with record-return form.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getJobWorkChallan, type JobWorkStatus } from '@/lib/actions/job-work'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronLeft, Wrench, AlertTriangle } from 'lucide-react'
import { RecordReturnForm } from './record-return-form'

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STATUS_META: Record<JobWorkStatus, { label: string; bg: string; text: string }> = {
  sent: { label: 'Sent', bg: 'bg-sky-100', text: 'text-sky-800' },
  partly_received: { label: 'Partly received', bg: 'bg-amber-100', text: 'text-amber-800' },
  fully_received: { label: 'Fully received', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  cancelled: { label: 'Cancelled', bg: 'bg-rose-100', text: 'text-rose-800' },
}

export default async function JobWorkDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const r = await getJobWorkChallan(id)
  if (!r) notFound()
  const meta = STATUS_META[r.status]

  const overdue =
    r.expected_return_date &&
    r.status !== 'fully_received' &&
    r.status !== 'cancelled' &&
    new Date(r.expected_return_date) < new Date()

  return (
    <div className="px-4 py-6 max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/procurement/job-work" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-3.5" /> Job work
        </Link>
        <div className="flex items-start justify-between gap-4 mt-1">
          <div>
            <h1 className="text-2xl font-semibold font-mono">{r.challan_number}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{r.job_worker_name}</p>
            {r.job_worker_gstin && <p className="font-mono text-xs text-muted-foreground">{r.job_worker_gstin}</p>}
          </div>
          <span className={`inline-block px-2.5 py-1 text-xs rounded ${meta.bg} ${meta.text}`}>{meta.label}</span>
        </div>
      </div>

      {overdue && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-3 text-sm text-amber-800 flex items-center gap-2">
            <AlertTriangle className="size-4" /> Return is overdue (expected {fmtDate(r.expected_return_date)}). Beyond 1 year for inputs, deemed-supply applies.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Wrench className="size-4" /> Material + Process</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <Field label="Description" value={r.description} />
            <Field label="Process" value={r.process_nature.replace(/_/g, ' ')} />
            <Field label="HSN code" value={r.hsn_code ?? '—'} />
            <Field label="Unit" value={r.unit} />
            <Field label="Challan date" value={fmtDate(r.challan_date)} />
            <Field label="Expected return" value={fmtDate(r.expected_return_date)} />
            <Field label="Rate (nominal)" value={r.rate ? `₹${r.rate.toLocaleString('en-IN')}/${r.unit}` : '—'} />
            <Field label="Received back at" value={fmtDate(r.received_back_at)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold mb-3">Movement</h2>
          <div className="grid grid-cols-4 gap-3 text-center mb-3">
            <Stat label="Sent" value={r.qty_sent.toLocaleString('en-IN')} sublabel={r.unit} />
            <Stat label="Received" value={r.qty_received_back.toLocaleString('en-IN')} sublabel={r.unit} color="text-emerald-700" />
            <Stat label="Scrap" value={r.qty_scrap.toLocaleString('en-IN')} sublabel={r.unit} color={r.qty_scrap > 0 ? 'text-rose-700' : ''} />
            <Stat label="Pending" value={r.qty_pending.toLocaleString('en-IN')} sublabel={r.unit} color={r.qty_pending > 0 ? 'text-amber-700' : ''} />
          </div>
          <div className="h-2 bg-stone-200 rounded-full overflow-hidden flex">
            <div className="h-full bg-emerald-500" style={{ width: `${(r.qty_received_back / r.qty_sent) * 100}%` }} />
            <div className="h-full bg-rose-400" style={{ width: `${(r.qty_scrap / r.qty_sent) * 100}%` }} />
          </div>
        </CardContent>
      </Card>

      {r.notes && (
        <Card><CardContent className="p-5">
          <h2 className="text-sm font-semibold mb-2">Notes</h2>
          <p className="text-sm whitespace-pre-wrap">{r.notes}</p>
        </CardContent></Card>
      )}

      {(r.status === 'sent' || r.status === 'partly_received') && (
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold mb-3">Record return</h2>
            <RecordReturnForm id={r.id} qtyPending={r.qty_pending} unit={r.unit} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  )
}

function Stat({ label, value, sublabel, color }: { label: string; value: string; sublabel?: string; color?: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${color ?? ''}`}>{value}</div>
      {sublabel && <div className="text-[11px] text-muted-foreground">{sublabel}</div>}
    </div>
  )
}
