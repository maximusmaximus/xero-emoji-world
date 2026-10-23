import { createServerFn } from "@tanstack/react-start";

export const bookOffer = createServerFn({ method: "GET" }).handler(async () => {
  const { bookOffer: offer } = await import("./book.server");
  return offer();
});

export const startBookCheckout = createServerFn({ method: "POST" }).handler(async () => {
  const { startCheckout } = await import("./book.server");
  return startCheckout();
});
