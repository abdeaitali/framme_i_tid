import { formatInTimeZone } from "date-fns-tz";
import { JourneySearchForm } from "@/components/journey-search-form";
import { DataModeBadge } from "@/components/data-mode-badge";
import { STOCKHOLM_TIME_ZONE } from "@/config/pilot";
import { getPilotStations } from "@/services/station-service";
import { getTransportDataProvider } from "@/providers";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const stations = await getPilotStations();
  const dataMode = getTransportDataProvider().mode;
  const defaultDate = formatInTimeZone(new Date(), STOCKHOLM_TIME_ZONE, "yyyy-MM-dd");

  return (
    <>
      <section className="page-shell grid gap-12 pb-16 pt-14 lg:grid-cols-[1fr_0.95fr] lg:items-center lg:pb-24 lg:pt-24">
        <div>
          <DataModeBadge mode={dataMode} />
          <p className="mt-6 text-sm font-black uppercase tracking-[0.18em] text-pine">Pålitlighet före tidtabell</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[1.05] tracking-[-0.045em] sm:text-6xl">
            Kom fram i tid – inte bara enligt tidtabellen
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-ink/75 sm:text-xl">
            Ange när du måste vara framme. Vi rekommenderar avgången som ger dig bäst chans att hinna i tid.
          </p>
          <div className="mt-9 flex flex-wrap gap-x-7 gap-y-3 text-sm font-semibold text-ink/70">
            <span>✓ 12 veckors historik</span>
            <span>✓ Förklarad risk</span>
            <span>✓ 18 anslutna stationer</span>
          </div>
        </div>
        <div className="card relative overflow-hidden p-5 sm:p-8">
          <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-full bg-mint" aria-hidden="true" />
          <div className="relative">
            <p className="text-sm font-bold text-pine">När måste du vara framme?</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight">Planera för verkligheten</h2>
            <div className="mt-7">
              <JourneySearchForm stations={stations} defaultDate={defaultDate} />
            </div>
          </div>
        </div>
      </section>
      <section className="border-y border-ink/10 bg-white/60 py-14">
        <div className="page-shell grid gap-8 md:grid-cols-3">
          {[
            ["01", "Du anger deadline", "Välj stationer, datum och när du senast behöver vara framme."],
            ["02", "Vi jämför historiken", "Förseningar, inställda turer och byten vägs in för liknande avgångar."],
            ["03", "Du väljer med marginal", "Se den senaste säkra avgången, alternativen och varför risken skiljer sig."],
          ].map(([number, title, text]) => (
            <article key={number} className="grid grid-cols-[auto_1fr] gap-4">
              <span className="text-3xl font-black text-pine/25">{number}</span>
              <div>
                <h2 className="font-black">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-ink/65">{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
