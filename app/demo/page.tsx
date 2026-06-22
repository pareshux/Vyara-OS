/**
 * /demo — Demo-mode landing page (Raj demo Phase 1, Constitution v3).
 *
 * Public page (no auth required). Two cards, two "Sign in as…" forms
 * that POST to the existing signIn server action with pre-filled creds.
 * Lets prospects + internal demos toggle between tenants without typing
 * passwords each time.
 *
 * **Demo passwords are intentionally on-screen.** The page renders the
 * credentials inline so prospects can sign in themselves from /login if
 * they prefer. Same security model as hardcoding (the password ends up
 * in the form HTML either way). For real customer onboarding, never use
 * this pattern — onboard via `scripts/onboard-tenant.ts` with a strong
 * password handed off out-of-band.
 *
 * To change the Raj password: update both this file AND the password the
 * tenant was provisioned with via the CLI (no shared source of truth —
 * acceptable for a demo, would not be acceptable for production).
 */
import Link from 'next/link'
import { demoSignIn } from './actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BuildingIcon, ZapIcon, AlertTriangleIcon } from 'lucide-react'

// Hardcoded demo credentials. See doc comment above re: security model.
const DEMO_TENANTS = [
  {
    key: 'vyara',
    name: 'Vyara Tiles Limited',
    tagline: 'Building materials manufacturer · pavers, kerbs, tiles',
    blurb: 'The launch customer. Architect-specified commercial motion · sample-driven · multi-tranche dispatch · dealer network · 6-stage project pipeline ending at Paving stage.',
    icon: BuildingIcon,
    iconBg: 'bg-orange-100 text-orange-700',
    email: 'admin@vyaratiles.com',
    password: 'Vyara@1234',
    role: 'admin',
  },
  {
    key: 'raj',
    name: 'Raj Avinsys Pvt. Ltd.',
    tagline: 'Electrical EPC + panel manufacturing + AMC · Gujarat',
    blurb: 'First cross-industry customer (Constitution v3). Three motions: EPC projects (16-stage pipeline from lead to DLP), panel manufacturing (10-stage from RFQ to SAT), and AMC + breakdown service. Industrial customers across chemicals, pharma, energy, infrastructure.',
    icon: ZapIcon,
    iconBg: 'bg-amber-100 text-amber-700',
    email: 'admin@rajavinsys.example',
    password: 'RajDemo@1234',
    role: 'admin',
  },
] as const

export default async function DemoLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const sp = await searchParams
  const error = sp.error

  return (
    <div className="min-h-screen bg-background px-4 py-12 md:py-20">
      <div className="mx-auto w-full max-w-5xl flex flex-col gap-10">
        {/* Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-full bg-amber-50 text-amber-700 px-3 py-1 text-xs font-medium border border-amber-200 inline-flex items-center gap-1.5">
            <AlertTriangleIcon className="size-3.5" />
            Demo mode · credentials shown for transparency
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
            Sign in as either tenant
          </h1>
          <p className="text-sm md:text-base text-muted-foreground max-w-2xl">
            CRMOS is a modular Business Operating System — same architecture, configured per industry.
            Pick a tenant to see the same screens with different masters, pipelines, vocabulary, and seed data.
          </p>
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 text-destructive px-3 py-2 text-sm max-w-2xl">
              Sign-in failed: {error}.{' '}
              {error.toLowerCase().includes('invalid login') && (
                <span className="text-muted-foreground">
                  (The Raj tenant may not be provisioned yet — run{' '}
                  <code className="font-mono">tsx scripts/onboard-tenant.ts ./scripts/onboard-tenant-config.raj.json</code>{' '}
                  first.)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Tenant cards — two-column on desktop, stacked on mobile */}
        <div className="grid md:grid-cols-2 gap-4">
          {DEMO_TENANTS.map((t) => {
            const Icon = t.icon
            return (
              <Card key={t.key} className="flex flex-col">
                <CardHeader className="flex flex-row items-start gap-3">
                  <div className={`flex size-10 items-center justify-center rounded-xl shrink-0 ${t.iconBg}`}>
                    <Icon className="size-5" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <CardDescription className="mt-0.5 text-xs">{t.tagline}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 flex-1">
                  <p className="text-sm text-muted-foreground leading-relaxed">{t.blurb}</p>

                  <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs font-mono text-muted-foreground">
                    <div className="flex items-center justify-between gap-2">
                      <span>{t.email}</span>
                      <span className="text-text-subtle">·</span>
                      <span>{t.password}</span>
                    </div>
                  </div>

                  <form action={demoSignIn} className="mt-auto">
                    <input type="hidden" name="email" value={t.email} />
                    <input type="hidden" name="password" value={t.password} />
                    <Button type="submit" className="w-full">
                      Sign in as {t.name} admin →
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground">
          Sign in normally via{' '}
          <Link href="/login" className="text-primary hover:underline">
            /login
          </Link>{' '}
          if you have your own credentials.
        </div>
      </div>
    </div>
  )
}
