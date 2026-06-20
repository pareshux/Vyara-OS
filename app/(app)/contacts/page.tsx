import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ContactsClient } from './contacts-client'

export const dynamic = 'force-dynamic'

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; firm?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const firmFilter = sp.firm ?? null

  const [{ data: allContacts }, { data: firms }] = await Promise.all([
    supabase
      .from('contact')
      .select('id, full_name, role_title, phone, email, city, firm:firm_id(id, name)')
      .is('deleted_at', null)
      .order('full_name'),
    supabase
      .from('firm')
      .select('id, name, type')
      .is('deleted_at', null)
      .order('name'),
  ])

  type Contact = {
    id: string
    full_name: string
    role_title: string | null
    phone: string | null
    email: string | null
    city: string | null
    firm: { id: string; name: string } | { id: string; name: string }[] | null
  }

  const normalized = ((allContacts ?? []) as unknown as Contact[]).map((c) => ({
    ...c,
    firm: (Array.isArray(c.firm) ? c.firm[0] : c.firm) as { id: string; name: string } | null,
  }))

  // Filter in-memory
  let contacts = normalized
  if (firmFilter) {
    contacts = contacts.filter((c) => c.firm?.id === firmFilter)
  }
  if (q) {
    const needle = q.toLowerCase()
    contacts = contacts.filter(
      (c) =>
        c.full_name.toLowerCase().includes(needle) ||
        (c.phone?.toLowerCase().includes(needle) ?? false) ||
        (c.email?.toLowerCase().includes(needle) ?? false) ||
        (c.city?.toLowerCase().includes(needle) ?? false) ||
        (c.role_title?.toLowerCase().includes(needle) ?? false)
    )
  }

  // Firm options — only firms that have at least one contact
  const firmIdsWithContacts = new Set(normalized.map((c) => c.firm?.id).filter(Boolean))
  const firmOptions = ((firms ?? []) as { id: string; name: string; type: string }[])
    .filter((f) => firmIdsWithContacts.has(f.id))
    .map((f) => ({ value: f.id, label: f.name }))

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-5xl">
      <ContactsClient
        contacts={contacts}
        firms={(firms ?? []) as { id: string; name: string; type: string }[]}
        firmOptions={firmOptions}
        totalCount={normalized.length}
      />
    </div>
  )
}
