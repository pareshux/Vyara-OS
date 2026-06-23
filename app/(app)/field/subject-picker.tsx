'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search } from 'lucide-react'
import { searchVisitSubjects, type SubjectSearchHit } from '@/lib/actions/field-visits'

const TINT: Record<SubjectSearchHit['type'], string> = {
  project: 'bg-blue-50 text-blue-700',
  lead: 'bg-violet-50 text-violet-700',
  firm: 'bg-amber-50 text-amber-700',
  dealer: 'bg-emerald-50 text-emerald-700',
}

export function SubjectPicker({
  selected,
  onSelect,
}: {
  selected: SubjectSearchHit | null
  onSelect: (s: SubjectSearchHit | null) => void
}) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SubjectSearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)
  const debounce = useRef<NodeJS.Timeout | null>(null)

  const showDropdown = focused || query.length > 0

  useEffect(() => {
    if (!showDropdown) return
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      setLoading(true)
      const r = await searchVisitSubjects(query)
      if ('hits' in r) setHits(r.hits)
      setLoading(false)
    }, 200)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [query, showDropdown])

  if (selected) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] uppercase border-0 ${TINT[selected.type]}`}>
            {selected.type}
          </Badge>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{selected.label}</p>
            {selected.sublabel && (
              <p className="text-[11px] text-muted-foreground truncate">{selected.sublabel}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Change
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Search project, lead, firm, dealer…"
          className="h-10 pl-8"
        />
      </div>
      {showDropdown && (
        <div className="max-h-52 overflow-y-auto rounded-lg border border-border bg-card divide-y divide-border">
          {loading && hits.length === 0 ? (
            <p className="text-xs text-muted-foreground italic px-3 py-3">Searching…</p>
          ) : hits.length === 0 ? (
            <p className="text-xs text-muted-foreground italic px-3 py-3">No matches.</p>
          ) : (
            hits.map((h) => (
              <button
                key={`${h.type}-${h.id}`}
                type="button"
                onClick={() => onSelect(h)}
                className="w-full text-left px-3 py-2.5 hover:bg-muted/40"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-[10px] uppercase border-0 ${TINT[h.type]}`}>
                    {h.type}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{h.label}</p>
                    {h.sublabel && (
                      <p className="text-[11px] text-muted-foreground truncate">{h.sublabel}</p>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
