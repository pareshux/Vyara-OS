/**
 * /demo — Raj Avinsys demo landing page (customer-facing).
 *
 * Six persona cards laid out as a team. Each persona has their own login
 * + tailored landing route. The customer can pick which role they want
 * to experience the product as.
 *
 * Vyara is intentionally hidden — this is the customer-facing demo URL.
 * Internal team members sign into Vyara via /login directly.
 */
import Link from 'next/link'
import { demoSignIn } from './actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Crown, FolderKanban, MapPin, ShoppingCart, Receipt, LifeBuoy } from 'lucide-react'

type Persona = {
  key: string
  name: string
  job_title: string
  blurb: string
  whatTheyDo: string[]
  email: string
  password: string
  icon: typeof Crown
  iconBg: string
  accent: string
}

const PERSONAS: Persona[] = [
  {
    key: 'sandeep',
    name: 'Sandeep',
    job_title: 'Director',
    blurb: 'Runs the business. Approves big-ticket decisions. Watches the money.',
    whatTheyDo: [
      'Owner dashboard with the full picture of the business',
      'Approves quotes, payments above thresholds',
      'Sees AI brief — top opportunities + risks for the day',
      'Drills into any cell of any report',
    ],
    email: 'admin@rajavinsys.example',
    password: 'RajDemo@1234',
    icon: Crown,
    iconBg: 'bg-amber-100 text-amber-700',
    accent: 'border-amber-200',
  },
  {
    key: 'rakesh',
    name: 'Rakesh',
    job_title: 'Project Manager',
    blurb: 'Runs the EPC projects. From won deal to commissioned site.',
    whatTheyDo: [
      'Tracks every active project + its milestones',
      'Raises Purchase Requisitions for materials',
      'Coordinates site engineers + dispatch',
      'Owns the project P&L',
    ],
    email: 'rakesh@rajavinsys.example',
    password: 'RajDemo@1234',
    icon: FolderKanban,
    iconBg: 'bg-sky-100 text-sky-700',
    accent: 'border-sky-200',
  },
  {
    key: 'anil',
    name: 'Anil',
    job_title: 'Site Engineer',
    blurb: 'On the road every day. Captures leads, site visits, expenses.',
    whatTheyDo: [
      'Mobile check-in with odometer photo',
      'Voice note completes the visit form',
      'Captures business cards via AI',
      'Logs expenses against the day',
    ],
    email: 'anil@rajavinsys.example',
    password: 'RajDemo@1234',
    icon: MapPin,
    iconBg: 'bg-emerald-100 text-emerald-700',
    accent: 'border-emerald-200',
  },
  {
    key: 'mehul',
    name: 'Mehul',
    job_title: 'Procurement Manager',
    blurb: 'Buys all the materials. Manages vendors and negotiations.',
    whatTheyDo: [
      'Receives PRs from project managers',
      'Sends RFQs to multiple vendors, compares quotes',
      'Raises POs, tracks goods receipt',
      'Reviews vendor performance scorecards',
    ],
    email: 'mehul@rajavinsys.example',
    password: 'RajDemo@1234',
    icon: ShoppingCart,
    iconBg: 'bg-violet-100 text-violet-700',
    accent: 'border-violet-200',
  },
  {
    key: 'priya',
    name: 'Priya',
    job_title: 'Accounts Manager',
    blurb: 'Books vendor bills, pays them, handles tax compliance.',
    whatTheyDo: [
      '3-way matches vendor invoices against PO + GRN',
      'Releases payments with TDS auto-calculated',
      'Files GSTR-2B reconciliation monthly',
      'Tracks AP ageing and MSME 45-day compliance',
    ],
    email: 'priya@rajavinsys.example',
    password: 'RajDemo@1234',
    icon: Receipt,
    iconBg: 'bg-rose-100 text-rose-700',
    accent: 'border-rose-200',
  },
  {
    key: 'vikas',
    name: 'Vikas',
    job_title: 'Service Engineer',
    blurb: 'AMC visits + breakdown response. Keeps customers happy.',
    whatTheyDo: [
      'Resolves customer complaints on-site',
      'Executes scheduled AMC visits',
      'Records root cause + resolution',
      'Tracks warranty + service history',
    ],
    email: 'vikas@rajavinsys.example',
    password: 'RajDemo@1234',
    icon: LifeBuoy,
    iconBg: 'bg-orange-100 text-orange-700',
    accent: 'border-orange-200',
  },
]

export default async function DemoLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const sp = await searchParams
  const error = sp.error

  return (
    <div className="min-h-screen bg-background px-4 py-10 md:py-16">
      <div className="mx-auto w-full max-w-6xl flex flex-col gap-10">
        {/* Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-full bg-amber-50 text-amber-700 px-3 py-1 text-xs font-medium border border-amber-200 inline-flex items-center gap-1.5">
            Raj Avinsys · Product Walkthrough
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
            Choose a role to sign in as
          </h1>
          <p className="text-sm md:text-base text-muted-foreground max-w-2xl">
            Each member of your team has a different view of the product, shaped around what they do daily.
            Pick a role below to experience the product as they would.
          </p>
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 text-destructive px-3 py-2 text-sm max-w-2xl">
              Sign-in failed: {error}
            </div>
          )}
        </div>

        {/* Persona grid — 3 columns on desktop, 2 on tablet, 1 on mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PERSONAS.map((p) => {
            const Icon = p.icon
            return (
              <Card key={p.key} className={`flex flex-col border-2 ${p.accent}`}>
                <CardContent className="flex flex-col gap-4 p-5 flex-1">
                  <div className="flex items-start gap-3">
                    <div className={`flex size-12 items-center justify-center rounded-xl shrink-0 ${p.iconBg}`}>
                      <Icon className="size-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-lg font-semibold text-foreground">{p.name}</div>
                      <div className="text-sm text-muted-foreground">{p.job_title}</div>
                    </div>
                  </div>

                  <p className="text-sm text-foreground leading-relaxed">{p.blurb}</p>

                  <div className="flex-1">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1.5">
                      What they do
                    </div>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {p.whatTheyDo.map((line, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="text-foreground/30">·</span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <form action={demoSignIn} className="mt-auto">
                    <input type="hidden" name="email" value={p.email} />
                    <input type="hidden" name="password" value={p.password} />
                    <Button type="submit" className="w-full">
                      Sign in as {p.name} →
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground space-y-1">
          <div>Same password for all roles — <code className="font-mono text-foreground">RajDemo@1234</code></div>
          <div>
            Have your own credentials? Sign in via{' '}
            <Link href="/login" className="text-primary hover:underline">
              /login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
