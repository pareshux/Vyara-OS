/**
 * /approvals — pending approvals queue.
 *
 * Lists every request where the current user is an eligible approver
 * for the current open step (sequential) or any open step (parallel).
 * Admins see everything.
 *
 * Click-through opens the source entity's detail page; inline Approve/
 * Reject is also available on the row for speed.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { listMyPendingApprovals, type PendingApprovalRow } from '@/lib/actions/approvals'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShieldCheck, ArrowRight } from 'lucide-react'
import { DecideButtons } from '@/components/approval/decide-buttons'

export const dynamic = 'force-dynamic'

// entity_type → detail-page resolver. As new consumers ship they
// register here. Unknown entity_type silently drops the link.
function entityDetailHref(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case 'expense_claim':
      return `/field/team/claims/${entityId}`
    case 'discount':
    case 'quotation_discount':
      return `/projects` // placeholder — quote detail page wires later
    default:
      return null
  }
}

const MODE_LABEL: Record<PendingApprovalRow['policy_mode'], string> = {
  sequential: 'Sequential',
  parallel: 'Parallel',
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

export default async function ApprovalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const result = await listMyPendingApprovals()

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-primary" />
        <h1 className="text-xl font-semibold">Approvals</h1>
        {result.ok && (
          <Badge variant="outline" className="ml-1 text-[10px] uppercase">
            {result.requests.length} pending
          </Badge>
        )}
      </div>

      {!result.ok ? (
        <Card><CardContent className="py-6 text-sm text-destructive">{result.error}</CardContent></Card>
      ) : result.requests.length === 0 ? (
        <Card>
          <CardContent className="py-10 flex flex-col items-center gap-2 text-center">
            <ShieldCheck className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">Nothing waiting on you.</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Approvals raised by your team will appear here. The queue is filtered to requests where
              you're eligible for the open step.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {result.requests.map((r) => {
            const href = entityDetailHref(r.entity_type, r.entity_id)
            return (
              <Card key={r.id}>
                <CardContent className="py-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{r.policy_name}</p>
                        <Badge variant="outline" className="text-[10px] uppercase border-0 bg-muted/40">
                          {r.entity_type}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] uppercase border-0 bg-muted/40">
                          {MODE_LABEL[r.policy_mode]}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {r.subject_name ?? '—'}
                        {r.subject_role && <> · <span className="capitalize">{r.subject_role}</span></>}
                        {r.amount != null && <> · <span className="tabular-nums">{formatINR(r.amount)}</span></>}
                        {' '}· {formatWhen(r.created_at)}
                      </p>
                      {r.current_step_label && (
                        <p className="text-[11px] mt-1">
                          <span className="text-muted-foreground">Open: </span>
                          <span className="font-medium">{r.current_step_label}</span>
                        </p>
                      )}
                      {r.notes && (
                        <p className="text-xs text-muted-foreground mt-2 rounded-md bg-muted/30 px-2.5 py-1.5">
                          {r.notes}
                        </p>
                      )}
                    </div>
                    {href && (
                      <Link
                        href={href}
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1 shrink-0"
                      >
                        Open <ArrowRight className="size-3" />
                      </Link>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <DecideButtons requestId={r.id} />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
