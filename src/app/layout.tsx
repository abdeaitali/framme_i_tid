import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Framme i tid", template: "%s | Framme i tid" },
  description: "Historikbaserade avgångsrekommendationer för svensk kollektivtrafik.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv" data-scroll-behavior="smooth">
      <body>
        <header className="border-b border-ink/10 bg-cream/90 backdrop-blur">
          <div className="page-shell flex min-h-20 items-center justify-between gap-5">
            <Link href="/" className="focus-ring flex items-center gap-3 rounded-xl" aria-label="Framme i tid, startsida">
              <span className="grid size-10 place-items-center rounded-full bg-pine text-lg font-black text-white" aria-hidden="true">
                F
              </span>
              <span className="font-black tracking-tight">Framme i tid</span>
            </Link>
            <nav aria-label="Huvudmeny" className="flex items-center gap-4 text-sm font-semibold sm:gap-6">
              <Link className="focus-ring rounded-md hover:text-pine" href="/pendling">
                Min pendling
              </Link>
              <Link className="focus-ring hidden rounded-md hover:text-pine sm:inline" href="/metod">
                Så räknar vi
              </Link>
              <Link className="focus-ring hidden rounded-md hover:text-pine sm:inline" href="/integritet">
                Integritet
              </Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="mt-20 border-t border-ink/10 py-10 text-sm text-ink/65">
          <div className="page-shell flex flex-col justify-between gap-4 sm:flex-row">
            <p>Framme i tid – sannolikheter är uppskattningar, inte garantier.</p>
            <div className="flex gap-5">
              <Link href="/metod" className="hover:text-pine">Metod</Link>
              <Link href="/integritet" className="hover:text-pine">Integritet</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
