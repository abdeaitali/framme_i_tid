import type { Metadata } from "next";
import { DataModeBadge } from "@/components/data-mode-badge";
import { getTransportDataProvider } from "@/providers";

export const metadata: Metadata = { title: "Så räknar vi" };
export const dynamic = "force-dynamic";

export default function MethodPage() {
  const dataMode = getTransportDataProvider().mode;
  return (
    <article className="page-shell py-14 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <DataModeBadge mode={dataMode} />
        <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">Så räknar vi på din marginal</h1>
        <p className="mt-5 text-lg leading-8 text-ink/70">Framme i tid använder en transparent empirisk modell. Den lär inte upp en svart låda och den lovar aldrig att en resa kommer fram.</p>

        <div className="mt-12 space-y-10">
          <section>
            <h2 className="text-2xl font-black">1. Jämförbara resor</h2>
            <p className="mt-3 leading-7 text-ink/70">Vi hämtar upp till tolv veckors observationer för samma avgångsmönster. Samma veckodag och närliggande avgångstid prioriteras. Poster som saknar faktisk ankomst eller innehåller orimliga tider exkluderas och räknas öppet.</p>
          </section>
          <section>
            <h2 className="text-2xl font-black">2. Deadline, inte bara punktlighet</h2>
            <p className="mt-3 leading-7 text-ink/70">Varje historisk ankomstförsening läggs på kandidatens planerade ankomst. Om den projicerade resan når målet före din deadline räknas den som lyckad. Inställda avgångar räknas alltid som misslyckade.</p>
          </section>
          <section>
            <h2 className="text-2xl font-black">3. Begripliga riskavdrag</h2>
            <p className="mt-3 leading-7 text-ink/70">Små avdrag görs vid låg datamängd. Resor med byten justeras med den observerade andelen missade byten. En aktuell försening eller störning kan ge ytterligare avdrag när realtidsstatus finns.</p>
          </section>
          <section>
            <h2 className="text-2xl font-black">4. Senaste säkra avgång</h2>
            <p className="mt-3 leading-7 text-ink/70">Vi väljer den senaste avgång som når ditt mål, normalt 90 %. Om ingen når målet visar vi alternativet med högst sannolikhet och en tydlig varning. Procenttal avrundas till heltal för att undvika falsk precision.</p>
          </section>
          <section>
            <h2 className="text-2xl font-black">5. Rätt källa för rätt trafik</h2>
            <p className="mt-3 leading-7 text-ink/70">Lokal trafik, som Östgötatrafiken och SL, hämtas från Trafiklabs regionala GTFS-flöden. Intercitytåg från exempelvis SJ, Snälltåget och VR följs via Trafikverkets operatörsoberoende järnvägsannonseringar. Planerade, beräknade och faktiska tider sparas löpande i vår databas så att historiken växer utan att tidtabeller misstas för verkliga ankomster.</p>
          </section>
        </div>

        <aside className="mt-12 rounded-3xl bg-mint p-6 sm:p-8">
          <h2 className="text-xl font-black">Konfidensnivåer</h2>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-ink/75">
            <li><strong>Hög:</strong> minst 40 användbara observationer.</li>
            <li><strong>Medel:</strong> 15–39 användbara observationer.</li>
            <li><strong>Låg:</strong> färre än 15 användbara observationer.</li>
          </ul>
        </aside>
      </div>
    </article>
  );
}
