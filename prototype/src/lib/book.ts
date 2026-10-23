/** Xero Emoji specimen book. Artwork comes from xeroemojibook-preview. Secrets stay in env. */

export const BOOK_SKU = "BKPH_HCIW_STD_11.750x11.750IN_80C_GL_40_100T_GLS_44";
export const BOOK_PAGES = 530;
export const BOOK_PRICE_CENTS = 18569;
export const DAILY_ORDER_CAP = 50;
export const HOLD_MS = 45 * 60 * 1000;

export const BOOK = {
  title: "Xero Emoji",
  edition: "V1.0.0 Specimen Guide",
  years: "2016–2026",
  pages: BOOK_PAGES,
  size: "11.75 × 11.75 in",
  binding: "Hardcover",
  blurb:
    "A 530-page walk through a city built entirely of Xero Emoji. All 3,963 emoji of Unicode 18.0, drawn by Max Infeld and left unchanged inside the scenes.",
};

const IMG = "https://cdn.jsdelivr.net/gh/maximusmaximus/xeroemojibook-preview@main/public/img";

export type BookSpread = { id: string; caption: string; alt: string; thumb: string; full: string };

function spread(id: string, caption: string, alt: string): BookSpread {
  const stem = id === "cover" ? "cover" : id;
  const small = id === "cover" ? 480 : 432;
  const mid = id === "cover" ? 960 : 864;
  return {
    id,
    caption,
    alt,
    thumb: `${IMG}/${stem}-${small}.webp`,
    full: `${IMG}/${stem}-${id === "cover" ? 1600 : mid}.webp`,
  };
}

export const SPREADS: BookSpread[] = [
  spread("cover", "Cover", "Front cover of Xero Emoji: V1.0.0 Specimen Guide"),
  spread("p001", "Half-title", "Page 1, half-title"),
  spread("p002", "Frontispiece", "Page 2, frontispiece"),
  spread("p003", "Title", "Page 3, title page"),
  spread("p006", "Contents", "Page 6, contents"),
  spread("p090", "Page 90", "Page 90"),
  spread("p260", "Page 260", "Page 260"),
  spread("p430", "Page 430", "Page 430"),
  spread("p480", "Page 480", "Page 480"),
];

export type ShopEnv = {
  STRIPE_SECRET_KEY?: string;
  ALLOW_LIVE_STRIPE?: string;
  BOOK_PRICE_CENTS?: string;
  BOOK_CHECKOUT?: string;
  RPI_API_AUTH?: string;
  RPI_LIVE_ORDERS?: string;
  STRIPE_WEBHOOK_SECRET?: string;
};

export function bookPrice(env: ShopEnv) {
  const parsed = Number(env.BOOK_PRICE_CENTS);
  if (Number.isFinite(parsed) && parsed >= 50) return Math.round(parsed);
  return BOOK_PRICE_CENTS;
}

/** What the shop still needs before a card can be taken. Names only, never values. */
export function shopGaps(env: ShopEnv) {
  const price = bookPrice(env);
  const stripe = env.STRIPE_SECRET_KEY?.trim() ?? "";
  const live = stripe.startsWith("sk_live_") || stripe.startsWith("rk_live_");
  const test = stripe.startsWith("sk_test_") || stripe.startsWith("rk_test_");
  const missing: string[] = [];
  if (env.BOOK_CHECKOUT === "false") missing.push("BOOK_CHECKOUT");
  if (!stripe) missing.push("STRIPE_SECRET_KEY");
  else if (live && env.ALLOW_LIVE_STRIPE !== "true") missing.push("ALLOW_LIVE_STRIPE");
  else if (!live && !test) missing.push("STRIPE_SECRET_KEY");
  return {
    ready: missing.length === 0,
    missing,
    priceCents: price,
    canPrint: env.RPI_LIVE_ORDERS === "true" && Boolean(env.RPI_API_AUTH?.trim()),
    hasPrinter: Boolean(env.RPI_API_AUTH?.trim()),
    hasWebhook: Boolean(env.STRIPE_WEBHOOK_SECRET?.trim()),
  };
}

export function money(cents: number) {
  if (!cents) return "";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export type Hold = { id: string; qty: number; at: number; paid: boolean };

export function dayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function liveHolds(holds: Hold[], now: number, day: string, ledgerDay: string) {
  if (ledgerDay !== day) return [];
  return holds.filter((hold) => hold.paid || now - hold.at < HOLD_MS);
}

export function remainingToday(holds: Hold[], now: number, day: string, ledgerDay: string) {
  const used = liveHolds(holds, now, day, ledgerDay).reduce((sum, hold) => sum + hold.qty, 0);
  return Math.max(0, DAILY_ORDER_CAP - used);
}

/** Quantity the cart may hold. Zero means the day is sold out. */
export function clampCart(qty: number, remaining: number) {
  const left = Math.max(0, Math.min(DAILY_ORDER_CAP, Math.floor(remaining)));
  if (left < 1) return 0;
  const asked = Math.floor(Number(qty));
  if (!Number.isFinite(asked)) return 1;
  return Math.max(1, Math.min(left, asked));
}

export function bookFrame(width: number) {
  if (width < 640) return "phone" as const;
  if (width < 1024) return "tablet" as const;
  return "desk" as const;
}
