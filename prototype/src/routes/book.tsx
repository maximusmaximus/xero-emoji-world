import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { BOOK, money, SPREADS } from "@/lib/book";
import { bookOffer, startBookCheckout } from "@/lib/book-api";

export const Route = createFileRoute("/book")({
  loader: () => bookOffer(),
  head: () => ({
    meta: [
      { title: "Buy the book · Xero Emoji" },
      { name: "description", content: BOOK.blurb },
    ],
  }),
  component: BookPage,
});

function BookPage() {
  const offer = Route.useLoaderData();
  const checkout = useServerFn(startBookCheckout);
  const [spread, setSpread] = useState(SPREADS[0]!);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const price = money(offer.priceCents);

  return (
    <main className="grid min-h-dvh bg-[#fff4df] text-[#2a1c14] lg:grid-cols-[minmax(0,1fr)_minmax(320px,440px)]">
      <section className="flex min-h-[46dvh] flex-col bg-[#ffe08a] lg:min-h-dvh">
        <div className="flex flex-1 items-center justify-center px-4 py-4">
          <button type="button" className="max-h-[62dvh] w-full max-w-[520px]" onClick={() => setSpread(SPREADS[0]!)} aria-label="Show the cover">
            <img src={spread.full} alt={spread.alt} className="mx-auto max-h-[62dvh] w-auto max-w-full rounded-2xl shadow-[0_18px_50px_rgba(90,40,10,0.28)]" />
          </button>
        </div>
        <div className="flex gap-3 overflow-x-auto px-4 pb-4" aria-label="Pages from the book">
          {SPREADS.map((page) => (
            <button
              key={page.id}
              type="button"
              onClick={() => setSpread(page)}
              aria-pressed={spread.id === page.id}
              className={`w-24 shrink-0 rounded-xl border-2 bg-white p-1 ${spread.id === page.id ? "border-[#ff5a36]" : "border-transparent"}`}
            >
              <img src={page.thumb} alt="" className="aspect-square w-full rounded-lg object-cover" />
              <span className="mt-1 block truncate text-center text-[11px] font-semibold">{page.caption}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="flex flex-col justify-between gap-6 px-5 py-6 sm:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c2410c]">Max Infeld · a real book</p>
          <h1 className="mt-2 font-display text-5xl leading-none text-[#ff5a36]">{BOOK.title}</h1>
          <p className="mt-2 text-lg font-semibold">
            {BOOK.edition} · {BOOK.years}
          </p>
          <p className="mt-4 text-base leading-relaxed">{BOOK.blurb}</p>
          <p className="mt-3 text-sm">
            {BOOK.binding} · {BOOK.pages} pages · {BOOK.size}
          </p>
        </div>
        <div className="rounded-3xl bg-white p-4 shadow-[0_10px_30px_rgba(255,90,54,0.12)]">
          <p className="font-display text-4xl text-[#15997a]">{price || "Price soon"}</p>
          <p className="mt-1 text-sm text-[#7a5b45]">
            {offer.hasPrinter ? "Printed when you pay, then shipped." : "Printed on the published RPI book."} United States and Canada.
          </p>
          <button
            type="button"
            data-testid="buy-book"
            disabled={!offer.ready || busy}
            className="mt-4 w-full rounded-full bg-[#ff5a36] px-5 py-4 text-lg font-semibold text-white disabled:bg-[#f0c7b8]"
            onClick={() => {
              setBusy(true);
              setNote("");
              checkout()
                .then((result) => {
                  if (result.url) window.location.assign(result.url);
                  else setNote(result.message);
                })
                .catch(() => setNote("The shop could not open checkout."))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Opening checkout…" : price ? `Buy the book · ${price}` : "Buy the book"}
          </button>
          {note ? <p className="mt-2 text-sm text-[#c2410c]">{note}</p> : null}
          {!offer.ready ? <p className="mt-2 text-sm text-[#7a5b45]">The buy button turns on when the shop keys are set.</p> : null}
          <Link to="/" className="mt-4 inline-block text-sm font-semibold text-[#15997a]">
            Back to the city
          </Link>
        </div>
      </section>
    </main>
  );
}
