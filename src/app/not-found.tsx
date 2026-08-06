import Link from "next/link";

export default function NotFound() {
  return (
    <section className="page-shell py-20 text-center">
      <p className="text-sm font-black uppercase tracking-[0.16em] text-pine">404</p>
      <h1 className="mt-3 text-4xl font-black">Sidan finns inte</h1>
      <Link href="/" className="button-primary mt-7">Till startsidan</Link>
    </section>
  );
}
