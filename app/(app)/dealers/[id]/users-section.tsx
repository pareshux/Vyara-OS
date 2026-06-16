'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { UserPlus, Send, Copy, XCircle, RotateCcw } from 'lucide-react'
import { inviteDealerUser, revokeDealerUser, reactivateDealerUser } from '@/lib/actions/dealers'

interface DealerUser {
  id: string
  auth_user_id: string
  is_active: boolean
  invited_at: string
  accepted_at: string | null
  revoked_at: string | null
  revoke_reason: string | null
  full_name: string
}

export function UsersSection({ dealerId, users }: { dealerId: string; users: DealerUser[] }) {
  const router = useRouter()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [magicLink, setMagicLink] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const [revokeOpen, setRevokeOpen] = useState<DealerUser | null>(null)
  const [revokeReason, setRevokeReason] = useState('')

  function submitInvite() {
    setErr(null); setMagicLink(null)
    if (!email.trim() || !fullName.trim()) { setErr('Email and name required'); return }
    startTransition(async () => {
      const res = await inviteDealerUser({ dealer_id: dealerId, email, full_name: fullName })
      if ('error' in res) { setErr(res.error); toast.error(res.error); return }
      if (res.email_sent) {
        toast.success(`Invite sent to ${email}`)
        setEmail(''); setFullName('')
        setInviteOpen(false)
        router.refresh()
      } else if (res.magic_link) {
        toast.success('User added — copy the magic link below to share')
        setMagicLink(res.magic_link)
        router.refresh()
      } else {
        toast.success('User added')
        setEmail(''); setFullName('')
        setInviteOpen(false)
        router.refresh()
      }
    })
  }

  function copyLink() {
    if (!magicLink) return
    navigator.clipboard.writeText(magicLink).then(() => toast.success('Link copied'))
  }

  function submitRevoke() {
    if (!revokeOpen) return
    if (!revokeReason.trim()) return
    startTransition(async () => {
      const res = await revokeDealerUser(revokeOpen.id, revokeReason.trim())
      if ('error' in res) toast.error(res.error)
      else {
        toast.success('User access revoked')
        setRevokeOpen(null); setRevokeReason('')
        router.refresh()
      }
    })
  }

  function doReactivate(u: DealerUser) {
    startTransition(async () => {
      const res = await reactivateDealerUser(u.id)
      if ('error' in res) toast.error(res.error)
      else { toast.success('Access re-activated'); router.refresh() }
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">Portal users ({users.filter((u) => u.is_active).length} active)</h2>
        <Button size="sm" onClick={() => { setMagicLink(null); setInviteOpen(true) }}>
          <UserPlus className="size-3.5 mr-1.5" /> Invite user
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {users.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No portal users yet. Invite the dealer&apos;s first user so they can self-serve.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {users.map((u) => (
              <li key={u.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-foreground truncate">{u.full_name}</p>
                    {u.is_active ? (
                      u.accepted_at ? (
                        <Badge variant="outline" className="text-[10px] uppercase border-0 bg-emerald-50 text-emerald-700">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] uppercase border-0 bg-amber-50 text-amber-700">Pending</Badge>
                      )
                    ) : (
                      <Badge variant="destructive" className="text-[10px] uppercase">Revoked</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Invited {new Date(u.invited_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {u.accepted_at && <> · Accepted {new Date(u.accepted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>}
                  </p>
                  {u.revoke_reason && (
                    <p className="text-xs text-muted-foreground italic mt-0.5">Revoked: {u.revoke_reason}</p>
                  )}
                </div>
                {u.is_active ? (
                  <Button size="sm" variant="ghost" onClick={() => setRevokeOpen(u)} className="text-destructive hover:text-destructive">
                    <XCircle className="size-3.5 mr-1" /> Revoke
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => doReactivate(u)} disabled={busy}>
                    <RotateCcw className="size-3.5 mr-1" /> Re-activate
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite dealer user</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="iemail">Email</Label>
              <Input id="iemail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="dealer@example.com" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="iname">Full name</Label>
              <Input id="iname" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Person's name" />
            </div>
            <p className="text-xs text-muted-foreground">
              An invite email with a magic link will be sent. If email isn&apos;t configured in this Supabase project, the link will be shown here so you can copy it.
            </p>
            {magicLink && (
              <div className="rounded-md border border-border bg-muted/50 p-3 flex flex-col gap-2">
                <p className="text-xs font-medium">Magic link (share with the dealer):</p>
                <pre className="font-mono text-[10px] break-all overflow-x-auto">{magicLink}</pre>
                <Button size="sm" variant="outline" onClick={copyLink}>
                  <Copy className="size-3.5 mr-1.5" /> Copy link
                </Button>
              </div>
            )}
            {err && <p className="text-xs text-destructive">{err}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setInviteOpen(false)} disabled={busy}>Close</Button>
              {!magicLink && (
                <Button onClick={submitInvite} disabled={busy || !email.trim() || !fullName.trim()}>
                  <Send className="size-3.5 mr-1.5" /> {busy ? 'Inviting…' : 'Send invite'}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Revoke dialog */}
      <Dialog open={!!revokeOpen} onOpenChange={(v) => { if (!v) { setRevokeOpen(null); setRevokeReason('') } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Revoke portal access</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {revokeOpen?.full_name} will no longer be able to log in. Their dealer link is preserved for audit.
            </p>
            <Textarea
              rows={3}
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="Reason (required)"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => { setRevokeOpen(null); setRevokeReason('') }} disabled={busy}>Cancel</Button>
              <Button variant="destructive" onClick={submitRevoke} disabled={busy || !revokeReason.trim()}>
                {busy ? 'Revoking…' : 'Revoke access'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
