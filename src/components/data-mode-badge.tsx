import type { DataSourceKind } from "@/domain/transport";

export function DataModeBadge({ mode }: { mode: DataSourceKind }) {
  const isMock = mode === "mock";
  const label =
    mode === "mock"
      ? "Syntetisk demonstrationsdata"
      : mode === "trafiklab"
        ? "Trafiklab-data"
        : mode === "trafikverket"
          ? "Trafikverkets järnvägsdata"
          : "Trafiklab + Trafikverket";
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
        isMock ? "bg-sun/25 text-ink" : "bg-mint text-pine"
      }`}
    >
      <span className={`size-2 rounded-full ${isMock ? "bg-sun" : "bg-pine"}`} aria-hidden="true" />
      {label}
    </div>
  );
}
