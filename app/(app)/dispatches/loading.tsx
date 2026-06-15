import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-6xl">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-24" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-20 rounded-full" />)}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  )
}
