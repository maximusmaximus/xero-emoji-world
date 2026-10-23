import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { BOOK, DAILY_ORDER_CAP, money, SPREADS, type BookSpread } from "@/lib/book";
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
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState<BookSpread | null>(null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const page = SPREADS[index] ?? SPREADS[0]!;
  const left = offer.remaining;
  const cart = Math.max(0, Math.min(left, qty));
  const each = money(offer.priceCents);
  const total = money(offer.priceCents * cart);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
      if (event.key === "ArrowRight") setIndex((value) => (value + 1) % SPREADS.length);
      if (event.key === "ArrowLeft") setIndex((value) => (value - 1 + SPREADS.length) % SPREADS.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    setOpen((current) => (current ? (SPREADS[index] ?? null) : current));
  }, [index]);

  const flip = (step: number) => setIndex((value) => (value + step + SPREADS.length) % SPREADS.length);

  return (
    <main className="grid min-h-dvh bg-[#fff4df] text-[#2a1c14] lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)]">
      <section className="flex min-h-[52dvh] w-full max-w-[100vw] flex-col overflow-hidden bg-[#ffe08a] lg:min-h-dvh">
        <div className="grid w-full grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 px-2 py-4">
          <button type="button" aria-label="Previous page" className="grid size-11 place-items-center justify-self-center rounded-full bg-white text-xl" onClick={() => flip(-1)}>
            ‹
          </button>
          <button type="button" className="min-w-0 overflow-hidden" aria-label={`Open ${page.caption}`} onClick={() => setOpen(page)}>
            <img src={page.full} alt={page.alt} className="mx-auto block h-auto max-h-[42dvh] w-full min-w-0 rounded-2xl object-contain shadow-[0_18px_50px_rgba(90,40,10,0.22)] sm:max-h-[62dvh]" />
          </button>
          <button type="button" aria-label="Next page" className="grid size-11 place-items-center justify-self-center rounded-full bg-white text-xl" onClick={() => flip(1)}>
            ›
          </button>
        </div>
        <p className="px-4 text-center text-sm font-semibold">
          {page.caption} · {index + 1} of {SPREADS.length}
        </p>
        <div className="flex snap-x gap-3 overflow-x-auto px-4 py-3" aria-label="Sample pages">
          {SPREADS.map((spread, spreadIndex) => (
            <button
              key={spread.id}
              type="button"
              data-testid={`spread-${spread.id}`}
              onClick={() => {
                setIndex(spreadIndex);
                setOpen(spread);
              }}
              aria-pressed={index === spreadIndex}
              className={`w-[4.5rem] shrink-0 snap-start rounded-xl border-2 bg-white p-1 sm:w-24 ${index === spreadIndex ? "border-[#ff5a36]" : "border-transparent"}`}
            >
              <img src={spread.thumb} alt="" className="aspect-square w-full rounded-lg object-cover" />
              <span className="mt-1 block truncate text-center text-[11px] font-semibold">{spread.caption}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="flex flex-col justify-between gap-5 px-5 py-5 sm:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c2410c]">Max Infeld · a real book</p>
          <h1 className="mt-2 font-display text-5xl leading-none text-[#ff5a36]">{BOOK.title}</h1>
          <p className="mt-2 text-lg font-semibold">
            {BOOK.edition} · {BOOK.years}
          </p>
          <p className="mt-3 text-base leading-relaxed">{BOOK.blurb}</p>
          <p className="mt-2 text-sm">
            {BOOK.binding} · {BOOK.pages} pages · {BOOK.size}
          </p>
        </div>
        <div className="rounded-3xl bg-white p-4 shadow-[0_10px_30px_rgba(255,90,54,0.12)]">
          <p className="font-display text-4xl text-[#15997a]">{each}</p>
          <p className="mt-1 text-sm text-[#7a5b45]">
            {left} of {DAILY_ORDER_CAP} left today. Printed and shipped in the US and Canada.
          </p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">Copies</span>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Fewer copies" className="grid size-10 place-items-center rounded-full bg-[#ffe08a] text-xl disabled:opacity-40" onClick={() => setQty((value) => Math.max(1, value - 1))} disabled={cart <= 1}>
                −
              </button>
              <span data-testid="cart-qty" className="w-8 text-center text-lg font-semibold">
                {cart}
              </span>
              <button type="button" aria-label="More copies" data-testid="more-copies" className="grid size-10 place-items-center rounded-full bg-[#ffe08a] text-xl disabled:opacity-40" onClick={() => setQty((value) => value + 1)} disabled={cart >= left}>
                +
              </button>
            </div>
          </div>
          <button
            type="button"
            data-testid="buy-book"
            disabled={!offer.ready || busy || cart < 1}
            className="mt-4 w-full rounded-full bg-[#ff5a36] px-5 py-4 text-lg font-semibold text-white disabled:bg-[#f0c7b8]"
            onClick={() => {
              setBusy(true);
              setNote("");
              checkout({ data: { qty: cart } })
                .then((result) => {
                  if (result.url) window.location.assign(result.url);
                  else setNote(result.message);
                })
                .catch(() => setNote("The shop could not open checkout."))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Opening checkout…" : cart ? `Buy ${cart} · ${total}` : "Sold out today"}
          </button>
          {note ? <p className="mt-2 text-sm text-[#c2410c]">{note}</p> : null}
          {!offer.ready ? <p className="mt-2 text-sm text-[#7a5b45]">The price is set. Card checkout turns on when the Stripe key is on the host.</p> : null}
          <Link to="/" className="mt-4 inline-block text-sm font-semibold text-[#15997a]">
            Back to the city
          </Link>
        </div>
      </section>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" onClick={() => setOpen(null)} data-testid="page-detail" role="dialog" aria-modal="true" aria-label={open.caption}>
          <button type="button" className="absolute right-3 top-3 rounded-full bg-white/15 px-3 py-2 text-sm text-white" onClick={() => setOpen(null)}>
            Close
          </button>
          <figure className="max-w-[92vw]" onClick={(event) => event.stopPropagation()}>
            <img src={open.full} alt={open.alt} className="mx-auto max-h-[78dvh] w-auto max-w-full rounded-xl" />
            <figcaption className="mt-2 flex items-center justify-between gap-3 text-sm text-white">
              <button type="button" className="rounded-full bg-white/15 px-3 py-2" onClick={() => flip(-1)}>
                Previous
              </button>
              <span>{open.caption}</span>
              <button type="button" className="rounded-full bg-white/15 px-3 py-2" onClick={() => flip(1)}>
                Next
              </button>
            </figcaption>
          </figure>
        </div>
      ) : null}
    </main>
  );
}
