'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createLead } from '@/lib/actions/leads'

const NONE = '__none__'

const SEGMENTS = [
  { value: 'architect',  label: 'Architect-specified' },
  { value: 'dealer',     label: 'Dealer' },
  { value: 'tender',     label: 'Tender' },
  { value: 'retail',     label: 'Retail / Direct buyer' },
  { value: 'government', label: 'Government' },
  { value: 'corporate',  label: 'Corporate' },
  { value: 'generic',    label: 'Other' },
] as const

export type LeadAIPrefill = {
  // Pre-resolved IDs (if matched)
  buyer_firm_id: string | null
  // Raw text fields (free-form prefill of the contact section)
  segment: typeof SEGMENTS[number]['value'] | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  city: string | null
  notes: string | null
  // Audit / telemetry
  extraction_id: string
  avg_confidence: number | null
  original_values: Record<string, unknown>
}

export function NewLeadForm({
  sources, owners, firms, contacts: _contacts, defaultOwnerId, aiPrefill,
}: {
  sources: { id: string; code: string; label: string }[]
  owners: { id: string; full_name: string; role: string }[]
  firms: { id: string; name: string; type: string }[]
  contacts: { id: string; full_name: string; firm_id: string | null }[]
  defaultOwnerId: string
  aiPrefill?: LeadAIPrefill | null
}) {
  void _contacts
  const router = useRouter()
  const [title, setTitle] = useState(() => {
    // Build a sensible default title from AI prefill
    if (aiPrefill?.contact_name) return `${aiPrefill.contact_name} — initial enquiry`
    return ''
  })
  const [segment, setSegment] = useState<typeof SEGMENTS[number]['value']>(
    aiPrefill?.segment ?? 'architect'
  )
  const [sourceId, setSourceId] = useState<string>(NONE)
  const [ownerId, setOwnerId] = useState<string>(defaultOwnerId)
  const [buyerFirmId, setBuyerFirmId] = useState<string>(aiPrefill?.buyer_firm_id ?? NONE)
  const [contactName, setContactName] = useState(aiPrefill?.contact_name ?? '')
  const [contactPhone, setContactPhone] = useState(aiPrefill?.contact_phone ?? '')
  const [contactEmail, setContactEmail] = useState(aiPrefill?.contact_email ?? '')
  const [city, setCity] = useState(aiPrefill?.city ?? '')
  const [territory, setTerritory] = useState('Surat North')
  const [estValue, setEstValue] = useState<number | ''>('')
  const [expectedCloseAt, setExpectedCloseAt] = useState('')
  const [notes, setNotes] = useState(aiPrefill?.notes ?? '')
  const [busy, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!title.trim()) { setErr('Title is required'); return }
    startTransition(async () => {
      const res = await createLead({
        title: title.trim(),
        segment,
        source_id: sourceId === NONE ? undefined : sourceId,
        owner_id: ownerId,
        buyer_firm_id: buyerFirmId === NONE ? undefined : buyerFirmId,
        contact_name_raw: contactName.trim() || undefined,
        contact_phone_raw: contactPhone.trim() || undefined,
        contact_email_raw: contactEmail.trim() || undefined,
        city: city.trim() || undefined,
        territory: territory.trim() || undefined,
        estimated_value: typeof estValue === 'number' ? estValue : undefined,
        expected_close_at: expectedCloseAt || undefined,
        notes: notes.trim() || undefined,
      })
      if ('error' in res) {
        setErr(res.error)
        toast.error(res.error)
        return
      }
      toast.success(`Lead ${res.lead_number} captured`)
      router.push(`/leads/${res.id}`)
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Vasundhara Township paving"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Segment</Label>
          <Select value={segment} onValueChange={(v) => setSegment(v as typeof segment)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SEGMENTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Source</Label>
          <Select value={sourceId} onValueChange={setSourceId}>
            <SelectTrigger><SelectValue placeholder="Pick source…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>—</SelectItem>
              {sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Owner *</Label>
          <Select value={ownerId} onValueChange={setOwnerId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {owners.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.full_name}
                  <span className="text-xs text-muted-foreground ml-1">· {o.role}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Buyer firm</Label>
          <Select value={buyerFirmId} onValueChange={setBuyerFirmId}>
            <SelectTrigger><SelectValue placeholder="Optional…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— Unknown / Walk-in —</SelectItem>
              {firms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/20 p-3 flex flex-col gap-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Contact</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cn">Contact name</Label>
            <Input id="cn" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Mr. Patel, Site Engineer" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cp">Phone</Label>
            <Input id="cp" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+91-98XXX-XXXXX" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ce">Email</Label>
          <Input id="ce" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="city">City</Label>
          <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Surat" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="terr">Territory</Label>
          <Input id="terr" value={territory} onChange={(e) => setTerritory(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="close">Expected close</Label>
          <Input id="close" type="date" value={expectedCloseAt} onChange={(e) => setExpectedCloseAt(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="value">Estimated project value (₹)</Label>
        <Input
          id="value"
          type="number"
          min={0}
          step="1000"
          value={estValue}
          onChange={(e) => {
            const v = e.target.value
            setEstValue(v === '' ? '' : Number(v))
          }}
          placeholder="e.g. 1500000"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything that'll help the owner pick this up — quantity, finish, decision-maker, urgency…"
        />
      </div>

      {err && <p className="text-xs text-destructive">{err}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Capturing…' : 'Capture lead'}</Button>
      </div>
    </form>
  )
}
