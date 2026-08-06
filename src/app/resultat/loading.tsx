export default function ResultsLoading() {
  return (
    <div className="page-shell py-16" role="status" aria-live="polite">
      <div className="mx-auto max-w-3xl animate-pulse space-y-5">
        <div className="h-5 w-40 rounded bg-ink/10" />
        <div className="h-14 w-3/4 rounded bg-ink/10" />
        <div className="card h-80 bg-white/60" />
        <p className="text-sm text-ink/60">Jämför historiska avgångar…</p>
      </div>
    </div>
  );
}
