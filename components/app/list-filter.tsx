'use client'

import { Suspense, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface SelectFilterConfig {
  key: string
  /** Label shown on the active chip (e.g. "Stage") */
  label: string
  /** Placeholder text in the dropdown (e.g. "All stages") */
  placeholder?: string
  options: { value: string; label: string; color?: string }[]
}

interface ListFilterProps {
  searchKey?: string
  searchPlaceholder?: string
  selects?: SelectFilterConfig[]
  /**
   * URL params that should be preserved untouched when filters change or
   * are cleared (e.g. ['view'] for the leads list/pipeline toggle).
   */
  keepParams?: string[]
  className?: string
}

// ── Inner component (uses useSearchParams) ────────────────────────────────────

function ListFilterInner({
  searchKey = 'q',
  searchPlaceholder = 'Search…',
  selects = [],
  keepParams = [],
  className,
}: ListFilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [searchInput, setSearchInput] = useState(() => searchParams.get(searchKey) ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Prevent a stale server re-render from resetting a mid-flight typed value
  const isDirtyRef = useRef(false)

  useEffect(() => {
    if (!isDirtyRef.current) {
      setSearchInput(searchParams.get(searchKey) ?? '')
    }
  }, [searchParams, searchKey])

  function buildUrl(overrides: Record<string, string | null>): string {
    const params = new URLSearchParams()
    // Preserve designated non-filter params
    for (const k of keepParams) {
      const v = searchParams.get(k)
      if (v) params.set(k, v)
    }
    // Carry forward current filter values
    if (searchParams.get(searchKey)) params.set(searchKey, searchParams.get(searchKey)!)
    for (const s of selects) {
      const v = searchParams.get(s.key)
      if (v) params.set(s.key, v)
    }
    // Apply overrides (null = delete)
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null) params.delete(k)
      else params.set(k, v)
    }
    const qs = params.toString()
    return `${pathname}${qs ? `?${qs}` : ''}`
  }

  function navigate(overrides: Record<string, string | null>) {
    startTransition(() => {
      router.replace(buildUrl(overrides), { scroll: false })
    })
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setSearchInput(v)
    isDirtyRef.current = true
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      isDirtyRef.current = false
      navigate({ [searchKey]: v || null })
    }, 300)
  }

  function clearSearch() {
    setSearchInput('')
    isDirtyRef.current = false
    clearTimeout(debounceRef.current)
    navigate({ [searchKey]: null })
  }

  function handleSelectChange(key: string, value: string) {
    navigate({ [key]: value === '__all__' ? null : value })
  }

  function clearAll() {
    setSearchInput('')
    isDirtyRef.current = false
    clearTimeout(debounceRef.current)
    const params = new URLSearchParams()
    for (const k of keepParams) {
      const v = searchParams.get(k)
      if (v) params.set(k, v)
    }
    const qs = params.toString()
    startTransition(() => {
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
    })
  }

  // Active chips — one per non-empty filter
  type Chip = { key: string; label: string; valueLabel: string }
  const chips: Chip[] = []
  const searchVal = searchParams.get(searchKey)
  if (searchVal) chips.push({ key: searchKey, label: 'Search', valueLabel: searchVal })
  for (const s of selects) {
    const v = searchParams.get(s.key)
    if (v) {
      const opt = s.options.find((o) => o.value === v)
      chips.push({ key: s.key, label: s.label, valueLabel: opt?.label ?? v })
    }
  }
  const hasFilters = chips.length > 0

  return (
    <div className={className}>
      {/* Filter row */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search input */}
        <div className="relative flex-1 min-w-40">
          <Search className="size-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={searchInput}
            onChange={handleSearchChange}
            placeholder={searchPlaceholder}
            className="pl-8 h-8 text-sm"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Dropdown selects */}
        {selects.map((s) => {
          const currentVal = searchParams.get(s.key) ?? '__all__'
          return (
            <Select
              key={s.key}
              value={currentVal}
              onValueChange={(v) => handleSelectChange(s.key, v)}
            >
              <SelectTrigger className="h-8 text-sm w-auto min-w-32 max-w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">
                  {s.placeholder ?? `All ${s.label.toLowerCase()}s`}
                </SelectItem>
                {s.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    <span className="flex items-center gap-1.5">
                      {o.color && (
                        <span
                          className="inline-block size-2 rounded-full shrink-0"
                          style={{ backgroundColor: o.color }}
                        />
                      )}
                      {o.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        })}

        {/* Clear all */}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1 px-2"
          >
            <X className="size-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Active filter chips */}
      {hasFilters && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {chips.map((chip) => (
            <Badge
              key={chip.key}
              variant="secondary"
              className="text-xs gap-1 pr-1 font-normal h-5"
            >
              <span className="text-muted-foreground">{chip.label}:</span>
              <span className="font-medium">{chip.valueLabel}</span>
              <button
                type="button"
                onClick={() => {
                  if (chip.key === searchKey) {
                    setSearchInput('')
                    isDirtyRef.current = false
                    clearTimeout(debounceRef.current)
                  }
                  navigate({ [chip.key]: null })
                }}
                className="ml-0.5 rounded-sm hover:bg-foreground/10 p-0.5 transition-colors"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Skeleton fallback ─────────────────────────────────────────────────────────

function ListFilterSkeleton({ selectCount = 0 }: { selectCount?: number }) {
  return (
    <div className="flex gap-2 items-center">
      <div className="h-8 flex-1 min-w-40 rounded-md bg-muted animate-pulse" />
      {Array.from({ length: selectCount }).map((_, i) => (
        <div key={i} className="h-8 w-32 rounded-md bg-muted animate-pulse" />
      ))}
    </div>
  )
}

// ── Public export (wraps inner in Suspense) ───────────────────────────────────

export function ListFilter(props: ListFilterProps) {
  return (
    <Suspense fallback={<ListFilterSkeleton selectCount={props.selects?.length ?? 0} />}>
      <ListFilterInner {...props} />
    </Suspense>
  )
}
