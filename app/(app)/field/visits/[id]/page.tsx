/**
 * /field/visits/[id] — Visit Hub (FO-6 · Blueprint FLD-014)
 *
 * One surface that gathers everything tied to a visit:
 *   - Header: subject, contact, time, location, state pill
 *   - Proof: attachments (photos, documents, signature, voice notes)
 *   - Expenses: line items tied to this visit (via subject_type)
 *   - Notes + interest signal + outcome
 *   - Follow-up tasks
 *   - Activity timeline (visit-scoped)
 *   - Quick-actions: log expense, attach more, book order (placeholder),
 *     log complaint (placeholder — CS-001 ships later)
 *
 * Cross-capability reads go through `lib/read-models/visit-detail.ts`.
 * The page is a dumb consumer of one assembled object.
 */
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getVisitDetail, type VisitDetail } from '@/lib/read-models/visit-detail'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  MapPin,
  Clock,
  ThumbsUp,
  ThumbsDown,
  CheckCircle2,
  ChevronRight,
  Calendar,
  Phone,
  Activity as ActivityIcon,
  ClipboardList,
  Receipt,
  ExternalLink,
} from 'lucide-react'
import { AttachmentList } from '@/components/attachment/list'
import { AttachmentUploadButton } from '@/components/attachment/upload-button'
import { SignaturePad } from '@/components/attachment/signature-pad'
import { LogExpenseSheet } from '@/components/expense/log-expense-sheet'

export const dynamic = 'force-dynamic'

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })
}

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  })
}

function formatINR(v: number): string {
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

const SUBJECT_TINT: Record<NonNullable<VisitDetail['subject']>['type'], string> = {
  project: 'bg-blue-50 text-blue-700',
  lead: 'bg-violet-50 text-violet-700',
  firm: 'bg-amber-50 text-amber-700',
  dealer: 'bg-emerald-50 text-emerald-700',
}

export default async function VisitDetailPage(
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')
  const tenantId = profile.tenant_id as string

  const visit = await getVisitDetail(id)
  if (!visit) notFound()

  const stateBadge =
    visit.state === 'in_progress' ? (
      <Badge variant="outline" className="text-[10px] uppercase border-0 bg-emerald-100 text-emerald-800">
        Live
      </Badge>
    ) : (
      <Badge variant="outline" className="text-[10px] uppercase border-0 bg-slate-100 text-slate-700">
        Completed
      </Badge>
    )

  const contactDisplay = visit.contact.name ?? visit.contact_name_raw
  const contactPhone = visit.contact.phone ?? visit.contact_phone_raw

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto flex flex-col gap-4">
      {/* Back nav */}
      <Link
        href="/field"
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 w-fit"
      >
        <ArrowLeft className="size-3" /> Back to field
      </Link>

      {/* Header */}
      <Card>
        <CardContent className="py-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {stateBadge}
                {visit.subject && (
                  <Badge variant="outline" className={`text-[10px] uppercase border-0 ${SUBJECT_TINT[visit.subject.type]}`}>
                    {visit.subject.type}
                  </Badge>
                )}
                {visit.purpose && (
                  <Badge variant="outline" className="text-[10px] uppercase border-0 bg-muted/40">
                    {visit.purpose.label}
                  </Badge>
                )}
              </div>
              <h1 className="text-lg font-semibold mt-2">
                {visit.subject?.label ?? 'Visit'}
              </h1>
              {visit.subject && (
                <Link
                  href={visit.subject.href}
                  className="text-xs text-primary hover:underline inline-flex items-center gap-0.5 mt-0.5"
                >
                  Open {visit.subject.type} <ChevronRight className="size-3" />
                </Link>
              )}
              <p className="text-[11px] text-muted-foreground mt-2 tabular-nums flex items-center gap-1.5">
                <Calendar className="size-3" />
                {formatDateTime(visit.visited_at ?? visit.started_at)}
                {visit.duration_minutes != null && <> · <Clock className="size-3" /> {visit.duration_minutes} min</>}
              </p>
              {(visit.lat != null && visit.lng != null) && (
                <a
                  href={`https://www.google.com/maps?q=${visit.lat},${visit.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-primary hover:underline mt-1 inline-flex items-center gap-1"
                >
                  <MapPin className="size-3" /> {visit.location_label ?? `${visit.lat.toFixed(4)}, ${visit.lng.toFixed(4)}`}
                </a>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] text-muted-foreground uppercase">Logged by</p>
              <p className="text-xs font-medium">{visit.user_name ?? '—'}</p>
            </div>
          </div>

          {/* Met whom */}
          {(contactDisplay || contactPhone) && (
            <div className="rounded-md bg-muted/20 px-3 py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                {contactDisplay && (
                  <p className="text-sm font-medium">{contactDisplay}</p>
                )}
                {contactPhone && (
                  <a
                    href={`tel:${contactPhone}`}
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1 tabular-nums mt-0.5"
                  >
                    <Phone className="size-3" /> {contactPhone}
                  </a>
                )}
              </div>
              {visit.is_interested === true && (
                <Badge variant="outline" className="text-[10px] uppercase border-0 bg-emerald-50 text-emerald-700">
                  <ThumbsUp className="size-3 mr-0.5" /> Interested
                </Badge>
              )}
              {visit.is_interested === false && (
                <Badge variant="outline" className="text-[10px] uppercase border-0 bg-rose-50 text-rose-700">
                  <ThumbsDown className="size-3 mr-0.5" /> Not
                </Badge>
              )}
            </div>
          )}

          {/* Outcome */}
          {visit.outcome && (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-emerald-700" />
              <span className="text-muted-foreground">Next:</span>
              <span className="font-medium">{visit.outcome.label}</span>
            </div>
          )}

          {/* Notes */}
          {visit.notes_text && (
            <p className="text-sm text-muted-foreground border-l-2 border-primary/30 pl-3 italic">
              {visit.notes_text}
            </p>
          )}

          {/* Quick actions row */}
          <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
            <AttachmentUploadButton
              tenantId={tenantId}
              entityType="field_visit"
              entityId={visit.id}
              kind="photo"
              size="sm"
              label="Add photo"
            />
            <AttachmentUploadButton
              tenantId={tenantId}
              entityType="field_visit"
              entityId={visit.id}
              kind="document"
              size="sm"
              label="Attach file"
            />
            <SignaturePad
              tenantId={tenantId}
              entityType="field_visit"
              entityId={visit.id}
              signerName={contactDisplay ?? undefined}
              triggerLabel="Signature"
              size="sm"
            />
            <LogExpenseSheet
              tenantId={tenantId}
              subjectType="field_visit"
              subjectId={visit.id}
              triggerLabel="Log expense"
            />
          </div>
        </CardContent>
      </Card>

      {/* Proof */}
      <Card>
        <CardContent className="py-4 flex flex-col gap-2">
          <p className="text-sm font-semibold">Proof</p>
          {visit.attachments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No photos, documents, or signature captured yet.</p>
          ) : (
            <AttachmentList
              entityType="field_visit"
              entityId={visit.id}
              emptyLabel={null}
            />
          )}
        </CardContent>
      </Card>

      {/* Expenses */}
      {(visit.expenses.length > 0 || visit.state === 'in_progress') && (
        <Card>
          <CardContent className="py-4 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Receipt className="size-4 text-muted-foreground" />
                Expenses tied to this visit
              </p>
              {visit.expenses.length > 0 && (
                <span className="text-xs font-medium tabular-nums">{formatINR(visit.expenses_total)}</span>
              )}
            </div>
            {visit.expenses.length === 0 ? (
              <p className="text-xs text-muted-foreground">No expenses logged for this visit.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {visit.expenses.map((e) => (
                  <li key={e.id} className="flex items-start gap-2 py-2">
                    <Receipt className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{e.category_label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {formatDate(e.expense_date)} · <span className="capitalize">{e.status}</span>
                      </p>
                      {e.notes && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{e.notes}</p>
                      )}
                    </div>
                    <p className="text-sm font-semibold tabular-nums">{formatINR(e.amount)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Follow-up tasks */}
      {visit.tasks.length > 0 && (
        <Card>
          <CardContent className="py-4 flex flex-col gap-2">
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <ClipboardList className="size-4 text-muted-foreground" />
              Follow-ups
            </p>
            <ul className="flex flex-col divide-y">
              {visit.tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-2 py-2">
                  <div className={`size-2 rounded-full mt-1.5 shrink-0 ${t.is_done ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {t.assignee_name && <>{t.assignee_name} · </>}
                      {t.due_at ? formatDateTime(t.due_at) : 'no due date'}
                    </p>
                  </div>
                  <Link href={`/tasks`} className="text-[11px] text-primary hover:underline shrink-0 inline-flex items-center">
                    Open <ExternalLink className="size-3 ml-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Activity timeline */}
      {visit.activities.length > 0 && (
        <Card>
          <CardContent className="py-4 flex flex-col gap-2">
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <ActivityIcon className="size-4 text-muted-foreground" />
              Activity
            </p>
            <ul className="flex flex-col gap-2">
              {visit.activities.map((a) => (
                <li key={a.id} className="flex items-start gap-2 text-xs">
                  <span className="text-muted-foreground tabular-nums w-20 shrink-0">{formatTime(a.created_at)}</span>
                  <div className="flex-1">
                    <p className="font-medium capitalize">{a.kind.replace(/_/g, ' ')}</p>
                    {a.actor_name && (
                      <p className="text-[11px] text-muted-foreground">{a.actor_name}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
