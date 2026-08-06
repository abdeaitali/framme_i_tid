import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { CommuteEditor } from "@/components/commute-editor";
import { DataModeBadge } from "@/components/data-mode-badge";
import { buildWeeklySummary, databaseTime, getSavedCommute } from "@/services/commute-service";
import { getPilotStations } from "@/services/station-service";
import { getTransportDataProvider } from "@/providers";

export const metadata: Metadata = { title: "Min pendling" };
export const dynamic = "force-dynamic";

function EmptyCommute() {
  return (
    <div className="card mx-auto max-w-2xl p-8 text-center sm:p-12">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-mint text-2xl" aria-hidden="true">↗</span>
      <h1 className="mt-5 text-3xl font-black">Ingen sparad pendling ännu</h1>
      <p className="mx-auto mt-3 max-w-md leading-7 text-ink/65">Sök efter en resa och spara rekommendationen. Då får du en ny riskbedömning för varje vald veckodag.</p>
      <Link href="/" className="button-primary mt-7">Planera en resa</Link>
    </div>
  );
}

async function loadCommuteData(sessionId: string) {
  try {
    const [commute, stations] = await Promise.all([
      getSavedCommute(sessionId),
      getPilotStations(),
    ]);
    if (!commute) return { ok: true as const, commute: null, stations, summary: null };
    const summary = await buildWeeklySummary(commute);
    return { ok: true as const, commute, stations, summary };
  } catch {
    return { ok: false as const };
  }
}

export default async function CommutePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const dataMode = getTransportDataProvider().mode;
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("framme_session")?.value;
  if (!sessionId) {
    return <section className="page-shell py-20"><EmptyCommute /></section>;
  }

  const loaded = await loadCommuteData(sessionId);
  if (!loaded.ok) {
    return (
      <section className="page-shell py-20">
        <div className="card mx-auto max-w-2xl p-10 text-center">
          <h1 className="text-3xl font-black">Veckan kunde inte laddas</h1>
          <p className="mt-3 text-ink/65">Kontrollera att databasen är startad och att mockdata har importerats.</p>
          <Link href="/" className="button-primary mt-7">Till startsidan</Link>
        </div>
      </section>
    );
  }
  if (!loaded.commute || !loaded.summary) {
    return <section className="page-shell py-20"><EmptyCommute /></section>;
  }
  const { commute, stations, summary } = loaded;
  const predictedDays = summary.days.filter((day) => day.probability !== null);

  return (
      <div className="page-shell py-10 sm:py-16">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.16em] text-pine">Din återkommande resa</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">Veckan i ett ögonkast</h1>
            <p className="mt-3 text-ink/65">{commute.originStation.name} → {commute.destinationStation.name}, framme {databaseTime(commute.requiredArrivalTime)}</p>
          </div>
          <DataModeBadge mode={dataMode} />
        </div>

        {params.saved === "1" ? (
          <p role="status" className="mt-6 rounded-2xl bg-mint px-5 py-4 font-bold text-pine">Pendlingen är sparad på den här enheten.</p>
        ) : null}

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="card p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-ink/55">Snittsäkerhet</p>
            <p className="mt-2 text-4xl font-black tabular-nums">{summary.averageReliability === null ? "–" : `${Math.round(summary.averageReliability * 100)} %`}</p>
          </div>
          <div className="card p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-ink/55">Vanligaste avgångsfönster</p>
            <p className="mt-2 text-4xl font-black tabular-nums">{summary.mostReliableWindow ?? "–"}</p>
            {summary.mostReliableWindow ? <p className="mt-1 text-sm text-ink/55">30 minuters fönster</p> : null}
          </div>
          <div className="card p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-ink/55">Dagar med förhöjd risk</p>
            <p className={`mt-2 text-4xl font-black tabular-nums ${summary.elevatedRiskDays > 0 ? "text-coral" : "text-pine"}`}>{summary.elevatedRiskDays}</p>
          </div>
        </section>

        <section className="mt-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.16em] text-pine">Nästa sju dagar</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight">Rekommenderad avgång</h2>
            </div>
            <p className="hidden text-sm text-ink/55 sm:block">{predictedDays.length} beräknade pendlingsdagar</p>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
            {summary.days.map((day) => (
              <article key={day.date} className={`rounded-2xl border p-4 ${day.selected ? "border-ink/10 bg-white" : "border-transparent bg-ink/[0.035] text-ink/45"}`}>
                <p className="text-xs font-black uppercase tracking-wide">{day.weekday}</p>
                <p className="mt-1 text-xs">{day.date.slice(5)}</p>
                {day.selected ? (
                  day.departure && day.probability !== null ? (
                    <>
                      <p className="mt-5 text-2xl font-black tabular-nums">{day.departure}</p>
                      <p className={`mt-1 text-sm font-black ${day.elevatedRisk ? "text-coral" : "text-pine"}`}>{Math.round(day.probability * 100)} %</p>
                    </>
                  ) : <p className="mt-5 text-xs leading-5 text-coral">{day.message ?? "Ingen prognos"}</p>
                ) : <p className="mt-5 text-xs">Ingen pendling</p>}
              </article>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-pine">Inställningar</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight">Ändra din pendling</h2>
          <div className="mt-6">
            <CommuteEditor
              stations={stations}
              initial={{
                originStationId: commute.originStationId,
                destinationStationId: commute.destinationStationId,
                requiredArrivalTime: databaseTime(commute.requiredArrivalTime),
                weekdays: commute.weekdays,
                targetReliability: commute.targetReliability,
              }}
            />
          </div>
        </section>
      </div>
  );
}
