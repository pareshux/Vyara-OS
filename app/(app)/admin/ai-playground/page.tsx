import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronRight, Sparkles } from 'lucide-react'
import { PlaygroundClient } from './playground-client'

export const dynamic = 'force-dynamic'

export default async function AIPlaygroundPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'admin' && profile.role !== 'manager')) {
    redirect('/dashboard')
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-4xl">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/admin" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">AI playground</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="size-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">AI playground</h1>
          <p className="text-sm text-muted-foreground">
            Validates the Stage 0 plumbing. Upload an image → Claude extracts visible label/value pairs.
            Per-surface schemas land in Stage 1.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <PlaygroundClient tenantId={profile.tenant_id} />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground italic">
        Every extraction is logged to <span className="font-mono">ai_extraction</span> with token usage and latency.
        Cost runs ~$0.01 per photo at current rates.
      </p>
    </div>
  )
}
