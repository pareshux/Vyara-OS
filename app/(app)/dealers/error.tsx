'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

export default function DealersErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('Dealers error', error) }, [error])
  return (
    <div className="p-6 max-w-md mx-auto flex flex-col gap-3 items-start">
      <AlertCircle className="size-6 text-destructive" />
      <h2 className="font-semibold">Couldn&apos;t load dealers</h2>
      <p className="text-sm text-muted-foreground">
        {error.message || 'An unexpected error occurred.'}
      </p>
      <Button onClick={reset} size="sm">Try again</Button>
    </div>
  )
}
