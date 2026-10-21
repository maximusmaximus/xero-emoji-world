/** Xero Emoji art. https://github.com/maximusmaximus/xeroemoji — pinned release, CC BY-NC 4.0. */
export const XERO_REPO = "https://github.com/maximusmaximus/xeroemoji";
export const XERO_BASE = "https://cdn.jsdelivr.net/gh/maximusmaximus/xeroemoji@v1.0.0/";

const cache = new Map<string, HTMLImageElement>();

function loadXero(emoji: string): HTMLImageElement {
  const file = xeroFile(emoji);
  let img = cache.get(file);
  if (!img) {
    img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.src = xeroUrl(emoji);
    cache.set(file, img);
  }
  return img;
}

function ready(img: HTMLImageElement) {
  return img.complete && img.naturalWidth > 0;
}

export function xeroFile(emoji: string): string {
  const parts: string[] = [];
  for (const ch of emoji) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || cp === 0xfe0f) continue;
    parts.push(cp.toString(16).padStart(4, "0"));
  }
  return parts.join("-");
}

export function xeroUrl(emoji: string): string {
  return `${XERO_BASE}svg/${xeroFile(emoji)}.svg`;
}

/** Split text into plain runs and emoji runs (ZWJ sequences stay together). */
export function splitXero(text: string): { emoji: boolean; value: string }[] {
  const out: { emoji: boolean; value: string }[] = [];
  const re = /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E|\u200D\p{Extended_Pictographic})*/gu;
  let last = 0;
  for (const match of text.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > last) out.push({ emoji: false, value: text.slice(last, index) });
    out.push({ emoji: true, value: match[0] });
    last = index + match[0].length;
  }
  if (last < text.length) out.push({ emoji: false, value: text.slice(last) });
  return out;
}

export function drawXero(
  ctx: CanvasRenderingContext2D,
  emoji: string,
  x: number,
  y: number,
  size: number,
  pose?: { rotation?: number; flip?: boolean; anchor?: "center" | "feet"; squash?: number },
) {
  const img = loadXero(emoji);
  const anchor = pose?.anchor ?? "center";
  if (!ready(img)) {
    ctx.beginPath();
    ctx.fillStyle = "rgba(243, 234, 215, 0.2)";
    ctx.arc(x, y - (anchor === "feet" ? size * 0.45 : 0), size * 0.22, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  if (pose?.rotation) ctx.rotate(pose.rotation);
  if (pose?.flip) ctx.scale(-1, 1);
  // Squash along the car's own up-axis so the roof stays perpendicular to the lane and the wheels stay on it.
  if (pose?.squash && pose.squash !== 1) ctx.scale(1, pose.squash);
  const top = anchor === "feet" ? -size : -size / 2;
  ctx.drawImage(img, -size / 2, top, size, size);
  ctx.restore();
}

/** Map the glyph onto a parallelogram. p0 is the image top-left, p1 the top-right, p3 the bottom-left. */
export function drawXeroOnto(
  ctx: CanvasRenderingContext2D,
  emoji: string,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p3: { x: number; y: number },
) {
  const img = loadXero(emoji);
  if (!ready(img)) return;
  ctx.save();
  ctx.transform(p1.x - p0.x, p1.y - p0.y, p3.x - p0.x, p3.y - p0.y, p0.x, p0.y);
  ctx.drawImage(img, 0, 0, 1, 1);
  ctx.restore();
}
