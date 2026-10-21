import { BODY_VARIANTS, CATALOG_COUNT, DISTINCT_BODIES, SHOWCASE_OBJECTS } from "./catalog.data.ts";

export { CATALOG_COUNT, DISTINCT_BODIES };

/** Full bodies first, then enough of the collection to cover 15% of every Xero emoji. */
export const SHOWCASE = [...DISTINCT_BODIES, ...BODY_VARIANTS, ...SHOWCASE_OBJECTS];

const BODIES = new Set<string>([...DISTINCT_BODIES, ...BODY_VARIANTS]);

export function isBody(emoji: string) {
  return BODIES.has(emoji) || BODIES.has(emoji.replace(/\uFE0F/g, ""));
}

export type Spot = { emoji: string; x: number; y: number; size: number; hero: boolean };

/** How many extra glyphs a frame may draw. Enough to show bodies, not enough to stall. */
export const FRAME_CAST = 18;

/** One row of large whole bodies. The rest of the collection stays unloaded until it rotates in. */
export function frameCast(width: number, height: number, phase: number): Spot[] {
  const size = width < 720 ? 26 : 34;
  const step = size + 8;
  const count = Math.max(4, Math.min(FRAME_CAST, Math.floor((width - 16) / step)));
  const shift = Math.floor(Math.max(0, phase) / 120) % DISTINCT_BODIES.length;
  const spots: Spot[] = [];
  for (let index = 0; index < count; index++) {
    spots.push({
      emoji: DISTINCT_BODIES[(shift + index) % DISTINCT_BODIES.length]!,
      x: 10 + index * step + size / 2,
      y: height - 20 - size / 2,
      size,
      hero: true,
    });
  }
  return spots;
}
