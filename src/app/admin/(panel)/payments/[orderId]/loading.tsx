export default function PaymentReviewLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading payment review">
      <div className="space-y-2">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-7 w-72" />
        <div className="skeleton h-4 w-56" />
      </div>
      <div className="skeleton h-16 w-full rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <div className="skeleton h-80 w-full rounded-xl" />
          <div className="skeleton h-48 w-full rounded-xl" />
        </div>
        <div className="space-y-6">
          <div className="skeleton h-48 w-full rounded-xl" />
          <div className="skeleton h-96 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
