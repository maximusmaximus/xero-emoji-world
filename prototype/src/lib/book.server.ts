import { getRequestUrl } from "@tanstack/start-server-core";
import { readFileSync } from "node:fs";
import { hostEnv } from "virtual:book-host-env";
import {
  BOOK,
  BOOK_PAGES,
  BOOK_SKU,
  DAILY_ORDER_CAP,
  HOLD_MS,
  clampCart,
  shopGaps,
  type ShopEnv,
} from "./book.ts";
import { getSql } from "./db.ts";

type Rate = { methodClassification?: string; price?: number };

const ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "ALLOW_LIVE_STRIPE",
  "BOOK_PRICE_CENTS",
  "BOOK_CHECKOUT",
  "RPI_API_AUTH",
  "RPI_API_KEY",
  "RPI_WEBHOOK_SECRET",
  "RPI_LIVE_ORDERS",
  "RPI_BASE_URL",
  "RPI_SKU",
  "STRIPE_WEBHOOK_SECRET",
  "PUBLIC_BASE_URL",
  "BOOK_COVER_URL",
  "BOOK_GUTS_URL",
] as const;

const HOLD_MINUTES = HOLD_MS / 60000;

function applyHost(key: string, value: string | undefined) {
  if (!value?.trim()) return;
  if (!ENV_KEYS.includes(key as (typeof ENV_KEYS)[number])) return;
  if (process.env[key]?.trim()) return;
  process.env[key] = value.trim().replace(/^["']|["']$/g, "");
}

function loadDotEnv() {
  if (process.env.BOOK_ISOLATED === "1") return;
  for (const file of ["/workspace/.env", "/workspace/server/book-host.env", ".env", "server/book-host.env"]) {
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!match) continue;
      applyHost(match[1]!, match[2]);
    }
  }
  for (const [key, value] of Object.entries(hostEnv)) applyHost(key, value);
}

function readEnv(): ShopEnv {
  loadDotEnv();
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
  loadDotEnv();
  const fromEnv = process.env.PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  try {
    return new URL(getRequestUrl().href).origin;
  } catch {
    return "";
  }
}

function sku() {
  loadDotEnv();
  return process.env.RPI_SKU?.trim() || BOOK_SKU;
}

async function rpi(method: string, path: string, body?: unknown) {
  loadDotEnv();
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

async function shippingRates(quantity: number): Promise<Rate[]> {
  const quoted = await rpi("POST", "/orders/shipping/estimate", {
    currency: "USD",
    destination: { name: "Quote", address1: "1 Main St", city: "Chico", regionCode: "CA", postal: "95926", country: "US" },
    orderItems: [{ sku: sku(), quantity }],
  });
  return Array.isArray(quoted.data) ? (quoted.data as Rate[]) : [];
}

/** Copies already spoken for today (Pacific). Paid rows count all day; unpaid ones expire. */
async function usedToday() {
  const sql = await getSql();
  const rows = await sql.query<{ n: number }>(
    `select coalesce(sum(qty), 0)::int as n
     from book_holds
     where (created_at at time zone 'America/Los_Angeles')::date
         = (now() at time zone 'America/Los_Angeles')::date
       and (paid or created_at > now() - ($1::int * interval '1 minute'))`,
    [HOLD_MINUTES],
  );
  return Number(rows[0]?.n) || 0;
}

export async function bookOffer() {
  const shop = shopGaps(readEnv());
  const used = await usedToday();
  return {
    ready: shop.ready,
    priceCents: shop.priceCents,
    remaining: Math.max(0, DAILY_ORDER_CAP - used),
    canPrint: shop.canPrint,
    hasPrinter: shop.hasPrinter,
    hasWebhook: shop.hasWebhook,
  };
}

/** Reserve copies inside one statement so two checkouts cannot both take the last book. */
async function reserve(id: string, asked: number) {
  const sql = await getSql();
  const rows = await sql.query<{ id: string; qty: number }>(
    `with lock as (select pg_advisory_xact_lock(481516234)),
          used as (
            select coalesce(sum(qty), 0)::int as n
            from book_holds
            where (created_at at time zone 'America/Los_Angeles')::date
                = (now() at time zone 'America/Los_Angeles')::date
              and (paid or created_at > now() - ($4::int * interval '1 minute'))
          )
     insert into book_holds (id, qty, paid)
     select $1, least($2::int, $3::int - used.n), false
     from used, lock
     where used.n < $3
     returning id, qty`,
    [id, asked, DAILY_ORDER_CAP, HOLD_MINUTES],
  );
  return rows[0] ?? null;
}

async function release(id: string) {
  const sql = await getSql();
  await sql.query("delete from book_holds where id = $1 and paid = false", [id]);
}

async function renameHold(from: string, to: string) {
  const sql = await getSql();
  await sql.query("update book_holds set id = $2 where id = $1", [to, from]);
}

export async function startCheckout(asked: number) {
  const shop = shopGaps(readEnv());
  if (!shop.ready) return { url: null as string | null, message: "Checkout is waiting on the Stripe key." };
  const qtyAsked = clampCart(asked, DAILY_ORDER_CAP);
  if (qtyAsked < 1) return { url: null, message: "Today's 50 copies are already spoken for. More tomorrow." };
  const base = origin();
  if (!base) return { url: null, message: "This shop does not know its public address yet." };
  const holdId = crypto.randomUUID();
  const reserved = await reserve(holdId, qtyAsked);
  if (!reserved) return { url: null, message: "Today's 50 copies are already spoken for. More tomorrow." };
  const qty = reserved.qty;
  const params: Record<string, string> = {
    mode: "payment",
    "line_items[0][quantity]": String(qty),
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(shop.priceCents),
    "line_items[0][price_data][product_data][name]": `${BOOK.title}: ${BOOK.edition} (hardcover, ${BOOK_PAGES} pp)`,
    "shipping_address_collection[allowed_countries][0]": "US",
    "shipping_address_collection[allowed_countries][1]": "CA",
    success_url: `${base}/book/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/book`,
    "metadata[sku]": sku(),
    "metadata[qty]": String(qty),
    "metadata[hold]": holdId,
  };
  const rates = await shippingRates(qty).catch(() => [] as Rate[]);
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
  const data = (await response.json()) as { id?: string; url?: string; error?: { message?: string } };
  if (!response.ok || !data.url) {
    await release(holdId);
    return { url: null, message: data.error?.message || "Stripe did not open a checkout." };
  }
  if (data.id && data.id !== holdId) await renameHold(holdId, data.id);
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
  metadata?: { qty?: string; hold?: string };
  shipping_details?: { name?: string; address?: Record<string, string> };
  collected_information?: { shipping_details?: { name?: string; address?: Record<string, string> } };
  shipping_cost?: { shipping_rate_metadata?: { rpi?: string } };
  customer_details?: { email?: string };
};

async function markPaid(session: Session) {
  const sql = await getSql();
  const sessionId = session.id || "";
  const holdId = session.metadata?.hold || "";
  const qty = clampCart(Number(session.metadata?.qty) || 1, DAILY_ORDER_CAP) || 1;
  const updated = await sql.query<{ qty: number }>(
    `update book_holds set paid = true, id = coalesce(nullif($1, ''), id)
     where id = $1 or id = $2
     returning qty`,
    [sessionId, holdId],
  );
  if (updated[0]) return Number(updated[0].qty) || qty;
  const id = sessionId || holdId || crypto.randomUUID();
  await sql.query(
    `insert into book_holds (id, qty, paid) values ($1, $2, true)
     on conflict (id) do update set paid = true`,
    [id, qty],
  );
  return qty;
}

function rpiOrder(session: Session, quantity: number) {
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
        sku: sku(),
        quantity,
        itemDescription: `${BOOK.title}: ${BOOK.edition} (${BOOK_PAGES}pp)`,
        product: { coverUrl: cover || undefined, gutsUrl: guts || undefined, pageCount: BOOK_PAGES },
      },
    ],
  };
}

export async function handleBookWebhook(request: Request) {
  loadDotEnv();
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
  const quantity = await markPaid(session);
  const order = rpiOrder(session, quantity);
  if (process.env.RPI_LIVE_ORDERS !== "true" || !process.env.RPI_API_AUTH?.trim()) {
    return Response.json({ dryRun: true, quantity });
  }
  const printed = await rpi("POST", "/orders/", order);
  return Response.json({ created: printed.status, quantity }, { status: printed.status < 300 ? 200 : 502 });
}

export async function handlePrinterWebhook(request: Request) {
  loadDotEnv();
  const secret = process.env.RPI_WEBHOOK_SECRET?.trim();
  const given = request.headers.get("x-rpi-signature") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!secret || given.trim() !== secret) return Response.json({ error: "bad signature" }, { status: 400 });
  return Response.json({ ok: true });
}
