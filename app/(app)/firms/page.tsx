/**
 * /firms — list of every organisation in the tenant (Blueprint REL-009 Slice 1.5).
 *
 * Single discovery surface for every firm regardless of relationship type
 * (architect, contractor, customer, distributor, …). Clicking a row lands
 * on Customer 360 (/customers/[firmId]).
 *
 * Dealers have a dedicated /dealers page because they carry extra fields
 * (tier, code, credit limit). They appear here too — filter by 'dealer' to
 * see them; click through to the same 360.
 */
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FirmsClient, type FirmRow, type RelationshipTypeOption } from './firms-client'

export const dynamic = 'force-dynamic'

export default async function FirmsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: firmRows }, { data: typeRows }] = await Promise.all([
    supabase
      .from('firm')
      .select(
        `id, name, type, city, state, phone, gstin,
         relationship_type:relationship_type_id(code, label)`
      )
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('relationship_type_master')
      .select('code, label, sort_order')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('sort_order'),
  ])

  type RawRow = {
    id: string
    name: string
    type: string
    city: string | null
    state: string
    phone: string | null
    gstin: string | null
    relationship_type: { code: string; label: string } | { code: string; label: string }[] | null
  }

  const firms: FirmRow[] = ((firmRows ?? []) as unknown as RawRow[]).map((f) => {
    const rt = Array.isArray(f.relationship_type) ? f.relationship_type[0] ?? null : f.relationship_type
    return {
      id: f.id,
      name: f.name,
      type_code: rt?.code ?? f.type,
      type_label: rt?.label ?? titleCase(f.type),
      city: f.city,
      state: f.state,
      phone: f.phone,
      gstin: f.gstin,
    }
  })

  const types: RelationshipTypeOption[] = (typeRows ?? []).map((t) => ({
    code: t.code as string,
    label: t.label as string,
  }))

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl">
      <FirmsClient firms={firms} types={types} />
    </div>
  )
}

function titleCase(snake: string): string {
  return snake
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
