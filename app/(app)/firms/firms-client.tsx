'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Building2, Search, Phone, MapPin, Hash, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type FirmRow = {
  id: string
  name: string
  type_code: string
  type_label: string
  city: string | null
  state: string
  phone: string | null
  gstin: string | null
}

export type RelationshipTypeOption = {
  code: string
  label: string
}

interface Props {
  firms: FirmRow[]
  types: RelationshipTypeOption[]
}

const ALL_TYPES = '__all__'

export function FirmsClient({ firms, types }: Props) {
  const [typeCode, setTypeCode] = useState<string>(ALL_TYPES)
  const [query, setQuery] = useState<string>('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return firms.filter((f) => {
      if (typeCode !== ALL_TYPES && f.type_code !== typeCode) return false
      if (!q) return true
      return (
        f.name.toLowerCase().includes(q) ||
        (f.city?.toLowerCase().includes(q) ?? false) ||
        (f.phone?.toLowerCase().includes(q) ?? false) ||
        (f.gstin?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [firms, typeCode, query])

  // Count per type for the dropdown label hint (helps users see what they
  // have without opening the dropdown).
  const countByType = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of firms) m.set(f.type_code, (m.get(f.type_code) ?? 0) + 1)
    return m
  }, [firms])

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-foreground">Firms</h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          {firms.length} {firms.length === 1 ? 'firm' : 'firms'} across all relationship types
        </p>
      </div>

      {/* Filter + search bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={typeCode} onValueChange={setTypeCode}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="All relationship types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TYPES}>
              All types
              <span className="ml-2 tabular-nums text-muted-foreground">
                ({firms.length})
              </span>
            </SelectItem>
            {types.map((t) => {
              const count = countByType.get(t.code) ?? 0
              if (count === 0) return null
              return (
                <SelectItem key={t.code} value={t.code}>
                  {t.label}
                  <span className="ml-2 tabular-nums text-muted-foreground">
                    ({count})
                  </span>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            placeholder="Search by name, city, phone, GSTIN…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Results */}
      {firms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <Building2 className="size-8 mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No firms yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Firms are created from leads, projects, contacts, or the business-card scanner.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <Search className="size-7 mb-3 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No matches</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a different relationship type or clear the search.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground sm:table-cell">Type</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground md:table-cell">City</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground md:table-cell">Phone</th>
                <th className="hidden px-4 py-2.5 text-left font-medium text-muted-foreground lg:table-cell">GSTIN</th>
                <th className="px-4 py-2.5 text-right w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr
                  key={f.id}
                  className="group border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/customers/${f.id}`}
                      className="font-medium text-foreground hover:text-primary inline-flex items-center gap-1.5"
                    >
                      <Building2 className="size-3.5 text-muted-foreground shrink-0" />
                      {f.name}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <Badge variant="outline" className="text-xs">
                      {f.type_label}
                    </Badge>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                    {f.city ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" />
                        {f.city}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground tabular-nums md:table-cell">
                    {f.phone ? (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3" />
                        {f.phone}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground font-mono text-xs tabular-nums lg:table-cell">
                    {f.gstin ? (
                      <span className="inline-flex items-center gap-1">
                        <Hash className="size-3" />
                        {f.gstin}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight className="size-4 text-muted-foreground/40 group-hover:text-muted-foreground inline-block" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(typeCode !== ALL_TYPES || query) && (
            <div className="border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground tabular-nums">
              Showing {filtered.length} of {firms.length}
            </div>
          )}
        </div>
      )}
    </>
  )
}
