'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Send, Clock, XCircle, FileText } from 'lucide-react'
import { submitClaim } from '@/lib/actions/field-attendance'

interface Attendance {
  id: string
  check_in_at: string | null
  check_out_at: string | null
  check_in_odometer_km: number | null
  check_out_odometer_km: number | null
  total_km: number | null
  rate_applied: number | null
  reimbursement_amount: number | null
  claim_status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'exported'
  submitted_at: string | null
  approved_at: string | null
  rejection_reason: string | null
  notes: string | null
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })
}

function rs(n: number | null) {
  if (n == null) return '—'
  return `₹${n.toFixed(2)}`
}

const STATUS_LABEL: Record<Attendance['claim_status'], { label: string; tone: string; icon: typeof Clock }> = {
  draft:     { label: 'Draft — submit when ready', tone: 'bg-muted text-muted-foreground',           icon: FileText },
  submitted: { label: 'Submitted — awaiting manager', tone: 'bg-amber-50 text-amber-700',           icon: Clock },
  approved:  { label: 'Approved',                  tone: 'bg-emerald-50 text-emerald-700',          icon: CheckCircle2 },
  rejected:  { label: 'Rejected',                  tone: 'bg-rose-50 text-rose-700',                icon: XCircle },
  exported:  { label: 'Exported to payroll',       tone: 'bg-slate-50 text-slate-700',              icon: CheckCircle2 },
}

export function ClaimSummary({
  attendance,
  autoApproveThresholdRupees,
}: {
  attendance: Attendance
  autoApproveThresholdRupees: number
}) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const r = await submitClaim()
      if ('error' in r) { toast.error(r.error); return }
      toast.success('Claim submitted')
      router.refresh()
    })
  }

  const status = STATUS_LABEL[attendance.claim_status]
  const StatusIcon = status.icon

  return (
    <Card>
      <CardContent className="py-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            <CheckCircle2 className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Day complete</p>
            <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
              Out {formatTime(attendance.check_in_at)} → {formatTime(attendance.check_out_at)}
            </p>
          </div>
          <Badge variant="outline" className={`text-[10px] uppercase border-0 ${status.tone}`}>
            <StatusIcon className="size-3 mr-1" />
            {attendance.claim_status}
          </Badge>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm tabular-nums">
          <div className="flex justify-between">
            <span className="text-muted-foreground text-xs">Odometer</span>
            <span className="text-xs">
              {attendance.check_in_odometer_km?.toLocaleString('en-IN') ?? '—'} → {attendance.check_out_odometer_km?.toLocaleString('en-IN') ?? '—'}
            </span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-muted-foreground text-xs">Distance</span>
            <span className="text-xs font-medium">
              {attendance.total_km != null ? `${attendance.total_km.toLocaleString('en-IN')} km` : '—'}
            </span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-muted-foreground text-xs">Rate</span>
            <span className="text-xs text-muted-foreground">
              {attendance.rate_applied != null ? `${rs(attendance.rate_applied)}/km` : '—'}
            </span>
          </div>
          <div className="flex justify-between mt-1.5 pt-1.5 border-t border-border">
            <span className="font-medium">Claim</span>
            <span className="font-semibold">{rs(attendance.reimbursement_amount)}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground italic">{status.label}</p>

        {attendance.rejection_reason && (
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
            <span className="font-medium">Manager's note:</span> {attendance.rejection_reason}
          </div>
        )}

        {attendance.claim_status === 'draft' && (
          <Button onClick={submit} disabled={busy} className="h-11">
            {busy ? 'Submitting…' : (
              <>
                <Send className="size-4 mr-2" /> Submit claim
              </>
            )}
          </Button>
        )}

        {attendance.claim_status === 'approved' && attendance.approved_at == null && (
          <p className="text-[11px] text-emerald-700 italic">
            Auto-approved under ₹{autoApproveThresholdRupees} threshold.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
