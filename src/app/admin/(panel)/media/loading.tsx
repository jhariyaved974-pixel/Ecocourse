export default function MediaLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-7 w-56" />
      <div className="skeleton h-4 w-80" />
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="hidden space-y-2 lg:block">
          <div className="skeleton h-8 w-full rounded-lg" />
          <div className="skeleton h-8 w-full rounded-lg" />
          <div className="skeleton h-8 w-3/4 rounded-lg" />
        </div>
        <div className="space-y-4">
          <div className="skeleton h-28 w-full rounded-xl" />
          <div className="flex gap-2">
            <div className="skeleton h-9 w-72 rounded-full" />
            <div className="skeleton h-9 w-32 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="skeleton aspect-[4/5] rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
