import type { Metadata } from "next";

export const metadata: Metadata = { title: "Integritet" };

export default function PrivacyPage() {
  return (
    <article className="page-shell py-14 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-pine">Integritet i pilottjänsten</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Så lite persondata som möjligt</h1>
        <p className="mt-5 text-lg leading-8 text-ink/70">Du ska kunna få en användbar rekommendation utan konto, hemadress eller positionshistorik.</p>

        <div className="mt-12 space-y-9 leading-7 text-ink/70">
          <section>
            <h2 className="text-2xl font-black text-ink">Det vi sparar</h2>
            <p className="mt-3">Om du väljer att spara en pendling lagras stationerna, önskad ankomsttid, veckodagar och säkerhetsmål. En slumpmässig anonym sessionsidentifierare sparas i en httpOnly-cookie för att hitta pendlingen igen.</p>
          </section>
          <section>
            <h2 className="text-2xl font-black text-ink">Det vi inte samlar in</h2>
            <p className="mt-3">MVP:t frågar inte efter namn, e-post, exakt hemadress, GPS-position eller fullständig resehistorik. API-nycklar finns endast i servermiljön och skickas aldrig till webbläsaren.</p>
          </section>
          <section>
            <h2 className="text-2xl font-black text-ink">Uppskattningar och datakällor</h2>
            <p className="mt-3">Resultaten är sannolikhetsuppskattningar och inga garantier. Tågannonseringar från Trafikverket sparas för att bygga statistik om faktiska ankomster, förseningar och inställda avgångar. Gränssnittet visar vilken datakälla som stöder resultatet.</p>
          </section>
          <section>
            <h2 className="text-2xl font-black text-ink">Lagring och tjänsteleverantörer</h2>
            <p className="mt-3">Webbtjänsten körs hos Vercel och databasen är en PostgreSQL-databas hos Supabase. API-nycklar används endast på serversidan. Vi säljer inte uppgifter om sparade pendlingar.</p>
          </section>
          <section>
            <h2 className="text-2xl font-black text-ink">Radera en sparad pendling</h2>
            <p className="mt-3">Du kan när som helst gå till Min pendling och välja Ta bort sparad pendling. Då raderas både databasposten och sessionskakan som kopplar den till webbläsaren.</p>
          </section>
          <section>
            <h2 className="text-2xl font-black text-ink">Före konto eller betalning</h2>
            <p className="mt-3">Innan tjänsten inför konton, betalning eller valfri analys kompletteras informationen med personuppgiftsansvarig, kontaktväg, rättslig grund och tydliga gallringstider.</p>
          </section>
        </div>
      </div>
    </article>
  );
}
