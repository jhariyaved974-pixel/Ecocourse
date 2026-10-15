/** Loading state for catalogue admin screens (used by the segments' loading.tsx). */
export function CatalogPageSkeleton({ variant = 'table' }: { variant?: 'table' | 'form' }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-7 w-56" />
      <div className="skeleton h-4 w-80" />
      {variant === 'table' ? (
        <>
          <div className="mt-6 flex gap-2">
            <div className="skeleton h-9 w-72 rounded-full" />
            <div className="skeleton h-9 w-32 rounded-full" />
            <div className="skeleton h-9 w-32 rounded-full" />
          </div>
          <div className="skeleton h-96 w-full rounded-xl" />
        </>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <div className="skeleton h-72 w-full rounded-xl" />
            <div className="skeleton h-56 w-full rounded-xl" />
          </div>
          <div className="skeleton h-80 w-full rounded-xl" />
        </div>
      )}
    </div>
  );
}
