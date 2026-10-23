/** Xero Emoji specimen book. Artwork and page renders come from xeroemojibook-preview. */

export const BOOK_SKU = "BKPH_HCIW_STD_11.750x11.750IN_80C_MT_40_100T_GLS_44";
export const BOOK_PAGES = 530;

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

/** What the shop still needs before a card can be taken. Names only, never values. */
export function shopGaps(env: ShopEnv) {
  const price = Number(env.BOOK_PRICE_CENTS);
  const stripe = env.STRIPE_SECRET_KEY?.trim() ?? "";
  const live = stripe.startsWith("sk_live_");
  const test = stripe.startsWith("sk_test_");
  const missing: string[] = [];
  if (env.BOOK_CHECKOUT === "false") missing.push("BOOK_CHECKOUT");
  if (!Number.isFinite(price) || price < 50) missing.push("BOOK_PRICE_CENTS");
  if (!stripe) missing.push("STRIPE_SECRET_KEY");
  else if (live && env.ALLOW_LIVE_STRIPE !== "true") missing.push("ALLOW_LIVE_STRIPE");
  else if (!live && !test) missing.push("STRIPE_SECRET_KEY");
  return {
    ready: missing.length === 0,
    missing,
    priceCents: Number.isFinite(price) ? Math.round(price) : 0,
    canPrint: env.RPI_LIVE_ORDERS === "true" && Boolean(env.RPI_API_AUTH?.trim()),
    hasPrinter: Boolean(env.RPI_API_AUTH?.trim()),
    hasWebhook: Boolean(env.STRIPE_WEBHOOK_SECRET?.trim()),
  };
}

export function money(cents: number) {
  if (!cents) return "";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
