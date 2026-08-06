interface ReliabilityBarProps {
  label: string;
  probability: number;
  recommended?: boolean;
}

export function ReliabilityBar({ label, probability, recommended = false }: ReliabilityBarProps) {
  const percentage = Math.round(probability * 100);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4 text-sm">
        <span className={recommended ? "font-black" : "font-semibold"}>{label}</span>
        <span className="tabular-nums font-black">{percentage} %</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-ink/10" role="img" aria-label={`${label}: ${percentage} procents sannolikhet`}>
        <div
          className={`h-full rounded-full ${recommended ? "bg-pine" : percentage >= 90 ? "bg-emerald-500" : percentage >= 70 ? "bg-sun" : "bg-coral"}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
