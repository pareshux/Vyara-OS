/**
 * /customers/[firmId] — Customer 360 (Blueprint REL-009, Slice 1.6)
 *
 * One surface for everything we know about a firm. Header card is identity
 * + contact details; tabs below carry the content sections.
 *
 * Tabs shipping now:
 *   - Overview   — KPI strip + AI insights placeholder + notes
 *   - Projects   — every project this firm participates in
 *   - Contacts   — every person at this firm
 *
 * Slice 2 will add (each tab = "one more section in the read-model + one
 * more <TabsContent>"): Quotes · Orders · Invoices · Collections.
 * Slice 3 will add: Visits · Activity timeline · AI insights inline.
 *
 * The URL says "customer" but internally the entity is `firm`. The same
 * page works for an architect, dealer, distributor — anyone in the
 * `relationship_type_master`.
 *
 * Cross-capability reads go through `lib/read-models/customer-360.ts`.
 */
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCustomer360 } from '@/lib/read-models/customer-360'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  Users,
  Sparkles,
  TrendingUp,
  IndianRupee,
  Package,
  CalendarDays,
  Truck,
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

function formatINR(v: number): string {
  return `₹${v.toLocaleString('en-IN')}`
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

  const { firm, primary_contact, contacts, contact_count, projects, orders, kpis } = data

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/firms" className="hover:text-foreground transition-colors inline-flex items-center gap-1">
          <ArrowLeft className="size-3.5" /> Firms
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium truncate">{firm.name}</span>
      </div>

      {/* ── Header card ─────────────────────────────────────────── */}
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
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Primary contact
              </p>
              {primary_contact ? (
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
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
        </CardContent>
      </Card>

      {/* ── Tabs ────────────────────────────────────────────────── */}
      <Tabs defaultValue="overview">
        <TabsList variant="line" className="w-full justify-start border-b border-border rounded-none h-auto pb-0 gap-0">
          <TabsTrigger value="overview" className="rounded-none pb-3 px-4">Overview</TabsTrigger>
          <TabsTrigger value="projects" className="rounded-none pb-3 px-4">
            Projects
            {projects.total > 0 && (
              <span className="ml-1.5 tabular-nums text-xs text-muted-foreground">
                {projects.total}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="orders" className="rounded-none pb-3 px-4">
            Orders
            {orders.total > 0 && (
              <span className="ml-1.5 tabular-nums text-xs text-muted-foreground">
                {orders.total}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="contacts" className="rounded-none pb-3 px-4">
            Contacts
            {contact_count > 0 && (
              <span className="ml-1.5 tabular-nums text-xs text-muted-foreground">
                {contact_count}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Overview tab ─────────────────────────────────────── */}
        <TabsContent value="overview" className="mt-4 flex flex-col gap-4">
          {/* KPI strip */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <Card size="sm">
              <CardContent className="pt-3 flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FolderOpen className="size-3.5" /> Projects
                </div>
                <p className="text-xl font-semibold tabular-nums">{projects.total}</p>
                {kpis.active_project_count > 0 && projects.total > kpis.active_project_count && (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {kpis.active_project_count} active
                  </p>
                )}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardContent className="pt-3 flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="size-3.5" /> Contacts
                </div>
                <p className="text-xl font-semibold tabular-nums">{contact_count}</p>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardContent className="pt-3 flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <IndianRupee className="size-3.5" /> Total est. value
                </div>
                <p className="text-xl font-semibold tabular-nums">
                  {kpis.total_estimated_value > 0 ? formatINR(kpis.total_estimated_value) : '—'}
                </p>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardContent className="pt-3 flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="size-3.5" /> Last touched
                </div>
                <p className="text-xl font-semibold tabular-nums">
                  {kpis.last_touched_at ? timeAgo(kpis.last_touched_at) : '—'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* AI insights placeholder */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                  <Sparkles className="size-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">AI insights</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Relationship brief and next-best-action arrive here once we wire REL-011. The data is ready: projects, contacts, visits, payment history will be summarised into a 3-line read.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          {firm.notes && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Notes
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{firm.notes}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Projects tab ─────────────────────────────────────── */}
        <TabsContent value="projects" className="mt-4 flex flex-col gap-3">
          {projects.total > projects.showing && (
            <p className="text-xs text-muted-foreground tabular-nums">
              Showing {projects.showing} of {projects.total} · most recently updated
            </p>
          )}

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
                        ? formatINR(p.estimated_value)
                        : '—'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Orders tab ───────────────────────────────────────── */}
        <TabsContent value="orders" className="mt-4 flex flex-col gap-3">
          {orders.total > 0 && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
              <span>
                <span className="font-medium text-foreground">{orders.total}</span> total
              </span>
              {orders.active_count > 0 && (
                <span>
                  <span className="font-medium text-foreground">{orders.active_count}</span> active
                </span>
              )}
              {orders.total_value > 0 && (
                <span>
                  <span className="font-medium text-foreground">{formatINR(orders.total_value)}</span> total value
                </span>
              )}
              {orders.total > orders.showing && (
                <span className="ml-auto">
                  Showing {orders.showing} of {orders.total} · newest first
                </span>
              )}
            </div>
          )}

          {orders.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-10 text-center">
              <Package className="size-7 mb-3 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">No orders yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Orders appear here when a quote is converted or a direct order is created for {firm.name}.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {orders.items.map((o) => (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className="group rounded-lg border border-border bg-card hover:border-foreground/20 hover:bg-muted/50 transition-colors p-3 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Package className="size-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground font-mono tabular-nums">
                          {o.order_number}
                        </span>
                        {o.current_stage && (
                          <Badge
                            variant="outline"
                            className="border-0 text-[10px]"
                            style={{
                              backgroundColor: `${o.current_stage.color}20`,
                              color: o.current_stage.color,
                            }}
                          >
                            {o.current_stage.label}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {o.project && (
                          <span className="flex items-center gap-1 truncate">
                            <FolderOpen className="size-3" />
                            {o.project.name}
                          </span>
                        )}
                        <span className="flex items-center gap-1 tabular-nums">
                          <CalendarDays className="size-3" />
                          Ordered {new Date(o.order_date + 'T12:00:00').toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}
                        </span>
                        {o.expected_delivery_at && (
                          <span className="flex items-center gap-1 tabular-nums">
                            <Truck className="size-3" />
                            Expect {new Date(o.expected_delivery_at + 'T12:00:00').toLocaleDateString('en-IN', {
                              day: 'numeric', month: 'short',
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-sm tabular-nums font-medium text-foreground">
                        {formatINR(o.value)}
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground/50 group-hover:text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Contacts tab ─────────────────────────────────────── */}
        <TabsContent value="contacts" className="mt-4 flex flex-col gap-3">
          {contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-10 text-center">
              <Users className="size-7 mb-3 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">No contacts yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a person at {firm.name} from the Contacts page or by scanning a business card.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                    <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground sm:table-cell">Role</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Phone</th>
                    <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground md:table-cell">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c, idx) => (
                    <tr
                      key={c.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <User className="size-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-foreground">{c.full_name}</span>
                          {idx === 0 && (
                            <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
                              Primary
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                        {c.role_title ?? <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {c.phone ? (
                          <a href={`tel:${c.phone}`} className="hover:text-primary">
                            {c.phone}
                          </a>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                        {c.email ? (
                          <a href={`mailto:${c.email}`} className="hover:text-primary truncate inline-block max-w-[260px]">
                            {c.email}
                          </a>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {contact_count > contacts.length && (
                <div className="border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground tabular-nums">
                  Showing {contacts.length} of {contact_count}
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
