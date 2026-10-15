export default function PaymentsQueueLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading payments">
      <div className="skeleton h-7 w-48" />
      <div className="skeleton h-4 w-96 max-w-full" />
      <div className="skeleton mt-6 h-10 w-full rounded-lg" />
      <div className="skeleton h-9 w-72 rounded-full" />
      <div className="skeleton h-80 w-full rounded-xl" />
    </div>
  );
}
