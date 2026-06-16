import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

export default async function DealerProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('full_name, phone')
    .eq('id', user.id)
    .single()

  const { data: link } = await supabase
    .from('dealer_user')
    .select(
      `invited_at, accepted_at,
       dealer:dealer_id(dealer_code, tier, territory, credit_limit, credit_period_days, onboarded_at,
                        firm:firm_id(name, city, gstin, phone, email))`
    )
    .eq('auth_user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  const dealer = (Array.isArray(link?.dealer) ? link?.dealer[0] : link?.dealer) as
    | { dealer_code: string; tier: string | null; territory: string | null; credit_limit: number | null; credit_period_days: number; onboarded_at: string;
        firm: { name: string; city: string | null; gstin: string | null; phone: string | null; email: string | null } | { name: string; city: string | null; gstin: string | null; phone: string | null; email: string | null }[] | null }
    | null
  const firm = dealer ? (Array.isArray(dealer.firm) ? dealer.firm[0] : dealer.firm) as { name: string; city: string | null; gstin: string | null; phone: string | null; email: string | null } | null : null

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-3xl">
      <h1 className="text-lg font-semibold">Profile</h1>

      <Card>
        <CardContent className="pt-4 flex flex-col gap-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Account</p>
          <Row label="Name" value={profile?.full_name ?? '—'} />
          <Row label="Email" value={user.email ?? '—'} />
          <Row label="Phone" value={profile?.phone ?? '—'} />
          {link && (
            <>
              <Row label="Invited" value={new Date(link.invited_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} />
              {link.accepted_at && (
                <Row label="First sign-in" value={new Date(link.accepted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {dealer && firm && (
        <Card>
          <CardContent className="pt-4 flex flex-col gap-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dealer</p>
            <Row label="Firm" value={firm.name} />
            <Row label="Code" value={<span className="font-mono">{dealer.dealer_code}</span>} />
            {dealer.tier && (
              <Row label="Tier" value={<Badge variant="secondary" className="text-xs capitalize">{dealer.tier}</Badge>} />
            )}
            <Row label="Territory" value={dealer.territory ?? '—'} />
            <Row label="City" value={firm.city ?? '—'} />
            <Row label="GSTIN" value={firm.gstin ?? '—'} />
            <Row label="Onboarded" value={new Date(dealer.onboarded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} />
          </CardContent>
        </Card>
      )}

      {dealer && (
        <Card>
          <CardContent className="pt-4 flex flex-col gap-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Commercial terms</p>
            <Row label="Credit limit" value={dealer.credit_limit != null ? `₹${Number(dealer.credit_limit).toLocaleString('en-IN')}` : '—'} />
            <Row label="Credit period" value={`${dealer.credit_period_days} days`} />
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground italic">
        To update your profile or change your password, contact Vyara&apos;s sales team.
      </p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  )
}
