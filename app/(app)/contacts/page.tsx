import { createClient } from '@/lib/supabase/server'
import { ContactsClient } from './contacts-client'

export default async function ContactsPage() {
  const supabase = await createClient()

  const [{ data: contacts }, { data: firms }] = await Promise.all([
    supabase
      .from('contact')
      .select('id, full_name, role_title, phone, email, city, firm:firm_id(name)')
      .is('deleted_at', null)
      .order('full_name'),
    supabase
      .from('firm')
      .select('id, name, type')
      .is('deleted_at', null)
      .order('name'),
  ])

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-5xl">
      <ContactsClient
        contacts={(contacts ?? []) as unknown as {
          id: string
          full_name: string
          role_title: string | null
          phone: string | null
          email: string | null
          city: string | null
          firm: { name: string } | null
        }[]}
        firms={(firms ?? []) as { id: string; name: string; type: string }[]}
      />
    </div>
  )
}
