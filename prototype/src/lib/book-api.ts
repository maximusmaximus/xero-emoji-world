import { createServerFn } from "@tanstack/react-start";
import { DAILY_ORDER_CAP } from "./book.ts";

export const bookOffer = createServerFn({ method: "GET" }).handler(async () => {
  const { bookOffer: offer } = await import("./book.server");
  return offer();
});

export const startBookCheckout = createServerFn({ method: "POST" })
  .validator((input: { qty?: number } | undefined) => ({
    qty: Math.max(1, Math.min(DAILY_ORDER_CAP, Math.floor(Number(input?.qty) || 1))),
  }))
  .handler(async ({ data }) => {
    const { startCheckout } = await import("./book.server");
    return startCheckout(data.qty);
  });
