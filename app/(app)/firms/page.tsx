/**
 * /firms — list of every organisation in the tenant (Blueprint REL-009 Slice 1.5).
 *
 * Filtering is server-side (URL params). FirmsClient is a thin wrapper for the
 * ListFilter component + table rendering only (no filter state).
 */
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FirmsClient, type FirmRow, type RelationshipTypeOption } from './firms-client'

export const dynamic = 'force-dynamic'

export default async function FirmsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const typeFilter = sp.type ?? null

  const [{ data: allFirmRows }, { data: typeRows }] = await Promise.all([
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

  const allFirms: FirmRow[] = ((allFirmRows ?? []) as unknown as RawRow[]).map((f) => {
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

  // Filter in-memory (firms are bounded; avoids complex ilike OR on joined column)
  let firms = allFirms
  if (typeFilter) {
    firms = firms.filter((f) => f.type_code === typeFilter)
  }
  if (q) {
    const needle = q.toLowerCase()
    firms = firms.filter(
      (f) =>
        f.name.toLowerCase().includes(needle) ||
        (f.city?.toLowerCase().includes(needle) ?? false) ||
        (f.phone?.toLowerCase().includes(needle) ?? false) ||
        (f.gstin?.toLowerCase().includes(needle) ?? false)
    )
  }

  // Count per type for the dropdown option labels
  const countByType = new Map<string, number>()
  for (const f of allFirms) countByType.set(f.type_code, (countByType.get(f.type_code) ?? 0) + 1)

  const types: RelationshipTypeOption[] = (typeRows ?? [])
    .filter((t) => countByType.has(t.code as string))
    .map((t) => ({
      code: t.code as string,
      label: `${t.label} (${countByType.get(t.code as string) ?? 0})`,
    }))

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl">
      <FirmsClient
        firms={firms}
        types={types}
        totalCount={allFirms.length}
      />
    </div>
  )
}

function titleCase(snake: string): string {
  return snake
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
