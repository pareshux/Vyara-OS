import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="p-6 flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-xl" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-6 w-72" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ))}
    </div>
  )
}
