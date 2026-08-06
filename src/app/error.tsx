"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="page-shell py-20">
      <div className="card mx-auto max-w-xl p-10 text-center">
        <h2 className="text-3xl font-black">Något gick fel</h2>
        <p className="mt-3 text-ink/65">Ett oväntat fel inträffade. Försök ladda om beräkningen.</p>
        <button type="button" onClick={reset} className="button-primary mt-7">Försök igen</button>
      </div>
    </section>
  );
}
