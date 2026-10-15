export default function OrderDetailLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading order">
      <div className="space-y-2">
        <div className="skeleton h-3 w-16" />
        <div className="skeleton h-7 w-56" />
        <div className="skeleton h-4 w-72" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className="skeleton h-64 w-full rounded-xl" />
          <div className="skeleton h-48 w-full rounded-xl" />
          <div className="skeleton h-72 w-full rounded-xl" />
        </div>
        <div className="space-y-6">
          <div className="skeleton h-72 w-full rounded-xl" />
          <div className="skeleton h-56 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
