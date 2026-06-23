import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-2xl">
      {/* Greeting */}
      <div className="flex flex-col gap-1">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-32" />
      </div>

      {/* Check-in card */}
      <Skeleton className="h-28 rounded-xl" />

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-18 rounded-xl" />
        ))}
      </div>

      {/* Visits section */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-24" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
