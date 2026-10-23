import { getRequestUrl } from "@tanstack/start-server-core";
import { BOOK, BOOK_PAGES, BOOK_SKU, shopGaps, type ShopEnv } from "./book.ts";

type Rate = { methodClassification?: string; price?: number };

function readEnv(): ShopEnv {
  return {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    ALLOW_LIVE_STRIPE: process.env.ALLOW_LIVE_STRIPE,
    BOOK_PRICE_CENTS: process.env.BOOK_PRICE_CENTS,
    BOOK_CHECKOUT: process.env.BOOK_CHECKOUT,
    RPI_API_AUTH: process.env.RPI_API_AUTH,
    RPI_LIVE_ORDERS: process.env.RPI_LIVE_ORDERS,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  };
}

function origin() {
  const fromEnv = process.env.PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  try {
    return new URL(getRequestUrl().href).origin;
  } catch {
    return "";
  }
}

async function rpi(method: string, path: string, body?: unknown) {
  const base = (process.env.RPI_BASE_URL || "https://open.api.rpiprint.com").replace(/\/$/, "");
  const auth = process.env.RPI_API_AUTH?.trim();
  if (!auth) return { status: 0, data: null as unknown };
  const response = await fetch(base + path, {
    method,
    headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}

async function shippingRates(): Promise<Rate[]> {
  const quoted = await rpi("POST", "/orders/shipping/estimate", {
    currency: "USD",
    destination: { name: "Quote", address1: "1 Main St", city: "Chico", regionCode: "CA", postal: "95926", country: "US" },
    orderItems: [{ sku: process.env.RPI_SKU?.trim() || BOOK_SKU, quantity: 1 }],
  });
  return Array.isArray(quoted.data) ? (quoted.data as Rate[]) : [];
}

export function bookOffer() {
  const shop = shopGaps(readEnv());
  return {
    ready: shop.ready,
    priceCents: shop.ready ? shop.priceCents : 0,
    canPrint: shop.canPrint,
    hasPrinter: shop.hasPrinter,
    hasWebhook: shop.hasWebhook,
  };
}

export async function startCheckout() {
  const shop = shopGaps(readEnv());
  if (!shop.ready) {
    return { url: null as string | null, message: "Checkout is waiting on the shop keys." };
  }
  const base = origin();
  if (!base) return { url: null, message: "This shop does not know its public address yet." };
  const params: Record<string, string> = {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(shop.priceCents),
    "line_items[0][price_data][product_data][name]": `${BOOK.title}: ${BOOK.edition} (hardcover, ${BOOK_PAGES} pp)`,
    "shipping_address_collection[allowed_countries][0]": "US",
    "shipping_address_collection[allowed_countries][1]": "CA",
    success_url: `${base}/book/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/book`,
    "metadata[sku]": process.env.RPI_SKU?.trim() || BOOK_SKU,
  };
  const rates = await shippingRates().catch(() => [] as Rate[]);
  const options = rates.filter((rate) => Number.isFinite(rate.price));
  const listed = options.length ? options : [{ methodClassification: "Printer shipping", price: 0 }];
  listed.forEach((rate, index) => {
    const key = `shipping_options[${index}][shipping_rate_data]`;
    params[`${key}[type]`] = "fixed_amount";
    params[`${key}[display_name]`] = rate.methodClassification || "Shipping";
    params[`${key}[fixed_amount][amount]`] = String(Math.round((rate.price || 0) * 100));
    params[`${key}[fixed_amount][currency]`] = "usd";
    params[`${key}[metadata][rpi]`] = rate.methodClassification || "standard";
  });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const data = (await response.json()) as { url?: string; error?: { message?: string } };
  if (!response.ok || !data.url) {
    return { url: null, message: data.error?.message || "Stripe did not open a checkout." };
  }
  return { url: data.url, message: "" };
}

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");

export async function verifyStripeSig(payload: string, header: string | null, secret: string, tolerance = 300) {
  const sigs = (header || "").split(",").filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  const stamp = (header || "").split(",").map((part) => part.split("=")).find((part) => part[0] === "t")?.[1];
  if (!stamp || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(stamp)) > tolerance) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${stamp}.${payload}`)));
  return sigs.includes(mac);
}

type Session = {
  id?: string;
  payment_status?: string;
  shipping_details?: { name?: string; address?: Record<string, string> };
  collected_information?: { shipping_details?: { name?: string; address?: Record<string, string> } };
  shipping_cost?: { shipping_rate_metadata?: { rpi?: string } };
  customer_details?: { email?: string };
};

function rpiOrder(session: Session) {
  const ship = session.shipping_details || session.collected_information?.shipping_details || {};
  const address = ship.address || {};
  const cover = process.env.BOOK_COVER_URL?.trim();
  const guts = process.env.BOOK_GUTS_URL?.trim();
  return {
    customerOrderId: `xeb-${session.id}`,
    currency: "USD",
    shippingClassification: session.shipping_cost?.shipping_rate_metadata?.rpi || "standard",
    destination: {
      name: ship.name,
      address1: address.line1,
      address2: address.line2 || undefined,
      city: address.city,
      regionCode: address.state,
      postal: address.postal_code,
      country: address.country,
      email: session.customer_details?.email,
    },
    orderItems: [
      {
        sku: process.env.RPI_SKU?.trim() || BOOK_SKU,
        quantity: 1,
        itemDescription: `${BOOK.title}: ${BOOK.edition} (${BOOK_PAGES}pp)`,
        product: { coverUrl: cover || undefined, gutsUrl: guts || undefined, pageCount: BOOK_PAGES },
      },
    ],
  };
}

export async function handleBookWebhook(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const body = await request.text();
  if (!secret || !(await verifyStripeSig(body, request.headers.get("stripe-signature"), secret))) {
    return Response.json({ error: "bad signature" }, { status: 400 });
  }
  const event = JSON.parse(body) as { type?: string; data?: { object?: Session } };
  const session = event.data?.object;
  if (event.type !== "checkout.session.completed" || session?.payment_status !== "paid") {
    return Response.json({ ignored: event.type });
  }
  const order = rpiOrder(session);
  if (process.env.RPI_LIVE_ORDERS !== "true" || !process.env.RPI_API_AUTH?.trim()) {
    return Response.json({ dryRun: true });
  }
  const printed = await rpi("POST", "/orders/", order);
  return Response.json({ created: printed.status }, { status: printed.status < 300 ? 200 : 502 });
}
