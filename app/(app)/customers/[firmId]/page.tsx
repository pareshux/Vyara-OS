/**
 * /customers/[firmId] — Customer 360 (Blueprint REL-009, Slice 1)
 *
 * One surface that gathers everything we know about a firm. Slice 1 ships
 * the header card + Projects section. Slice 2 will add Orders + Quotes +
 * Invoices + Collections. Slice 3 will add Visits + Activities.
 *
 * The URL says "customer" but internally the entity is `firm` — a "customer"
 * is just a firm with `relationship_type='customer'`/`'buyer'`. The same
 * page works for an architect firm 360, a dealer firm 360, etc.
 *
 * Cross-capability reads go through `lib/read-models/customer-360.ts`.
 * The page is a dumb consumer of one assembled object.
 */
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCustomer360 } from '@/lib/read-models/customer-360'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  Building2,
  Phone,
  Mail,
  Globe,
  MapPin,
  Hash,
  User,
  FolderOpen,
  ChevronRight,
  Clock,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

const SEGMENT_LABEL: Record<string, string> = {
  architect: 'Architect',
  dealer: 'Dealer',
  tender: 'Tender',
  retail: 'Retail',
  government: 'Government',
  corporate: 'Corporate',
  generic: 'Generic',
}

function timeAgo(iso: string): string {
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths}mo ago`
  return `${Math.floor(diffMonths / 12)}y ago`
}

export default async function Customer360Page(
  props: { params: Promise<{ firmId: string }> },
) {
  const { firmId } = await props.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const data = await getCustomer360(firmId)
  if (!data) notFound()

  const { firm, primary_contact, contact_count, projects } = data

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/projects" className="hover:text-foreground transition-colors inline-flex items-center gap-1">
          <ArrowLeft className="size-3.5" /> Back
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium truncate">{firm.name}</span>
      </div>

      {/* ── Header card ────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Building2 className="size-5 text-muted-foreground" />
              <h1 className="text-xl font-semibold text-foreground">{firm.name}</h1>
              <Badge variant="outline" className="text-xs">
                {firm.relationship_type_label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              On the platform since {new Date(firm.created_at).toLocaleDateString('en-IN', {
                month: 'short', year: 'numeric',
              })}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 border-t border-border pt-4">
            {/* Contact details */}
            <div className="flex flex-col gap-2.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Contact details
              </p>
              <div className="flex flex-col gap-2 text-sm">
                {firm.phone ? (
                  <div className="flex items-center gap-2">
                    <Phone className="size-3.5 text-muted-foreground shrink-0" />
                    <a href={`tel:${firm.phone}`} className="tabular-nums hover:text-primary">
                      {firm.phone}
                    </a>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="size-3.5 shrink-0" />
                    <span>No phone</span>
                  </div>
                )}
                {firm.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="size-3.5 text-muted-foreground shrink-0" />
                    <a href={`mailto:${firm.email}`} className="hover:text-primary truncate">
                      {firm.email}
                    </a>
                  </div>
                )}
                {firm.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="size-3.5 text-muted-foreground shrink-0" />
                    <a
                      href={firm.website.startsWith('http') ? firm.website : `https://${firm.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-primary truncate"
                    >
                      {firm.website}
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <MapPin className="size-3.5 text-muted-foreground shrink-0" />
                  <span>
                    {firm.city ? `${firm.city}, ${firm.state}` : firm.state}
                  </span>
                </div>
                {firm.gstin && (
                  <div className="flex items-center gap-2">
                    <Hash className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="tabular-nums font-mono text-xs">{firm.gstin}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Primary contact */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Primary contact
                </p>
                {contact_count > 1 && (
                  <Link
                    href={`/contacts?firm=${firm.id}`}
                    className="text-xs text-primary hover:underline"
                  >
                    View all {contact_count}
                  </Link>
                )}
              </div>
              {primary_contact ? (
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium">{primary_contact.full_name}</span>
                    {primary_contact.role_title && (
                      <span className="text-xs text-muted-foreground">
                        · {primary_contact.role_title}
                      </span>
                    )}
                  </div>
                  {primary_contact.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="size-3.5 text-muted-foreground shrink-0" />
                      <a href={`tel:${primary_contact.phone}`} className="tabular-nums hover:text-primary">
                        {primary_contact.phone}
                      </a>
                    </div>
                  )}
                  {primary_contact.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="size-3.5 text-muted-foreground shrink-0" />
                      <a href={`mailto:${primary_contact.email}`} className="hover:text-primary truncate">
                        {primary_contact.email}
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No contacts captured yet.
                </p>
              )}
            </div>
          </div>

          {firm.notes && (
            <div className="border-t border-border pt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                Notes
              </p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{firm.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Projects section ───────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FolderOpen className="size-4 text-muted-foreground" />
            Projects
            <span className="tabular-nums text-muted-foreground font-normal">
              ({projects.total})
            </span>
          </h2>
          {projects.total > projects.showing && (
            <p className="text-xs text-muted-foreground tabular-nums">
              Showing {projects.showing} of {projects.total} · most recently updated
            </p>
          )}
        </div>

        {projects.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-10 text-center">
            <FolderOpen className="size-7 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No projects yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              When this firm is associated to a project, it will appear here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {projects.items.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="group rounded-lg border border-border bg-card hover:border-foreground/20 hover:bg-muted/50 transition-colors p-3 flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground truncate">
                        {p.name}
                      </span>
                      <Badge variant="outline" className="text-[10px] capitalize border-border text-muted-foreground">
                        {p.firm_role === 'buyer' ? 'Buyer' : 'Architect'}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] capitalize border-border text-muted-foreground">
                        {SEGMENT_LABEL[p.segment] ?? p.segment}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {p.owner && (
                        <span className="flex items-center gap-1">
                          <User className="size-3" />
                          {p.owner.full_name}
                        </span>
                      )}
                      {p.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3" />
                          {p.city}
                        </span>
                      )}
                      <span className="flex items-center gap-1 tabular-nums">
                        <Clock className="size-3" />
                        Updated {timeAgo(p.updated_at)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 mt-0.5" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  {p.current_stage ? (
                    <Badge
                      variant="outline"
                      className="border-0 text-[10px]"
                      style={{
                        backgroundColor: `${p.current_stage.color}20`,
                        color: p.current_stage.color,
                      }}
                    >
                      {p.current_stage.label}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">No stage</span>
                  )}
                  <span className="text-sm tabular-nums font-medium text-foreground">
                    {p.estimated_value != null
                      ? `₹${p.estimated_value.toLocaleString('en-IN')}`
                      : '—'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
