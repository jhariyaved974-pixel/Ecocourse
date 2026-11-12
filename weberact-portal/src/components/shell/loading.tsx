import { Skeleton } from '@/components/ui/primitives';
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-3 h-3 w-24" />
      <Skeleton className="mb-10 h-9 w-72" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[118px] rounded-[18px]" />)}</div>
      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-[320px] rounded-[18px] xl:col-span-2" />
        <Skeleton className="h-[320px] rounded-[18px]" />
      </div>
    </div>
  );
}
