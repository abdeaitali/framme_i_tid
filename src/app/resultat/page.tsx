import type { Metadata } from "next";
import Link from "next/link";
import { DataModeBadge } from "@/components/data-mode-badge";
import { ReliabilityBar } from "@/components/reliability-bar";
import { SaveCommuteButton } from "@/components/save-commute-button";
import type { JourneyReliabilityResult } from "@/domain/reliability";
import { AppError } from "@/lib/errors";
import { stockholmDateTime, stockholmTime } from "@/lib/time";
import { journeySearchSchema } from "@/lib/validation";
import { calculateRecommendation } from "@/services/recommendation-service";
import { getStationNames } from "@/services/station-service";

export const metadata: Metadata = { title: "Din rekommendation" };
export const dynamic = "force-dynamic";

const confidenceLabel = { HIGH: "Hög", MEDIUM: "Medel", LOW: "Låg" } as const;

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl bg-cream px-4 py-4">
      <dt className="text-xs font-bold uppercase tracking-wide text-ink/55">{label}</dt>
      <dd className="mt-1 text-xl font-black tabular-nums">{value}</dd>
      {detail ? <p className="mt-1 text-xs text-ink/55">{detail}</p> : null}
    </div>
  );
}

function Alternative({ result }: { result: JourneyReliabilityResult }) {
  return (
    <article className="rounded-2xl border border-ink/10 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ink/50">Avgång</p>
          <p className="mt-1 text-2xl font-black tabular-nums">{stockholmTime(result.journey.scheduledDeparture)}</p>
          <p className="mt-1 text-sm text-ink/60">
            Framme {stockholmTime(result.journey.scheduledArrival)} · {result.journey.transferCount === 0 ? "Direkt" : `${result.journey.transferCount} byte`}
            {result.journey.operatorName ? ` · ${result.journey.operatorName}` : ""}
          </p>
        </div>
        <div className={`rounded-full px-3 py-1 text-sm font-black ${result.probability >= 0.9 ? "bg-mint text-pine" : "bg-sun/25"}`}>
          {Math.round(result.probability * 100)} %
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-ink/65">{result.explanation}</p>
    </article>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <section className="page-shell py-20">
      <div className="card mx-auto max-w-2xl p-8 text-center sm:p-12">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-coral/15 text-2xl" aria-hidden="true">!</div>
        <h1 className="mt-5 text-3xl font-black">Ingen rekommendation ännu</h1>
        <p className="mx-auto mt-3 max-w-lg leading-7 text-ink/65">{message}</p>
        <Link href="/" className="button-primary mt-7">Ändra din sökning</Link>
      </div>
    </section>
  );
}

async function loadResultData(
  values: {
    originStationId: string;
    destinationStationId: string;
    targetReliability: number;
  },
  serviceDate: Date,
  arrivalDeadline: Date,
) {
  try {
    const [recommendation, stationNames] = await Promise.all([
      calculateRecommendation({
        originStationId: values.originStationId,
        destinationStationId: values.destinationStationId,
        serviceDate,
        arrivalDeadline,
        targetReliability: values.targetReliability,
      }),
      getStationNames(values.originStationId, values.destinationStationId),
    ]);
    return { ok: true as const, recommendation, stationNames };
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : "Tjänsten kunde inte beräkna en rekommendation. Kontrollera att databasen är startad och seedad.";
    return { ok: false as const, message };
  }
}

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const parsed = journeySearchSchema.safeParse({
    originStationId: params.originStationId,
    destinationStationId: params.destinationStationId,
    travelDate: params.travelDate,
    requiredArrivalTime: params.requiredArrivalTime,
    targetReliability: params.targetReliability,
  });
  if (!parsed.success) return <ErrorState message={parsed.error.issues[0]?.message ?? "Kontrollera sökningen."} />;

  const values = parsed.data;
  const serviceDate = stockholmDateTime(values.travelDate, "12:00");
  const arrivalDeadline = stockholmDateTime(values.travelDate, values.requiredArrivalTime);

  const loaded = await loadResultData(values, serviceDate, arrivalDeadline);
  if (!loaded.ok) return <ErrorState message={loaded.message} />;
  const { recommendation, stationNames } = loaded;
  const result = recommendation.recommended;
  const allResults = [result, ...recommendation.alternatives];

  return (
      <div className="page-shell py-10 sm:py-16">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Link href="/" className="focus-ring rounded text-sm font-bold text-pine hover:underline">← Ny sökning</Link>
              <p className="mt-4 text-sm font-bold text-ink/55">{stationNames.origin} → {stationNames.destination} · framme {values.requiredArrivalTime}</p>
            </div>
            <DataModeBadge mode={recommendation.dataMode} />
          </div>

          {!recommendation.meetsTarget ? (
            <div className="mt-7 rounded-2xl border border-coral/30 bg-coral/10 px-5 py-4" role="alert">
              <p className="font-black">Ingen avgång når ditt mål på {Math.round(values.targetReliability * 100)} %</p>
              <p className="mt-1 text-sm text-ink/70">Vi visar alternativet med högst beräknad sannolikhet. Överväg en tidigare resa eller en lägre risknivå.</p>
            </div>
          ) : null}

          <section className="card mt-7 overflow-hidden" aria-labelledby="recommended-heading">
            <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
              <div className="bg-pine p-6 text-white sm:p-10">
                <p id="recommended-heading" className="text-sm font-bold uppercase tracking-[0.16em] text-white/70">Rekommenderad avgång</p>
                <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
                  <div>
                    <p className="text-6xl font-black tracking-tighter tabular-nums sm:text-7xl">{stockholmTime(result.journey.scheduledDeparture)}</p>
                    <p className="mt-2 text-white/75">Planerad ankomst {stockholmTime(result.journey.scheduledArrival)}</p>
                  </div>
                  <div className="rounded-2xl bg-white/10 px-5 py-4 text-right backdrop-blur">
                    <p className="text-4xl font-black tabular-nums">{Math.round(result.probability * 100)} %</p>
                    <p className="text-xs font-bold uppercase tracking-wide text-white/70">chans att hinna</p>
                  </div>
                </div>
                <p className="mt-8 max-w-2xl text-base leading-7 text-white/85">{result.explanation}</p>
                <p className="mt-4 text-sm text-white/65">
                  {result.journey.routeDescription}
                  {result.journey.operatorName ? ` · ${result.journey.operatorName}` : ""}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-3 p-5 sm:p-8">
                <Stat label="Konfidens" value={confidenceLabel[result.confidence]} />
                <Stat label="Rek. marginal" value={`${result.recommendedBufferMinutes} min`} detail="90-percentil + bytesmarginal" />
                <Stat label="Observationer" value={String(result.usableObservations)} detail={`${result.excludedObservations} exkluderade`} />
                <Stat label="Medianförsening" value={`${result.medianDelayMinutes} min`} />
                <Stat label="90-percentil" value={`${result.percentile90DelayMinutes} min`} />
                <Stat label="Inställda" value={`${Math.round(result.cancellationRate * 100)} %`} />
                <Stat label="Byten" value={String(result.journey.transferCount)} />
                <Stat
                  label="Datakälla"
                  value={
                    result.journey.scheduleSource === "trafikverket"
                      ? "Trafikverket"
                      : result.journey.scheduleSource === "trafiklab"
                        ? "Trafiklab"
                        : "Mock"
                  }
                />
              </dl>
            </div>
          </section>

          <div className="mt-6">
            <SaveCommuteButton
              originStationId={values.originStationId}
              destinationStationId={values.destinationStationId}
              requiredArrivalTime={values.requiredArrivalTime}
              targetReliability={values.targetReliability}
            />
          </div>

          <section className="mt-14 grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.16em] text-pine">Jämförelse</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight">Varje kvart räknas</h2>
              <p className="mt-3 leading-7 text-ink/65">Staplarna visar historiskt beräknad chans att anlända senast {values.requiredArrivalTime}, efter avdrag för låg datamängd, bytesrisk och eventuella störningar.</p>
            </div>
            <div className="card space-y-6 p-6 sm:p-8">
              {allResults
                .sort((left, right) => left.journey.scheduledDeparture.getTime() - right.journey.scheduledDeparture.getTime())
                .map((item) => (
                  <ReliabilityBar
                    key={item.journey.id}
                    label={`${stockholmTime(item.journey.scheduledDeparture)}${item.journey.id === result.journey.id ? " · rekommenderad" : ""}`}
                    probability={item.probability}
                    recommended={item.journey.id === result.journey.id}
                  />
                ))}
            </div>
          </section>

          <section className="mt-14">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-pine">Andra avgångar</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">Alternativ att väga mot</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {recommendation.alternatives.map((alternative) => <Alternative key={alternative.journey.id} result={alternative} />)}
            </div>
          </section>
        </div>
      </div>
  );
}
