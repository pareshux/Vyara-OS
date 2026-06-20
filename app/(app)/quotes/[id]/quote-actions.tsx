'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { updateQuotationStatus } from '@/lib/actions/quotations'

interface Contact {
  id: string
  full_name: string
  role_title: string | null
  firm: { name: string } | null
}

interface QuoteActionsProps {
  quoteId: string
  canSend: boolean
  canMarkWon: boolean
  canMarkLost: boolean
  contacts: Contact[]
}

export function QuoteActions({ quoteId, canSend, canMarkWon, canMarkLost, contacts }: QuoteActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [markSentOpen, setMarkSentOpen] = useState(false)
  const [sentToContactId, setSentToContactId] = useState('')

  function confirmMarkSent() {
    startTransition(async () => {
      const result = await updateQuotationStatus(quoteId, 'sent', {
        sent_to_contact_id: sentToContactId || undefined,
      })
      if ('error' in result) { toast.error(result.error); return }
      toast.success('Quote marked as Sent')
      setMarkSentOpen(false)
      setSentToContactId('')
      router.refresh()
    })
  }

  function handleStatus(status: 'won' | 'lost') {
    startTransition(async () => {
      const result = await updateQuotationStatus(quoteId, status)
      if ('error' in result) { toast.error(result.error); return }
      toast.success(`Quote marked as ${status === 'won' ? 'Won' : 'Lost'}`)
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {canSend && (
          <Button size="sm" onClick={() => setMarkSentOpen(true)} disabled={isPending}>
            Mark as Sent
          </Button>
        )}
        {canMarkWon && (
          <Button
            size="sm"
            variant="outline"
            className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
            disabled={isPending}
            onClick={() => handleStatus('won')}
          >
            Mark as Won
          </Button>
        )}
        {canMarkLost && (
          <Button
            size="sm"
            variant="outline"
            className="text-destructive border-destructive/30 hover:bg-destructive/5"
            disabled={isPending}
            onClick={() => handleStatus('lost')}
          >
            Mark as Lost
          </Button>
        )}
      </div>

      <Dialog open={markSentOpen} onOpenChange={setMarkSentOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark as Sent</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <p className="text-sm text-muted-foreground">
              This quote will be marked as sent. Optionally record who it was sent to.
            </p>
            {contacts.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>Sent to (optional)</Label>
                <Select value={sentToContactId} onValueChange={setSentToContactId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select contact…" />
                  </SelectTrigger>
                  <SelectContent>
                    {contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span>{c.full_name}</span>
                        {(c.role_title || c.firm) && (
                          <span className="text-xs text-muted-foreground ml-2">
                            {[c.role_title, c.firm?.name].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkSentOpen(false)}>Cancel</Button>
            <Button onClick={confirmMarkSent} disabled={isPending}>
              {isPending ? 'Saving…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
