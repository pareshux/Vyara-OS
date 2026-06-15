import { Skeleton } from '@/components/ui/skeleton'

export default function TasksLoading() {
  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-4xl">
      <Skeleton className="h-7 w-24" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-14 rounded-xl" />
      ))}
    </div>
  )
}
