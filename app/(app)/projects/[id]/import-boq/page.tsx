import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ImportBOQForm } from './form'

export default async function ImportBOQPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: project }, { data: products }] = await Promise.all([
    supabase
      .from('project')
      .select('id, name, segment, buyer_firm:buyer_firm_id(name)')
      .eq('id', id)
      .is('deleted_at', null)
      .single(),
    supabase
      .from('product')
      .select('id, name, sku_code, unit, base_price')
      .is('deleted_at', null)
      .order('name'),
  ])

  if (!project) notFound()

  return (
    <ImportBOQForm
      projectId={id}
      projectName={(project as unknown as { name: string }).name}
      products={(products ?? []) as { id: string; name: string; sku_code: string; unit: string; base_price: number | null }[]}
    />
  )
}
