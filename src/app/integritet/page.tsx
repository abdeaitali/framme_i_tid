import type { Metadata } from "next";

export const metadata: Metadata = { title: "Integritet" };

export default function PrivacyPage() {
  return (
    <article className="page-shell py-14 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-pine">Integritet i MVP:t</p>
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
            <p className="mt-3">Resultaten är sannolikhetsuppskattningar och inga garantier. Gränssnittet märker tydligt ut syntetisk demonstrationsdata och om en resa bygger på Trafiklab eller Trafikverket. Båda realdatalägena kräver separata servernycklar och konfiguration.</p>
          </section>
          <section>
            <h2 className="text-2xl font-black text-ink">Lagring och radering</h2>
            <p className="mt-3">I pilotversionen ligger data i den lokala PostgreSQL-databasen. Radera webbläsarens cookie och motsvarande SavedCommute-post för att ta bort kopplingen. En publik tjänst behöver komplettera detta med tydlig personuppgiftsansvarig, gallringstid och kontaktväg.</p>
          </section>
        </div>
      </div>
    </article>
  );
}
