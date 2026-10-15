export default function OrdersLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading orders">
      <div className="skeleton h-7 w-40" />
      <div className="skeleton h-4 w-96 max-w-full" />
      <div className="mt-6 flex flex-wrap gap-2">
        <div className="skeleton h-9 w-80 rounded-full" />
        <div className="skeleton h-9 w-36 rounded-full" />
        <div className="skeleton h-9 w-36 rounded-full" />
      </div>
      <div className="skeleton h-96 w-full rounded-xl" />
    </div>
  );
}
