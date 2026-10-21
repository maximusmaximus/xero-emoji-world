import { BODY_VARIANTS, CATALOG_COUNT, DISTINCT_BODIES, SHOWCASE_OBJECTS } from "./catalog.data.ts";

export { CATALOG_COUNT, DISTINCT_BODIES };

/** Full bodies first, then enough of the collection to cover 15% of every Xero emoji. */
export const SHOWCASE = [...DISTINCT_BODIES, ...BODY_VARIANTS, ...SHOWCASE_OBJECTS];

const BODIES = new Set<string>([...DISTINCT_BODIES, ...BODY_VARIANTS]);

export function isBody(emoji: string) {
  return BODIES.has(emoji) || BODIES.has(emoji.replace(/\uFE0F/g, ""));
}

export type Spot = { emoji: string; x: number; y: number; size: number; hero: boolean };

/** Places the whole showcase inside the canvas. Heroes are large whole bodies along the front. */
export function showcaseSpots(width: number, height: number): Spot[] {
  const spots: Spot[] = [];
  const margin = 8;
  const large = width < 720 ? 22 : 32;
  const step = large + 3;
  const cols = Math.max(4, Math.floor((width - margin * 2) / step));
  const heroRows = Math.ceil(DISTINCT_BODIES.length / cols);
  DISTINCT_BODIES.forEach((emoji, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    spots.push({
      emoji,
      x: margin + col * step + large / 2,
      y: height - 26 - large / 2 - (heroRows - 1 - row) * step,
      size: large,
      hero: true,
    });
  });
  const rest = [...BODY_VARIANTS, ...SHOWCASE_OBJECTS];
  const skyTop = 128;
  const skyBottom = Math.max(skyTop + 20, height - 26 - heroRows * step - 10);
  let size = width < 720 ? 12 : 15;
  let gap = size + 2;
  let skyCols = Math.max(4, Math.floor((width - margin * 2) / gap));
  while (size > 9 && Math.ceil(rest.length / skyCols) * gap > skyBottom - skyTop) {
    size -= 1;
    gap = size + 1;
    skyCols = Math.max(4, Math.floor((width - margin * 2) / gap));
  }
  rest.forEach((emoji, index) => {
    const col = index % skyCols;
    const row = Math.floor(index / skyCols);
    spots.push({
      emoji,
      x: margin + (col % skyCols) * gap + size / 2,
      y: skyTop + (row % Math.max(1, Math.floor((skyBottom - skyTop) / gap))) * gap + size / 2,
      size,
      hero: false,
    });
  });
  return spots;
}
