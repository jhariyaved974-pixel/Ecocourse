export default function AdminLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-7 w-56" />
      <div className="skeleton h-4 w-80" />
      <div className="skeleton mt-6 h-72 w-full rounded-xl" />
    </div>
  );
}
