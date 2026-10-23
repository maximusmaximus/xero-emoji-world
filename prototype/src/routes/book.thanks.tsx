import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/book/thanks")({
  component: Thanks,
});

function Thanks() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#fff4df] px-6 text-center text-[#2a1c14]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c2410c]">Paid</p>
        <h1 className="mt-2 font-display text-5xl text-[#ff5a36]">The book is yours</h1>
        <p className="mx-auto mt-3 max-w-md text-lg">Stripe has the order. The printer gets it next, then it ships to the address you gave.</p>
        <Link to="/" className="mt-6 inline-block rounded-full bg-[#ff5a36] px-5 py-3 font-semibold text-white">
          Back to the city
        </Link>
      </div>
    </main>
  );
}
