'use client'

/**
 * Period selector — drives the `period` URL param on the Owner Dashboard.
 * Slice 1 supports today / week / month / quarter / year. Custom range
 * comes in a later slice when the date-range picker primitive lands.
 */
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const OPTIONS = [
  { value: 'today',   label: 'Today' },
  { value: 'week',    label: 'Week' },
  { value: 'month',   label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year',    label: 'Year' },
] as const

type Period = (typeof OPTIONS)[number]['value']

export function PeriodSelector({ value }: { value: Period }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function setPeriod(next: Period) {
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'month') params.delete('period')  // default; cleaner URL
    else params.set('period', next)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-surface-muted p-0.5 text-xs">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setPeriod(opt.value)}
          className={cn(
            'px-3 py-1.5 rounded-md font-medium transition-colors',
            value === opt.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          aria-pressed={value === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
