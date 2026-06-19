/**
 * ApprovalCard — inline rendering on an entity's detail page (expense,
 * discount, credit-extension, …). Receives the request id (which the
 * entity stores) and fetches via `getApprovalRequest`. Server component.
 *
 * Renders:
 *   - Status pill (pending / approved / rejected / cancelled)
 *   - Policy + steps with per-step state (cleared / open / waiting)
 *   - Decision history (who approved/rejected each step + comment)
 *   - DecideButtons when the request is pending (server-side eligibility
 *     check is enforced by the action; the buttons just hint UX)
 */
import { getApprovalRequest, type ApprovalRequestDetail } from '@/lib/actions/approvals'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  ShieldCheck,
} from 'lucide-react'
import { DecideButtons } from './decide-buttons'

const STATUS_TINT: Record<ApprovalRequestDetail['status'], string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
  cancelled: 'bg-muted text-muted-foreground border-border',
}

const STATUS_ICON = {
  pending: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  cancelled: Ban,
}

function formatINR(v: number | null): string {
  if (v == null) return '—'
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })
}

export async function ApprovalCard({ requestId }: { requestId: string }) {
  const r = await getApprovalRequest(requestId)
  if (!r.ok) {
    return (
      <Card>
        <CardContent className="py-3 text-sm text-muted-foreground">
          Approval: {r.error}
        </CardContent>
      </Card>
    )
  }
  const req = r.request
  const StatusIcon = STATUS_ICON[req.status]

  // Per-step state derived from the action history.
  // 'cleared'  — has an approved action
  // 'rejected' — has a rejected action (whole request is closed anyway)
  // 'open'     — sequential current_step or parallel-open while pending
  // 'waiting'  — sequential, ahead of current
  type StepState = 'cleared' | 'rejected' | 'open' | 'waiting'
  const stateForStep = (stepOrder: number): StepState => {
    const acted = req.actions.find((a) => a.step_order === stepOrder)
    if (acted?.action === 'approved') return 'cleared'
    if (acted?.action === 'rejected') return 'rejected'
    if (req.status !== 'pending') return 'waiting'
    if (req.policy.mode === 'sequential') {
      if (req.current_step_order === stepOrder) return 'open'
      return 'waiting'
    }
    return 'open' // parallel: every un-acted step is open
  }

  const STEP_TINT: Record<StepState, string> = {
    cleared: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200',
    open: 'bg-amber-50 text-amber-800 border-amber-200 ring-1 ring-amber-300/40',
    waiting: 'bg-muted text-muted-foreground border-border',
  }

  return (
    <Card>
      <CardContent className="py-4 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <ShieldCheck className="size-4 text-primary mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{req.policy.name}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {req.subject_name ?? '—'}
                {req.amount != null && <> · <span className="tabular-nums">{formatINR(req.amount)}</span></>}
                {' '}· raised {formatWhen(req.created_at)}
              </p>
            </div>
          </div>
          <Badge variant="outline" className={`text-[10px] uppercase ${STATUS_TINT[req.status]}`}>
            <StatusIcon className="size-3 mr-1" />
            {req.status}
          </Badge>
        </div>

        {req.notes && (
          <p className="text-xs text-muted-foreground rounded-md bg-muted/30 px-2.5 py-1.5">{req.notes}</p>
        )}

        {/* Step ladder */}
        <div className="flex flex-col gap-1.5">
          {req.policy.steps.map((step) => {
            const s = stateForStep(step.step_order)
            const action = req.actions.find((a) => a.step_order === step.step_order)
            return (
              <div
                key={step.id}
                className={`flex items-start justify-between gap-2 rounded-md border px-2.5 py-1.5 ${STEP_TINT[s]}`}
              >
                <div className="flex flex-col">
                  <p className="text-xs font-medium">
                    Step {step.step_order} · {step.label ?? (step.approver_via === 'role'
                      ? `Any ${step.approver_role}`
                      : 'Specific user')}
                  </p>
                  {action && (
                    <p className="text-[11px] mt-0.5">
                      {action.action === 'approved' ? 'Approved' : 'Rejected'} by{' '}
                      <span className="font-medium">{action.approver_name ?? 'user'}</span>
                      {' '}· {formatWhen(action.acted_at)}
                      {action.comment && <> · "{action.comment}"</>}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Decision summary */}
        {req.decided_by_summary && (
          <p className="text-[11px] text-muted-foreground italic">
            {req.decided_by_summary}
            {req.decided_at && <> · {formatWhen(req.decided_at)}</>}
          </p>
        )}

        {/* Action affordance */}
        {req.status === 'pending' && (
          <div className="flex justify-end">
            <DecideButtons requestId={req.id} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
