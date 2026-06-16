'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

export default function DealerPortalErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('Dealer portal error', error) }, [error])
  return (
    <div className="p-6 max-w-md mx-auto flex flex-col gap-3 items-start">
      <AlertCircle className="size-6 text-destructive" />
      <h2 className="font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground">
        {error.message || 'We hit an unexpected error loading this page. Try again, or contact Vyara&apos;s sales team if it persists.'}
      </p>
      <Button onClick={reset} size="sm">Try again</Button>
    </div>
  )
}
