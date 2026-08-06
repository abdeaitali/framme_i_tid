export default function CommuteLoading() {
  return (
    <div className="page-shell py-16" role="status">
      <div className="animate-pulse space-y-6">
        <div className="h-10 w-64 rounded bg-ink/10" />
        <div className="card h-72 bg-white/60" />
      </div>
      <span className="sr-only">Beräknar veckosammanfattning…</span>
    </div>
  );
}
