'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Pencil } from 'lucide-react'
import { updateDispatchNotes } from '@/lib/actions/dispatches'

export function DispatchNotes({
  dispatchId,
  initialNotes,
}: {
  dispatchId: string
  initialNotes: string | null
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialNotes ?? '')
  const [busy, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const res = await updateDispatchNotes(dispatchId, value)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success(value.trim() ? 'Note saved' : 'Note cleared')
      setEditing(false)
      router.refresh()
    })
  }

  function cancel() {
    setValue(initialNotes ?? '')
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-2">
        {initialNotes ? (
          <p className="text-sm whitespace-pre-wrap text-foreground">{initialNotes}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No notes yet. Use this for delay reasons, special instructions, or buyer requests.
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          className="self-start h-7 text-xs"
          onClick={() => setEditing(true)}
        >
          <Pencil className="size-3 mr-1.5" />
          {initialNotes ? 'Edit notes' : 'Add notes'}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        autoFocus
        placeholder="e.g. Truck delayed at toll plaza; expected to leave plant by 4pm"
      />
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={cancel} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
