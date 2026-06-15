import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Mail, Shield } from 'lucide-react'
import { signOut } from './actions'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  sales_engineer: 'Sales Engineer',
}

export default async function ProfilePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('full_name, role, tenant_id')
    .eq('id', user.id)
    .single()

  const initials = (profile?.full_name ?? user.email ?? 'U')
    .split(' ')
    .map((w: string) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('')

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-lg">
      <h1 className="text-lg font-semibold text-foreground">My Profile</h1>

      <Card>
        <CardContent className="pt-4 flex flex-col gap-4">
          {/* Avatar + name row */}
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-lg select-none">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground truncate">
                {profile?.full_name ?? '—'}
              </p>
              <p className="text-sm text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>

          {/* Details */}
          <div className="flex flex-col gap-2.5 text-sm border-t border-border pt-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Shield className="size-4 shrink-0" />
              <span className="shrink-0">Role:</span>
              <Badge variant="secondary" className="text-xs ml-1 capitalize">
                {ROLE_LABELS[profile?.role ?? ''] ?? profile?.role ?? '—'}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="size-4 shrink-0" />
              <span className="truncate">{user.email}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sign out */}
      <form action={signOut}>
        <Button
          type="submit"
          variant="outline"
          className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
        >
          Sign out
        </Button>
      </form>
    </div>
  )
}
