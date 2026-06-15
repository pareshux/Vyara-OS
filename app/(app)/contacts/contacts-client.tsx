'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { UserPlus, Users } from 'lucide-react'
import { CreateContactSheet } from './create-contact-sheet'

interface Firm {
  id: string
  name: string
  type: string
}

interface Contact {
  id: string
  full_name: string
  role_title: string | null
  phone: string | null
  email: string | null
  city: string | null
  firm: { name: string } | null
}

interface ContactsClientProps {
  contacts: Contact[]
  firms: Firm[]
}

export function ContactsClient({ contacts, firms }: ContactsClientProps) {
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            {contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'}
          </p>
        </div>
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          <UserPlus className="size-4 mr-1.5" />
          New Contact
        </Button>
      </div>

      {contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <Users className="size-8 mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No contacts yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first architect, contractor, or buyer.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setSheetOpen(true)}>
            Add contact
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground md:table-cell">Firm</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground sm:table-cell">Role</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Phone</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground lg:table-cell">City</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-foreground">{c.full_name}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                    {c.firm?.name ?? <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                    {c.role_title ?? <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {c.phone ?? <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                    {c.city ?? <span className="text-muted-foreground/50">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateContactSheet open={sheetOpen} onOpenChange={setSheetOpen} firms={firms} />
    </>
  )
}
