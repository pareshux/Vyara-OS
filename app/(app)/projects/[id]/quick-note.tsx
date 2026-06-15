'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createNote } from '@/lib/actions/tasks'

export function QuickNote({ projectId }: { projectId: string }) {
  const [content, setContent] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return

    setError(null)
    startTransition(async () => {
      const result = await createNote({ project_id: projectId, content: content.trim() })
      if ('error' in result) {
        setError(result.error)
      } else {
        setContent('')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 border-t border-border pt-4 flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Add a note
      </p>
      <Textarea
        placeholder="Log a visit, call, or observation…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        className="resize-none"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending || !content.trim()}>
          {pending ? 'Adding…' : 'Add note'}
        </Button>
      </div>
    </form>
  )
}
